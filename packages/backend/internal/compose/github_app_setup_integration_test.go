package compose

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/identity"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/githubfake"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/webhook"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

func githubAppSetupComposeRouter(cfg *config.Config, pool *pgxpool.Pool, h *routes.GitHubAppSetupHandler, webhookHandlers ...*routes.GitHubWebhookHandler) http.Handler {
	// Repo/search/Git placeholders are unused by setup requests. The router's
	// broad constructor requires them to mount unrelated routes; setup itself
	// uses real PostgreSQL, AuthLoader, credential store, and githubfake.
	options := []any{routerExtras{GitHubAppSetup: h}}
	if len(webhookHandlers) > 0 {
		options = append(options, webhookHandlers[0])
	}
	return buildRouterCompat(
		cfg, db.New(pool), pool,
		&routes.RepoHandler{}, &routes.AuthHandler{AuthConfig: cfg.Auth, AllowedOrigins: cfg.Server.AllowedOrigins, Setup: services.NewMemberService(pool, nil)}, &routes.UserHandler{}, &routes.SSHKeyHandler{}, &routes.LabelHandler{},
		&routes.OrgHandler{}, &routes.LandingHandler{}, &routes.SearchHandler{Service: &mockRouterSearchService{}}, &routes.IssueHandler{},
		nil, &routes.GitSmartHandler{Service: &mockRouterGitService{}},
		nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil,
		nil, nil, nil, nil, nil, nil,
		&routes.WorkspaceHandler{}, nil, nil, nil, nil, nil, nil,
		options...,
	)
}

// Two real listeners use the assembled auth, CSRF, and routing chain. Both
// share the product database, as loopback and configured network access do.
func TestGitHubAppSetupAuthorityOnEveryListenerPostgres(t *testing.T) {
	// Literal fixtures from C-GH-01 and spec §5.1.0/§16.2.1, not implementation-derived expectations.
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	codec, err := webhook.NewSecretCodec("setup-listener-install-key")
	require.NoError(t, err)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	privateKey := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	fake, err := githubfake.New(githubfake.Config{AppID: 42, Slug: "listener-test", OwnerLogin: "acme", OwnerKind: "org", ClientID: "client", ClientSecret: "secret", WebhookSecret: "webhook", PrivateKeyPEM: privateKey, ConversionCode: "manifest-code", Installations: []githubfake.Installation{{ID: 91, Repositories: []githubfake.Repository{{ID: 1, FullName: "acme/app"}}}}})
	require.NoError(t, err)
	t.Cleanup(fake.Close)
	local := httptest.NewUnstartedServer(nil)
	network := httptest.NewUnstartedServer(nil)
	origins := []string{"http://" + local.Listener.Addr().String(), "https://" + network.Listener.Addr().String()}
	store := services.NewGitHubAppCredentialStore(pool, codec)
	setupToken := "setup-token"
	tokenDigest := sha256.Sum256([]byte("setup-token"))
	require.NoError(t, q.PutInstallSetting(ctx, db.PutInstallSettingParams{Key: "setup_token", Value: []byte(`{"digest":"` + hex.EncodeToString(tokenDigest[:]) + `"}`)}))
	sessions := &services.InstallSetupSessions{Pool: pool}
	h := &routes.GitHubAppSetupHandler{Service: services.NewGitHubAppManifestService(pool, store, fake.URL, origins), Store: store, Owners: q, Sessions: sessions, AllowedOrigins: origins}
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = "selfhost"
	cfg.Server.PublicURL = origins[0]
	cfg.Server.AllowedOrigins = origins
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })
	router := githubAppSetupComposeRouter(cfg, pool, h)
	local.Config.Handler = router
	network.Config.Handler = router
	local.Start()
	network.StartTLS()
	t.Cleanup(local.Close)
	t.Cleanup(network.Close)
	local.Client().CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	network.Client().CheckRedirect = local.Client().CheckRedirect
	request := func(server *httptest.Server, method, path string, cookies []*http.Cookie, origin bool) (int, []byte, []*http.Cookie) {
		t.Helper()
		var body io.Reader
		if path == "/api/install/setup-session" {
			body = strings.NewReader(`{"token":"` + setupToken + `"}`)
		} else if method == "POST" {
			body = strings.NewReader(`{"owner_login":"acme","owner_kind":"org","repository":"app"}`)
		}
		req, err := http.NewRequest(method, server.URL+path, body)
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Smithers-Setup-Token", "setup-token") // raw token is not step authority
		for _, cookie := range cookies {
			req.AddCookie(cookie)
			if cookie.Name == middleware.CSRFCookieName {
				req.Header.Set("X-CSRF-Token", cookie.Value)
			}
		}
		if origin {
			req.Header.Set("Origin", server.URL)
		}
		resp, err := server.Client().Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		return resp.StatusCode, data, resp.Cookies()
	}
	var live []*http.Cookie
	var attempt services.GitHubAppManifestStart
	for i, server := range []*httptest.Server{local, network} {
		if i > 0 {
			setupToken, err = services.MintSetupToken(ctx, q)
			require.NoError(t, err)
		}
		for _, path := range []string{"/api/install", "/api/install/setup/app_manifest"} {
			method := "GET"
			if strings.Contains(path, "setup") {
				method = "POST"
			}
			status, _, _ := request(server, method, path, nil, true)
			require.Equal(t, 401, status)
		}
		status, _, cookies := request(server, "POST", "/api/install/setup-session", nil, false)
		require.Equal(t, 204, status)
		require.Len(t, cookies, 1)
		require.Equal(t, "/", cookies[0].Path)
		require.Equal(t, http.SameSiteLaxMode, cookies[0].SameSite)
		require.Equal(t, i == 1, cookies[0].Secure)
		status, _, csrfCookies := request(server, "GET", "/api/install", cookies, false)
		cookies = append(cookies, csrfCookies...)
		require.Equal(t, 200, status)
		status, body, stateCookies := request(server, "POST", "/api/install/setup/app_manifest", cookies, true)
		if i == 0 {
			require.Equal(t, 200, status, string(body))
			require.NoError(t, json.Unmarshal(body, &attempt))
			live = append(cookies, stateCookies...)
		} else {
			require.Equal(t, 409, status, string(body))
		}
		status, _, _ = request(server, "POST", "/api/install/setup/github_app", cookies, true)
		require.Equal(t, 403, status) // spec §5.1.0: live setup denies non-allowlisted routes
	}
	require.Empty(t, fake.Writes())
	// Durable session deletion, expiration and claim fence refuse before exchange.
	callback := "/setup/github/callback?code=manifest-code&state=" + attempt.State
	session := live[0].Value
	sessionKey := "setup.session." + services.GitHubAppStateDigest(session)
	_, err = pool.Exec(ctx, `UPDATE install_settings SET updated_at='2000-01-01T00:00:00Z' WHERE key=$1`, sessionKey)
	require.NoError(t, err)
	status, _, _ := request(local, "GET", callback, live, false)
	require.Equal(t, 401, status)
	require.Empty(t, fake.Writes())
	_, err = pool.Exec(ctx, `UPDATE install_settings SET updated_at=now() WHERE key=$1`, sessionKey)
	require.NoError(t, err)
	// A session deleted by the shared claim lifecycle cannot be revived by its cookie.
	_, err = pool.Exec(ctx, `DELETE FROM install_settings WHERE key=$1`, sessionKey)
	require.NoError(t, err)
	status, _, _ = request(local, "GET", callback, live, false)
	require.Equal(t, 401, status)
	require.Empty(t, fake.Writes())
	_, err = pool.Exec(ctx, `INSERT INTO install_settings(key,value) VALUES($1,jsonb_build_object('expires_at',now()+interval '24 hours'))`, sessionKey)
	require.NoError(t, err)
	foreign := append([]*http.Cookie(nil), live...)
	foreign[0] = &http.Cookie{Name: routes.GitHubAppSetupSessionCookie, Value: strings.Repeat("f", 64)}
	status, _, _ = request(local, "GET", callback, foreign, false)
	require.Equal(t, 401, status)
	require.Empty(t, fake.Writes())
	status, _, _ = request(network, "GET", callback, live, false)
	require.Equal(t, 403, status)
	require.Empty(t, fake.Writes())
	// One conversion completes all durable local projections; replay never exchanges.
	status, _, _ = request(local, "GET", callback, live, false)
	require.Equal(t, 303, status)
	require.Len(t, fake.Writes(), 1)
	for _, key := range []string{"setup.step.app_manifest", "setup.projection.app_manifest"} {
		var state string
		require.NoError(t, pool.QueryRow(ctx, `SELECT value->>'status' FROM install_settings WHERE key=$1`, key).Scan(&state))
		require.Equal(t, "done", state)
	}
	status, _, _ = request(local, "GET", callback, live, false)
	require.Equal(t, 409, status)
	require.Len(t, fake.Writes(), 1)
	// Installation uses the committed repository, with no conversion cookie/state,
	// even after the conversion attempt expired and redirect supplied a foreign id.
	_, err = pool.Exec(ctx, `UPDATE github_app_manifest_states SET expires_at=now()-interval '1 second'`)
	require.NoError(t, err)
	status, body, _ := request(local, "GET", "/setup/github/installed?installation_id=999", live[:2], false)
	require.Equal(t, 200, status, string(body))
	loaded, err := store.Load(ctx)
	require.NoError(t, err)
	require.EqualValues(t, 91, loaded.InstallationID)
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "setup-owner", LowerUsername: "setup-owner"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `WITH o AS (INSERT INTO self_host_owners(user_id) VALUES($1)) INSERT INTO collaborators(user_id,github_user_id,permission) VALUES($1,$1,'admin')`, owner.ID)
	require.NoError(t, err)
	status, _, _ = request(local, "GET", callback, live, false)
	require.Equal(t, 401, status)
	require.Len(t, fake.Writes(), 2)
	require.NotContains(t, logs.String(), attempt.State)
	require.NotContains(t, logs.String(), "manifest-code")
	require.NotContains(t, logs.String(), "setup-token")
}

func TestGitHubAppSetupRejectsUnusedTokenCORSPreflight(t *testing.T) {
	cfg := testConfigAllFlagsOn()
	cfg.Server.AllowedOrigins = []string{"https://setup.example"}
	router := githubAppSetupComposeRouter(cfg, nil, &routes.GitHubAppSetupHandler{})
	r := httptest.NewRequest(http.MethodOptions, "http://localhost:4000/api/install/setup/app_manifest", nil)
	r.Header.Set("Origin", "https://setup.example")
	r.Header.Set("Access-Control-Request-Method", http.MethodPost)
	r.Header.Set("Access-Control-Request-Headers", "Content-Type, X-Smithers-Setup-Token")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, r)
	require.Equal(t, http.StatusOK, w.Code)
	require.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
	require.Empty(t, w.Header().Get("Access-Control-Allow-Headers"))
}

func TestGitHubAppLegacyEnvironmentIgnoredByCompositionPostgres(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	codec, err := webhook.NewSecretCodec("legacy-env-install-key")
	require.NoError(t, err)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	pemKey := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	const installationID int64 = 900104987
	fake, err := githubfake.New(githubfake.Config{AppID: 54104, Slug: "stored-team", OwnerLogin: "acme", OwnerKind: "org", PrivateKeyPEM: pemKey, ClientID: "stored-client", ClientSecret: "stored-client-secret", WebhookSecret: "stored-webhook-secret", Installations: []githubfake.Installation{{ID: installationID}}})
	require.NoError(t, err)
	t.Cleanup(fake.Close)
	for name, value := range map[string]string{
		"SMITHERS_GITHUB_APP_ID": "999999", "SMITHERS_GITHUB_APP_PRIVATE_KEY": "invalid-legacy-private-key",
		"SMITHERS_GITHUB_APP_INSTALL_URL": "https://legacy.invalid/install", "SMITHERS_GITHUB_APP_PERMISSIONS_URL": "https://legacy.invalid/permissions",
		"SMITHERS_WEBHOOK_GITHUB_APP_SECRET": "legacy-webhook-secret", "SMITHERS_GITHUB_APP_API_BASE_URL": fake.URL,
		"SMITHERS_AUTH_GITHUB_CLIENT_ID": "legacy-oauth-client", "SMITHERS_AUTH_GITHUB_CLIENT_SECRET": "legacy-oauth-secret",
	} {
		t.Setenv(name, value)
	}
	store := services.NewGitHubAppCredentialStore(pool, codec)
	_, oauthClient, err := buildAuthProviders(config.AuthConfig{GitHubRedirectURL: "http://localhost:4000/api/auth/github/callback"}, store)
	require.NoError(t, err)
	require.NotNil(t, oauthClient)
	_, err = oauthClient.AuthorizationURL(ctx, "before-setup")
	require.ErrorIs(t, err, services.ErrGitHubAppNotConfigured, "legacy OAuth env must not enable an unconfigured install")
	require.NoError(t, store.Save(ctx, services.GitHubAppCredentials{ID: 54104, Slug: "stored-team", OwnerLogin: "acme", OwnerKind: "org", PEM: pemKey, ClientID: "stored-client", ClientSecret: "stored-client-secret", WebhookSecret: "stored-webhook-secret", InstallationID: installationID}))
	authorizationURL, err := oauthClient.AuthorizationURL(ctx, "after-setup")
	require.NoError(t, err, "the existing composed OAuth client must reload newly created App credentials")
	parsedAuthorization, err := url.Parse(authorizationURL)
	require.NoError(t, err)
	require.Equal(t, "stored-client", parsedAuthorization.Query().Get("client_id"))
	require.Equal(t, "after-setup", parsedAuthorization.Query().Get("state"))
	require.NotContains(t, authorizationURL, "legacy")
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "stored-app-owner", LowerUsername: "stored-app-owner"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `WITH o AS (INSERT INTO self_host_owners(user_id) VALUES($1)) INSERT INTO collaborators(user_id,github_user_id,permission) VALUES($1,$1,'admin')`, owner.ID)
	require.NoError(t, err)
	persistedOwner, err := q.GetInstallOwnerUser(ctx)
	require.NoError(t, err)
	require.Equal(t, owner.ID, persistedOwner.ID)
	require.NoError(t, q.MarkMemberAccessChecked(ctx, func() int64 { m, e := q.GetInstallOwner(ctx); require.NoError(t, e); return m.ID }()))
	const session = "stored-app-owner-browser-session"
	sessionHash := sha256.Sum256([]byte(session))
	_, err = q.CreateAuthSession(ctx, db.CreateAuthSessionParams{SessionKey: hex.EncodeToString(sessionHash[:]), UserID: owner.ID, Username: owner.Username, ExpiresAt: time.Now().Add(time.Hour)})
	require.NoError(t, err)
	server := httptest.NewUnstartedServer(nil)
	origin := "http://" + server.Listener.Addr().String()
	require.NoError(t, store.SaveCallbackURLs(ctx, []string{origin + "/api/auth/github/callback", "http://localhost:4000/api/auth/github/callback"}))
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode, cfg.Server.PublicURL, cfg.Server.AllowedOrigins = "selfhost", origin, []string{origin}
	h := &routes.GitHubAppSetupHandler{Store: store, Owners: q, AllowedOrigins: []string{origin}}
	server.Config.Handler = githubAppSetupComposeRouter(cfg, pool, h, &routes.GitHubWebhookHandler{Service: services.NewGitHubWebhookService(pool, store)})
	server.Start()
	t.Cleanup(server.Close)
	statusRequest := func() []byte {
		req, err := http.NewRequest(http.MethodGet, server.URL+"/api/install", nil)
		require.NoError(t, err)
		req.AddCookie(&http.Cookie{Name: "smithers_session", Value: session})
		resp, err := server.Client().Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode, string(body))
		return body
	}
	body := statusRequest()
	require.Contains(t, string(body), `"install_url":"https://github.com/apps/stored-team/installations/new"`)
	require.Contains(t, string(body), `"callback_fixes":[]`)
	require.NotContains(t, string(body), "legacy")
	// Changing configured access origins reports the exact manual registration
	// without silently claiming GitHub was updated or rewriting the snapshot.
	h.AllowedOrigins = append(h.AllowedOrigins, "https://added.example:8443")
	body = statusRequest()
	require.Contains(t, string(body), `"callback_fixes":[{"settings_url":"https://github.com/organizations/acme/settings/apps/stored-team","add_url":"https://added.example:8443/api/auth/github/callback"}]`)
	recorded, err := store.CallbackURLs(ctx)
	require.NoError(t, err)
	require.Equal(t, []string{origin + "/api/auth/github/callback", "http://localhost:4000/api/auth/github/callback"}, recorded)
	caller := services.NewRepoConnectionService(pool, store)
	status, err := caller.GetGitHubAppStatus(ctx, persistedOwner.ID, "acme", "app")
	require.NoError(t, err)
	require.True(t, status.GitHubAppConfigured)
	require.Equal(t, "https://github.com/apps/stored-team/installations/new", status.InstallURL)
	token, err := caller.CreateGitHubInstallationTokenForInternalInstallation(ctx, installationID)
	require.NoError(t, err, "fake verifies JWT App ID and signature against the stored App")
	require.NotEmpty(t, token.Token)
	require.Len(t, fake.Writes(), 1)
	require.Equal(t, http.StatusCreated, fake.Writes()[0].Status)
	require.Equal(t, "/app/installations/900104987/access_tokens", fake.Writes()[0].Path)
	payload := []byte(`{"action":"created","installation":{"id":900104987,"repository_selection":"selected","account":{"login":"acme","type":"Organization"}},"repositories":[{"id":1001,"name":"app","full_name":"acme/app","private":true,"owner":{"login":"acme"}}]}`)
	for _, secret := range []string{"legacy-webhook-secret", "stored-webhook-secret"} {
		mac := hmac.New(sha256.New, []byte(secret))
		_, err := mac.Write(payload)
		require.NoError(t, err)
		req, err := http.NewRequest(http.MethodPost, server.URL+"/webhooks/github", bytes.NewReader(payload))
		require.NoError(t, err)
		req.Header.Set("X-GitHub-Event", "installation")
		req.Header.Set("X-GitHub-Delivery", uuid.NewString())
		req.Header.Set("X-Hub-Signature-256", "sha256="+hex.EncodeToString(mac.Sum(nil)))
		resp, err := server.Client().Do(req)
		require.NoError(t, err)
		resp.Body.Close()
		want := http.StatusOK
		if secret == "legacy-webhook-secret" {
			want = http.StatusUnauthorized
		}
		require.Equal(t, want, resp.StatusCode, secret)
	}
	var fullName string
	require.NoError(t, pool.QueryRow(ctx, `SELECT owner_login || '/' || repo_name FROM github_app_installation_repositories WHERE installation_id=$1`, installationID).Scan(&fullName))
	require.Equal(t, "acme/app", fullName, "accepted stored-secret delivery persisted real installation mapping")
}

func TestGitHubAppSetupOriginUsesSocketPeerThroughRouterPostgres(t *testing.T) {
	// §16.3.3: production RealIP must not change forwarding authority.
	cfg := testConfigAllFlagsOn()
	cfg.Server.TrustedProxyHops = 1
	cfg.Server.AllowedOrigins = []string{"https://box.example"}
	pool, _ := postgresfixture.NewProductDatabase(t)
	router := githubAppSetupComposeRouter(cfg, pool, &routes.GitHubAppSetupHandler{AllowedOrigins: cfg.Server.AllowedOrigins})
	r := httptest.NewRequest(http.MethodGet, "http://backend.internal/api/install", nil)
	r.RemoteAddr = "192.0.2.1:1234"
	r.Header.Set("X-Forwarded-For", "127.0.0.1, 192.0.2.9")
	r.Header.Set("X-Forwarded-Host", "box.example")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, r)
	require.Equal(t, http.StatusMisdirectedRequest, w.Code)
	require.Contains(t, w.Body.String(), "unknown_origin")
}

// Spec §5.1.0 / upgrade recovery: an owner without a linked GitHub ID is
// unclaimed and may use the setup session to configure the App before sign-in.
func TestUnlinkedUpgradedOwnerCanUseAppSetupSession(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "password-owner", LowerUsername: "password-owner"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `WITH o AS (INSERT INTO self_host_owners(user_id) VALUES($1)) INSERT INTO collaborators(user_id,permission) VALUES($1,'admin')`, owner.ID)
	require.NoError(t, err)
	token, err := services.MintSetupToken(ctx, q)
	require.NoError(t, err)
	codec, err := webhook.NewSecretCodec("unlinked-owner-app-setup-key")
	require.NoError(t, err)
	server := httptest.NewUnstartedServer(nil)
	origin := "http://" + server.Listener.Addr().String()
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = "selfhost"
	cfg.Server.PublicURL = origin
	cfg.Server.AllowedOrigins = []string{origin}
	handler := &routes.GitHubAppSetupHandler{Owners: q, Sessions: &services.InstallSetupSessions{Pool: pool}, Store: services.NewGitHubAppCredentialStore(pool, codec), AllowedOrigins: []string{origin}}
	server.Config.Handler = githubAppSetupComposeRouter(cfg, pool, handler)
	server.Start()
	t.Cleanup(server.Close)
	request, err := http.NewRequest(http.MethodPost, origin+"/api/install/setup-session", strings.NewReader(`{"token":"`+token+`"}`))
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/json")
	response, err := server.Client().Do(request)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, response.StatusCode)
	cookies := response.Cookies()
	response.Body.Close()
	require.Len(t, cookies, 1)
	request, err = http.NewRequest(http.MethodGet, origin+"/api/install", nil)
	require.NoError(t, err)
	request.AddCookie(cookies[0])
	response, err = server.Client().Do(request)
	require.NoError(t, err)
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, response.StatusCode, string(body))
	require.Contains(t, string(body), `"configured":false`)
	ownerMember, err := q.GetInstallOwner(ctx)
	require.NoError(t, err)
	require.Equal(t, owner.ID, ownerMember.UserID)
	require.False(t, ownerMember.GithubUserID.Valid, "App setup does not link or promote the owner")
	require.False(t, ownerMember.Verified)
}

// The claim invalidates setup cookies; the claimed browser session must finish
// App setup through the real member boundary, state consumption and sealed store.
func TestClaimedOwnerCompletesGitHubAppManifest(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	codec, err := webhook.NewSecretCodec("claimed-owner-manifest-key")
	require.NoError(t, err)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	pemKey := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	fake, err := githubfake.New(githubfake.Config{AppID: 42, Slug: "claimed-test", OwnerLogin: "acme", OwnerKind: "org", ClientID: "client", ClientSecret: "secret", WebhookSecret: "webhook", PrivateKeyPEM: pemKey, ConversionCode: "manifest-code"})
	require.NoError(t, err)
	t.Cleanup(fake.Close)
	token, err := services.MintSetupToken(ctx, q)
	require.NoError(t, err)
	authority := &services.InstallSetupSessions{Pool: pool}
	setup, err := authority.Exchange(ctx, token)
	require.NoError(t, err)
	const browser = "claimed-owner-browser"
	digest := sha256.Sum256([]byte(browser))
	owner, err := services.NewMemberService(pool, nil).AdmitSignIn(ctx, services.GitHubSignIn{GitHubUserID: 77, Login: "owner", SetupSessionKey: services.SetupSessionKey(setup), CompleteClaim: func(ctx context.Context, tx *db.Queries, u db.User) error {
		_, e := tx.CreateAuthSession(ctx, db.CreateAuthSessionParams{SessionKey: hex.EncodeToString(digest[:]), UserID: u.ID, Username: u.Username, ExpiresAt: time.Now().Add(time.Hour)})
		return e
	}})
	require.NoError(t, err)
	require.Error(t, authority.Validate(ctx, setup))
	store := services.NewGitHubAppCredentialStore(pool, codec)
	server := httptest.NewUnstartedServer(nil)
	origin := "http://" + server.Listener.Addr().String()
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = "selfhost"
	cfg.Server.PublicURL = origin
	cfg.Server.AllowedOrigins = []string{origin}
	h := &routes.GitHubAppSetupHandler{Owners: q, Sessions: authority, Store: store, Service: services.NewGitHubAppManifestService(pool, store, fake.URL, []string{origin}), AllowedOrigins: []string{origin}}
	server.Config.Handler = githubAppSetupComposeRouter(cfg, pool, h)
	server.Start()
	t.Cleanup(server.Close)
	server.Client().CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	call := func(method, path, principal, state string) (int, []byte, []*http.Cookie) {
		req, e := http.NewRequest(method, origin+path, strings.NewReader(`{"owner_login":"acme","owner_kind":"org","repository":"app"}`))
		require.NoError(t, e)
		req.AddCookie(&http.Cookie{Name: "smithers_session", Value: principal})
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "csrf"})
		req.Header.Set("X-CSRF-Token", "csrf")
		req.Header.Set("Origin", origin)
		req.Header.Set("Content-Type", "application/json")
		if state != "" {
			req.AddCookie(&http.Cookie{Name: routes.GitHubAppStateCookie, Value: state})
		}
		resp, e := server.Client().Do(req)
		require.NoError(t, e)
		defer resp.Body.Close()
		body, e := io.ReadAll(resp.Body)
		require.NoError(t, e)
		return resp.StatusCode, body, resp.Cookies()
	}
	status, body, _ := call("POST", "/api/install/setup/app_manifest", browser, "")
	require.Equal(t, 200, status, string(body))
	var start services.GitHubAppManifestStart
	require.NoError(t, json.Unmarshal(body, &start))
	require.NotEmpty(t, start.State)
	other, err := q.CreateUser(ctx, db.CreateUserParams{Username: "stranger", LowerUsername: "stranger"})
	require.NoError(t, err)
	foreignDigest := sha256.Sum256([]byte("foreign-browser"))
	_, err = q.CreateAuthSession(ctx, db.CreateAuthSessionParams{SessionKey: hex.EncodeToString(foreignDigest[:]), UserID: other.ID, Username: other.Username, ExpiresAt: time.Now().Add(time.Hour)})
	require.NoError(t, err)
	callback := "/setup/github/callback?code=manifest-code&state=" + start.State
	status, _, _ = call("GET", callback, "foreign-browser", start.State)
	require.Equal(t, 403, status)
	require.Empty(t, fake.Writes())
	status, _, _ = call("GET", callback, browser, "foreign-state")
	require.Equal(t, 403, status)
	require.Empty(t, fake.Writes())
	status, body, _ = call("GET", callback, browser, start.State)
	require.Equal(t, 303, status, string(body))
	require.Len(t, fake.Writes(), 1)
	loaded, err := store.Load(ctx)
	require.NoError(t, err)
	require.EqualValues(t, 42, loaded.ID)
	var sealed string
	require.NoError(t, pool.QueryRow(ctx, `SELECT client_secret_sealed FROM github_app`).Scan(&sealed))
	require.NotContains(t, sealed, "secret")
	status, _, _ = call("GET", callback, browser, start.State)
	require.Equal(t, 409, status)
	require.Len(t, fake.Writes(), 1)
	persisted, err := q.GetInstallOwnerUser(ctx)
	require.NoError(t, err)
	require.Equal(t, owner.ID, persisted.ID)
}

// Every registered GET remains behind the setup-cookie boundary, including
// reserved/internal routes and routes that might otherwise look like assets.
func TestSetupSessionScopeChiWalkRegisteredGETs(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	token, err := services.MintSetupToken(t.Context(), q)
	require.NoError(t, err)
	session, err := (&services.InstallSetupSessions{Pool: pool}).Exchange(t.Context(), token)
	require.NoError(t, err)
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = "selfhost"
	cfg.Server.PublicURL = "http://localhost:4000"
	router := githubAppSetupComposeRouter(cfg, pool, &routes.GitHubAppSetupHandler{Owners: q, Sessions: &services.InstallSetupSessions{Pool: pool}})
	routesTree, ok := router.(chi.Routes)
	require.True(t, ok)
	params := regexp.MustCompile(`\{[^}]+\}`)
	count := 0
	require.NoError(t, chi.Walk(routesTree, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method != "GET" && method != "HEAD" {
			return nil
		}
		path := params.ReplaceAllString(route, "1")
		path = strings.ReplaceAll(path, "*", "asset.js")
		if identity.IsPreClaimSetupRequest(method, path) {
			return nil
		}
		req := httptest.NewRequest(method, "http://localhost:4000"+path, nil)
		req.RemoteAddr = "127.0.0.1:1234"
		req.AddCookie(&http.Cookie{Name: services.SetupSessionCookieName, Value: session})
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, 403, w.Code, method+" "+route+" "+w.Body.String())
		require.Contains(t, w.Body.String(), `"code":"permission"`)
		count++
		return nil
	}))
	require.Greater(t, count, 100)
	// A later registered route under assets can never inherit the page exception.
	r := chi.NewRouter()
	r.Use(setupSessionScope(q, func(http.ResponseWriter, *http.Request) {}, r))
	for _, path := range []string{"/assets/privileged", "/assets/%61dmin"} {
		r.Get(path, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) })
	}
	for _, path := range []string{"/assets/privileged", "/assets/%61dmin"} {
		req := httptest.NewRequest("GET", path, nil)
		req.AddCookie(&http.Cookie{Name: services.SetupSessionCookieName, Value: session})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		require.Equal(t, 403, w.Code, path)
	}
}
