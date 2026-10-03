package compose

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/smithersai/smithers/packages/backend/db/product"
	"github.com/smithersai/smithers/packages/backend/operator"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/identity"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/webhook"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// These tests drive the install's GitHub sign-in end to end: the real
// composition on a real listener, real PostgreSQL, and an httptest GitHub
// standing in for github.com (OAuth web flow, GET /user, the App's
// installation token and the collaborator permission read).

// signInGitHub is the fake GitHub. Each person is a login with a numeric id
// and a repository permission; "502" makes the permission read fail.
type signInGitHub struct {
	server *httptest.Server
	mu     sync.Mutex
	people map[string]signInPerson
	log    []string
	// appKey verifies the App JWT on installation reads.
	appKey *rsa.PublicKey
	// installationDown makes the App's installation read fail with 502.
	installationDown    bool
	installationReached chan struct{}
	installationRelease chan struct{}
}

type signInPerson struct {
	id         int64
	permission string
	roleName   string
}

const (
	signInAppID          = 1234
	signInRepoOwner      = "acme"
	signInRepoName       = "widgets"
	signInInstallationID = 4242
	signInInstallToken   = "ghs-install-token"
)

func newSignInGitHub(t *testing.T) *signInGitHub {
	t.Helper()
	g := &signInGitHub{people: map[string]signInPerson{}}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /login/oauth/access_token", func(w http.ResponseWriter, r *http.Request) {
		login := strings.TrimPrefix(r.FormValue("code"), "code-")
		g.record("oauth exchange " + login)
		writeJSON(w, http.StatusOK, map[string]any{"access_token": "gho-" + login, "token_type": "bearer"})
	})
	mux.HandleFunc("GET /user", func(w http.ResponseWriter, r *http.Request) {
		login := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer gho-")
		person, ok := g.person(login)
		g.record("user " + login)
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"message": "Bad credentials"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": person.id, "login": login, "name": login})
	})
	mux.HandleFunc("GET /user/emails", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, []any{})
	})
	mux.HandleFunc("GET /repos/{owner}/{repo}/installation", func(w http.ResponseWriter, r *http.Request) {
		g.record("installation " + r.PathValue("owner") + "/" + r.PathValue("repo"))
		g.mu.Lock()
		down, key := g.installationDown, g.appKey
		reached, release := g.installationReached, g.installationRelease
		g.mu.Unlock()
		if reached != nil {
			close(reached)
			<-release
		}
		if !validAppJWT(key, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")) {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"message": "A JSON web token could not be decoded"})
			return
		}
		if down {
			writeJSON(w, http.StatusBadGateway, map[string]any{"message": "Server Error"})
			return
		}
		if r.PathValue("owner") != signInRepoOwner || r.PathValue("repo") != signInRepoName {
			writeJSON(w, http.StatusNotFound, map[string]any{"message": "Not Found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": signInInstallationID, "account": map[string]any{"login": signInRepoOwner, "type": "Organization"}})
	})
	mux.HandleFunc(fmt.Sprintf("POST /app/installations/%d/access_tokens", signInInstallationID), func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		g.record("installation token " + string(body))
		writeJSON(w, http.StatusCreated, map[string]any{"token": signInInstallToken, "expires_at": time.Now().Add(time.Hour).UTC().Format(time.RFC3339)})
	})
	mux.HandleFunc("GET /repos/{owner}/{repo}/collaborators/{login}/permission", func(w http.ResponseWriter, r *http.Request) {
		login := r.PathValue("login")
		g.record("permission " + login + " with " + r.Header.Get("Authorization"))
		if r.Header.Get("Authorization") != "Bearer "+signInInstallToken {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"message": "Bad credentials"})
			return
		}
		person, ok := g.person(login)
		switch {
		case !ok || person.permission == "none":
			writeJSON(w, http.StatusNotFound, map[string]any{"message": "Not Found"})
		case person.permission == "502":
			writeJSON(w, http.StatusBadGateway, map[string]any{"message": "Server Error"})
		default:
			writeJSON(w, http.StatusOK, map[string]any{"permission": person.permission, "role_name": person.roleName, "user": map[string]any{"id": person.id}})
		}
	})
	g.server = httptest.NewServer(mux)
	t.Cleanup(g.server.Close)
	return g
}

func (g *signInGitHub) set(login string, id int64, permission string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.people[login] = signInPerson{id: id, permission: permission, roleName: permission}
}

func (g *signInGitHub) person(login string) (signInPerson, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	person, ok := g.people[login]
	return person, ok
}

func (g *signInGitHub) record(line string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.log = append(g.log, line)
}

// validAppJWT checks an RS256 App JWT the way GitHub does: signed by the
// App's key and issued by its id.
func validAppJWT(key *rsa.PublicKey, token string) bool {
	parts := strings.Split(token, ".")
	if key == nil || len(parts) != 3 {
		return false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature) != nil {
		return false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	var claims struct {
		Issuer int64 `json:"iss"`
	}
	return json.Unmarshal(payload, &claims) == nil && claims.Issuer == signInAppID
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// signInInstall is one install served on one listener. restart stops and
// boots it again on the same database, as a host restart does.
type signInInstall struct {
	t          *testing.T
	origin     string
	listener   string
	pool       *pgxpool.Pool
	github     *signInGitHub
	setupToken string
	stdout     *lockedBuffer
	logs       *lockedBuffer
	bodies     *lockedBuffer
	stop       func()
	net        net.Listener
}

var setupURLLine = regexp.MustCompile(`(?m)^Setup URL: (\S+)/setup\?token=([A-Za-z0-9_-]+)$`)

// signInSetup shapes a fresh install before its first boot.
type signInSetup struct {
	// repository chooses acme/widgets in configuration (the thin path).
	repository bool
	listenAll  bool
	origins    func(string) string
	// seed writes rows before the first boot.
	seed func(pool *pgxpool.Pool)
}

// startSignInInstall boots a fresh install whose HTTP listener binds host,
// with the install's repository chosen in configuration.
func startSignInInstall(t *testing.T, host string) *signInInstall {
	return startSignInInstallWith(t, host, signInSetup{repository: true})
}

func startSignInInstallWith(t *testing.T, host string, setup signInSetup) *signInInstall {
	t.Helper()
	pool, databaseURL := postgresfixture.NewProductDatabase(t)
	if setup.seed != nil {
		setup.seed(pool)
	}
	github := newSignInGitHub(t)

	listenHost := host
	if setup.listenAll {
		listenHost = "0.0.0.0"
	}
	listener, err := net.Listen("tcp", net.JoinHostPort(listenHost, "0"))
	require.NoError(t, err)
	origin := "http://" + listener.Addr().String()
	if setup.listenAll {
		_, port, _ := net.SplitHostPort(listener.Addr().String())
		origin = "http://" + net.JoinHostPort(host, port)
	}
	allowedOrigins := origin
	if setup.origins != nil {
		allowedOrigins = setup.origins(origin)
	}

	repoHost := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(repoHost.Close)
	appKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	github.appKey = &appKey.PublicKey
	appPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(appKey)})
	repository := ""
	if setup.repository {
		repository = signInRepoOwner + "/" + signInRepoName
	}
	for name, value := range map[string]string{
		"SMITHERS_AUTH_MODE":                     "selfhost",
		"SMITHERS_DATABASE_URL":                  databaseURL,
		"SMITHERS_PUBLIC_URL":                    origin,
		"SMITHERS_SERVER_ADDR":                   listener.Addr().String(),
		"SMITHERS_SERVER_ALLOWED_ORIGINS":        allowedOrigins,
		"SMITHERS_SERVER_SHUTDOWN_TIMEOUT":       "10s",
		"SMITHERS_REPO_HOST_URL":                 repoHost.URL,
		"SMITHERS_REPO_HOST_AUTH_TOKEN":          "owner-signin-repo",
		"SMITHERS_PUSH_HOOK_CALLBACK_TOKEN":      "owner-signin-callback",
		"SMITHERS_AUTH_WORKER_EXCHANGE_TOKEN":    "owner-signin-worker",
		"SMITHERS_AUTH_SESSION_SECRET":           "owner-signin-session-secret",
		"SMITHERS_LFS_SIGNING_SECRET":            "owner-signin-lfs-secret",
		"SMITHERS_WEBHOOK_SECRET_ENCRYPTION_KEY": "owner-signin-webhook-key",
		"SMITHERS_AUTH_COOKIE_SECURE":            "false",
		"SMITHERS_AUTH_GITHUB_CLIENT_ID":         "Iv1.owner-signin",
		"SMITHERS_AUTH_GITHUB_CLIENT_SECRET":     "owner-signin-client-secret",
		"SMITHERS_AUTH_GITHUB_REDIRECT_URL":      origin + "/api/auth/github/callback",
		"SMITHERS_AUTH_GITHUB_OAUTH_BASE_URL":    github.server.URL,
		"SMITHERS_AUTH_GITHUB_API_BASE_URL":      github.server.URL,
		"SMITHERS_GITHUB_APP_ID":                 fmt.Sprint(signInAppID),
		"SMITHERS_GITHUB_APP_PRIVATE_KEY":        string(appPEM),
		"SMITHERS_GITHUB_APP_API_BASE_URL":       github.server.URL,
		"SMITHERS_GITHUB_APP_REPOSITORY":         repository,
		"SMITHERS_BLOB_DATA_DIR":                 t.TempDir(),
		"SMITHERS_FEATURE_FLAGS_WORKFLOWS":       "false",
		"SMITHERS_FEATURE_FLAGS_SANDBOXES":       "false",
		"SMITHERS_FEATURE_FLAGS_WORKSPACES":      "false",
		"SMITHERS_OTEL_EXPORTER":                 "none",
		"SMITHERS_METRICS_TOKEN":                 "owner-signin-metrics",
		"SMITHERS_METRICS_ADDR":                  "",
	} {
		t.Setenv(name, value)
	}
	preserveSlog(t)

	codec, err := webhook.NewSecretCodec("owner-signin-webhook-key")
	require.NoError(t, err)
	require.NoError(t, services.NewGitHubAppCredentialStore(pool, codec).Save(context.Background(), services.GitHubAppCredentials{ID: signInAppID, Slug: "owner-signin", OwnerLogin: signInRepoOwner, OwnerKind: "org", ClientID: "Iv1.owner-signin", ClientSecret: "owner-signin-client-secret", PEM: string(appPEM), WebhookSecret: "owner-signin-webhook"}))
	install := &signInInstall{t: t, origin: origin, listener: host, pool: pool, github: github,
		logs: &lockedBuffer{}, bodies: &lockedBuffer{}, net: listener}
	install.boot(repoHost.URL)
	t.Cleanup(func() { install.stop() })
	if match := setupURLLine.FindStringSubmatch(install.stdout.String()); match != nil {
		require.Equal(t, origin, match[1])
		install.setupToken = match[2]
	}
	return install
}

// boot starts the composition and serves it on the install's listener.
func (i *signInInstall) boot(repoHostURL string) {
	t := i.t
	t.Helper()
	i.stdout = &lockedBuffer{}
	ctx, cancel := context.WithCancel(context.Background())
	ready := make(chan http.Handler, 1)
	finished := make(chan struct{})
	var runErr error
	remote := repohost.NewClient(&repohost.StaticStorageSetResolver{URL: repoHostURL}, "owner-signin-repo")
	go func() {
		runErr = StartWithOptions(ctx, nil, i.stdout, i.logs, Options{Repository: remote},
			func(handler http.Handler) { ready <- handler })
		close(finished)
	}()
	var handler http.Handler
	select {
	case handler = <-ready:
	case <-finished:
		t.Fatalf("install stopped before ready: %v\n%s", runErr, i.logs.String())
	case <-time.After(60 * time.Second):
		t.Fatal("install did not become ready")
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	served := make(chan struct{})
	listener := i.net
	go func() { _ = server.Serve(listener); close(served) }()
	i.stop = func() {
		shutdown, stopShutdown := context.WithTimeout(context.Background(), 10*time.Second)
		defer stopShutdown()
		_ = server.Shutdown(shutdown)
		<-served
		cancel()
		select {
		case <-finished:
			require.NoError(t, runErr)
		case <-time.After(30 * time.Second):
			t.Error("install did not stop")
		}
		i.stop = func() {}
	}
}

// restart kills the install and boots it again on the same database and
// address. It answers the setup token the new boot printed, if any; the
// install keeps the last printed token for the secrecy checks.
func (i *signInInstall) restart() string {
	i.t.Helper()
	i.stop()
	listener, err := net.Listen("tcp", strings.TrimPrefix(i.origin, "http://"))
	require.NoError(i.t, err)
	i.net = listener
	i.boot(os.Getenv("SMITHERS_REPO_HOST_URL"))
	match := setupURLLine.FindStringSubmatch(i.stdout.String())
	if match == nil {
		return ""
	}
	i.setupToken = match[2]
	return match[2]
}

// signInResult is one browser sign-in attempt.
type signInResult struct {
	login   string
	status  int
	body    string
	session *http.Cookie
	browser *http.Client
}

// browser is a cookie-keeping client that stops at every redirect.
func (i *signInInstall) browser() *http.Client {
	jar, err := cookiejar.New(nil)
	require.NoError(i.t, err)
	return &http.Client{Jar: jar, Timeout: 30 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

// openSetup exchanges token for a setup session in browser, as opening the
// printed setup URL does. It answers the status and body.
func (i *signInInstall) openSetup(browser *http.Client, token string) (int, string) {
	i.t.Helper()
	payload, err := json.Marshal(map[string]string{"token": token})
	require.NoError(i.t, err)
	request, err := http.NewRequest(http.MethodPost, i.origin+"/api/install/setup-session", bytes.NewReader(payload))
	require.NoError(i.t, err)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", i.origin)
	response, err := browser.Do(request)
	require.NoError(i.t, err)
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	i.bodies.Write(body)
	return response.StatusCode, string(body)
}

// start opens GET /api/auth/github in browser. It answers the GitHub state,
// or the refusal.
func (i *signInInstall) start(browser *http.Client) (state string, refusal *signInResult) {
	i.t.Helper()
	response, err := browser.Get(i.origin + "/api/auth/github")
	require.NoError(i.t, err)
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	i.bodies.Write(body)
	if response.StatusCode != http.StatusFound {
		return "", &signInResult{status: response.StatusCode, body: string(body), session: sessionCookie(response)}
	}
	location, err := url.Parse(response.Header.Get("Location"))
	require.NoError(i.t, err)
	require.Equal(i.t, i.github.server.URL+"/login/oauth/authorize", location.Scheme+"://"+location.Host+location.Path)
	require.NotContains(i.t, location.String(), "token=", "the setup token never rides the OAuth state or URL")
	return location.Query().Get("state"), nil
}

// finish returns from GitHub to the callback as login. extra is appended to
// the callback query, as a forged installation_id would be.
func (i *signInInstall) finish(browser *http.Client, login, state, extra string) signInResult {
	i.t.Helper()
	response, err := browser.Get(i.origin + "/api/auth/github/callback?code=code-" + login + "&state=" + url.QueryEscape(state) + extra)
	require.NoError(i.t, err)
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	i.bodies.Write(body)
	return signInResult{login: login, status: response.StatusCode, body: string(body), session: sessionCookie(response), browser: browser}
}

// signIn runs one whole sign-in as login, from a setup session when token
// is not empty.
func (i *signInInstall) signIn(login, token string) signInResult {
	i.t.Helper()
	browser := i.browser()
	result := signInResult{login: login, browser: browser}
	if token != "" {
		if status, body := i.openSetup(browser, token); status != http.StatusNoContent {
			result.status, result.body = status, body
			i.logSignIn(result)
			return result
		}
	}
	state, refusal := i.start(browser)
	if refusal != nil {
		result.status, result.body, result.session = refusal.status, refusal.body, refusal.session
	} else {
		result = i.finish(browser, login, state, "")
	}
	i.logSignIn(result)
	return result
}

func (i *signInInstall) logSignIn(result signInResult) {
	evidence, _ := json.Marshal(map[string]any{"login": result.login, "listener": i.listener, "status": result.status,
		"body": result.body, "session_cookie": result.session != nil})
	i.t.Logf("signin %s", evidence)
}

func sessionCookie(response *http.Response) *http.Cookie {
	for _, cookie := range response.Cookies() {
		if cookie.Name == "smithers_session" && cookie.Value != "" && cookie.MaxAge >= 0 {
			return cookie
		}
	}
	return nil
}

func (i *signInInstall) owners() []string {
	i.t.Helper()
	rows, err := i.pool.Query(context.Background(), `SELECT COALESCE((SELECT a.profile_data->>'login' FROM oauth_accounts a WHERE a.user_id=c.user_id AND a.provider='workos' AND a.provider_user_id=c.github_user_id::TEXT),u.username) FROM self_host_owners o JOIN collaborators c ON c.user_id=o.user_id JOIN users u ON u.id=o.user_id ORDER BY c.id`)
	require.NoError(i.t, err)
	var logins []string
	for rows.Next() {
		var login string
		require.NoError(i.t, rows.Scan(&login))
		logins = append(logins, login)
	}
	require.NoError(i.t, rows.Err())
	return logins
}

func (i *signInInstall) memberCount() int {
	var count int
	require.NoError(i.t, i.pool.QueryRow(context.Background(), `SELECT count(*) FROM collaborators`).Scan(&count))
	return count
}

func (i *signInInstall) setupTokenStored() bool {
	var count int
	require.NoError(i.t, i.pool.QueryRow(context.Background(), `SELECT count(*) FROM install_settings WHERE key = 'setup_token'`).Scan(&count))
	return count == 1
}

func (i *signInInstall) setupSessions() int {
	var count int
	require.NoError(i.t, i.pool.QueryRow(context.Background(), `SELECT count(*) FROM install_settings WHERE key LIKE 'setup.session.%'`).Scan(&count))
	return count
}

// ownerVerified reports whether GitHub confirmed the owner's push access.
func (i *signInInstall) ownerVerified() bool {
	var verified bool
	require.NoError(i.t, i.pool.QueryRow(context.Background(), `SELECT EXISTS(SELECT 1 FROM install_settings WHERE key='owner.access_checked')`).Scan(&verified))
	return verified
}

// ownerAccess is the recorded reason the owner is still provisional.
func (i *signInInstall) ownerAccess() map[string]string {
	var raw []byte
	err := i.pool.QueryRow(context.Background(), `SELECT value FROM install_settings WHERE key = 'setup.owner_access'`).Scan(&raw)
	if err != nil {
		return nil
	}
	var access map[string]string
	require.NoError(i.t, json.Unmarshal(raw, &access))
	return access
}

// get reads path with the browser's cookies; it answers the status and body.
func (i *signInInstall) get(browser *http.Client, path string) (int, string) {
	i.t.Helper()
	response, err := browser.Get(i.origin + path)
	require.NoError(i.t, err)
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	return response.StatusCode, string(body)
}

// whoAmI reads GET /api/user with the browser's session.
func (i *signInInstall) whoAmI(browser *http.Client) (int, string) {
	status, body := i.get(browser, "/api/user")
	var user struct {
		Username string `json:"username"`
	}
	_ = json.Unmarshal([]byte(body), &user)
	return status, user.Username
}

// requireRefused checks a refusal: the typed envelope, no session cookie.
func requireRefused(t *testing.T, result signInResult, status int, code, message string) {
	t.Helper()
	requireEnvelope(t, result.status, result.body, status, code, message)
	// C-ACC-04 and spec §6.2.3: refusal classes are fixed independent oracles.
	var envelope struct {
		Class string `json:"class"`
	}
	require.NoError(t, json.Unmarshal([]byte(result.body), &envelope))
	wantClass := "permission"
	if code == "github_unavailable" {
		wantClass = "github"
	}
	require.Equal(t, wantClass, envelope.Class)
	require.Nil(t, result.session, "a refusal must not set a session cookie")
}

func requireEnvelope(t *testing.T, gotStatus int, body string, status int, code, message string) {
	t.Helper()
	require.Equal(t, status, gotStatus, body)
	var envelope struct {
		Code    string `json:"code"`
		Fault   string `json:"fault"`
		Message string `json:"message"`
	}
	require.NoError(t, json.Unmarshal([]byte(body), &envelope), body)
	require.Equal(t, code, envelope.Code, body)
	require.NotEmpty(t, envelope.Fault, body)
	require.Contains(t, envelope.Message, message)
}

// requireTokenSecret checks C-SEC-04: the setup token reaches no log line and
// no response body.
func (i *signInInstall) requireTokenSecret() {
	i.t.Helper()
	require.NotEmpty(i.t, i.setupToken)
	require.NotContains(i.t, i.logs.String(), i.setupToken, "the setup token reached the log")
	require.NotContains(i.t, i.bodies.String(), i.setupToken, "the setup token reached a response body")
}

// lanAddress is a non-loopback IPv4 address of this machine.
func lanAddress(t *testing.T) string {
	t.Helper()
	addresses, err := net.InterfaceAddrs()
	require.NoError(t, err)
	for _, address := range addresses {
		if network, ok := address.(*net.IPNet); ok && !network.IP.IsLoopback() && network.IP.To4() != nil && !network.IP.IsLinkLocalUnicast() {
			return network.IP.String()
		}
	}
	t.Skip("this machine has no non-loopback IPv4 address to bind a LAN listener")
	return ""
}

// C-SEC-04: a setup credential restricts actions, while the public setup
// page and its assets remain reloadable before and after the claim.
func TestSetupSessionCanReloadPublicApp(t *testing.T) {
	root := t.TempDir()
	require.NoError(t, os.Mkdir(filepath.Join(root, "assets"), 0700))
	require.NoError(t, os.WriteFile(filepath.Join(root, "index.html"), []byte(`<!doctype html><html><head></head><body>setup app</body></html>`), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(root, "assets", "app.js"), []byte(`console.log("setup")`), 0600))
	t.Setenv("SMITHERS_WEB_ROOT", root)
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	browser := install.browser()
	status, body := install.openSetup(browser, install.setupToken)
	require.Equal(t, http.StatusNoContent, status, body)
	reload := func(client *http.Client, path string) (int, string) {
		request, err := http.NewRequest(http.MethodGet, install.origin+path, nil)
		require.NoError(t, err)
		request.Header.Set("Accept", "text/html")
		response, err := client.Do(request)
		require.NoError(t, err)
		defer response.Body.Close()
		body, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		return response.StatusCode, string(body)
	}
	for path, content := range map[string]string{"/setup": "setup app", "/assets/app.js": `console.log("setup")`} {
		status, body = reload(browser, path)
		require.Equal(t, http.StatusOK, status, body)
		require.Contains(t, body, content)
	}
	// C-SEC-04: only /setup and webapp /assets/ are public exceptions.
	for _, path := range []string{"/acme/widgets/info/refs?service=git-upload-pack", "/assets/widgets/info/refs?service=git-upload-pack", "/internal/runs/1/artifacts/build/download", "/api/user", "/api/status", "/api/install/other"} {
		status, body = reload(browser, path)
		requireEnvelope(t, status, body, http.StatusForbidden, "permission", "finish setup")
	}
	stale := install.browser()
	setupOrigin, err := url.Parse(install.origin)
	require.NoError(t, err)
	for _, cookie := range browser.Jar.Cookies(setupOrigin) {
		stale.Jar.SetCookies(setupOrigin, []*http.Cookie{cookie})
	}
	state, refusal := install.start(browser)
	require.Nil(t, refusal)
	require.Equal(t, http.StatusFound, install.finish(browser, "own", state, "").status)
	status, body = reload(stale, "/setup")
	require.Equal(t, http.StatusOK, status, body)
	require.Contains(t, body, "setup app")
	status, body = install.get(stale, "/api/todos")
	requireEnvelope(t, status, body, http.StatusUnauthorized, "setup_closed", "already claimed")
	_, refusal = install.start(stale)
	require.Nil(t, refusal, "cleared stale cookie must allow the next sign-in")
}

// The mode matrix uses the production TypeScript seed against a real database.
// Spec §5.1.0: its fixture owner must already be verified to use ordinary APIs.
func TestModeMatrixSeedOwnerCanReachAPI(t *testing.T) {
	cmd := exec.Command("bun", "-e", `import {ownerSeed} from "./apps/app/scripts/mode-matrix/owner-seed.ts"; console.log(JSON.stringify(ownerSeed("matrix-owner")))`)
	cmd.Dir = filepath.Join("..", "..", "..", "..")
	raw, err := cmd.CombinedOutput()
	require.NoError(t, err, string(raw))
	var seed struct {
		SQL   string
		Token string
	}
	require.NoError(t, json.Unmarshal(raw, &seed))
	install := startSignInInstallWith(t, "127.0.0.1", signInSetup{seed: func(pool *pgxpool.Pool) {
		_, err := pool.Exec(context.Background(), seed.SQL)
		require.NoError(t, err)
	}})
	request, err := http.NewRequest(http.MethodGet, install.origin+"/api/user", nil)
	require.NoError(t, err)
	request.Header.Set("Authorization", "Bearer "+seed.Token)
	response, err := install.browser().Do(request)
	require.NoError(t, err)
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, response.StatusCode, string(body))
	require.Contains(t, string(body), "matrix-owner")
}

func TestOwnerSignInClaimsTheInstallWithTheSetupToken(t *testing.T) {
	for _, listener := range []struct{ name, host string }{{"loopback", "127.0.0.1"}, {"lan", ""}} {
		t.Run(listener.name, func(t *testing.T) {
			host := listener.host
			if host == "" {
				host = lanAddress(t)
			}
			install := startSignInInstall(t, host)
			install.github.set("own", 501, "admin")
			require.True(t, install.setupTokenStored())

			claimed := install.signIn("own", install.setupToken)
			require.Equal(t, http.StatusFound, claimed.status, claimed.body)
			require.NotNil(t, claimed.session, "the claim signs the owner in")
			require.Equal(t, []string{"own"}, install.owners())
			require.Equal(t, 1, install.memberCount())
			require.False(t, install.setupTokenStored(), "the claim deletes the setup token")
			require.Zero(t, install.setupSessions(), "the claim deletes every setup session")
			require.True(t, install.ownerVerified(), "the owner has push on the chosen repository")
			var githubID int64
			var unixUID int32
			require.NoError(t, install.pool.QueryRow(context.Background(),
				`SELECT github_user_id,unix_uid FROM collaborators c JOIN self_host_owners o ON o.user_id=c.user_id`).Scan(&githubID, &unixUID))
			require.Equal(t, int64(501), githubID)
			require.Equal(t, int32(20000), unixUID)
			status, username := install.whoAmI(claimed.browser)
			require.Equal(t, http.StatusOK, status)
			require.Equal(t, "own", username)
			status, body := install.get(claimed.browser, "/api/user/emails")
			require.Equal(t, http.StatusOK, status, body)

			// The owner signs in again later without a setup session.
			again := install.signIn("own", "")
			require.Equal(t, http.StatusFound, again.status, again.body)
			require.NotNil(t, again.session)
			require.Equal(t, []string{"own"}, install.owners())
			install.requireTokenSecret()

			// A claimed install prints no setup URL on its next start.
			require.Empty(t, install.restart())
		})
	}
}

func TestOwnerSignInRefusesAClaimWithoutTheSetupToken(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("dave", 504, "write")
	install.github.set("own", 501, "admin")

	requireRefused(t, install.signIn("dave", ""), http.StatusUnauthorized, "unauthenticated", "setup URL")
	requireRefused(t, install.signIn("own", "not-the-setup-token"), http.StatusForbidden, "setup_token_invalid", "setup URL")
	// A token with one character changed is still wrong.
	flipped := []byte(install.setupToken)
	flipped[0] ^= 1
	requireRefused(t, install.signIn("own", string(flipped)), http.StatusForbidden, "setup_token_invalid", "setup URL")

	require.Empty(t, install.owners())
	require.Zero(t, install.memberCount())
	require.Zero(t, install.setupSessions(), "a refused exchange opens no setup session")
	require.True(t, install.setupTokenStored(), "a refused claim leaves the token for the owner")
	install.github.mu.Lock()
	for _, line := range install.github.log {
		require.NotContains(t, line, "oauth exchange", "a sign-in without a setup session never reaches GitHub")
	}
	install.github.mu.Unlock()
	install.requireTokenSecret()
}

// Two setup sessions claim at once: one owner, the other gets setup_closed,
// and no setup session survives (C-SEC-04 steps 4 and 5).
func TestOwnerSignInConcurrentClaimsYieldOneOwner(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	install.github.set("eve", 505, "read")

	first, second := install.browser(), install.browser()
	var err error
	for _, browser := range []*http.Client{first, second} {
		install.setupToken, err = services.MintSetupToken(context.Background(), db.New(install.pool))
		require.NoError(t, err)
		status, body := install.openSetup(browser, install.setupToken)
		require.Equal(t, http.StatusNoContent, status, body)
	}
	require.Equal(t, 2, install.setupSessions())
	firstState, refusal := install.start(first)
	require.Nil(t, refusal)
	secondState, refusal := install.start(second)
	require.Nil(t, refusal)

	results := make([]signInResult, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); results[0] = install.finish(first, "own", firstState, "") }()
	go func() { defer wg.Done(); results[1] = install.finish(second, "eve", secondState, "") }()
	wg.Wait()

	var admitted, refused []signInResult
	for _, result := range results {
		if result.status == http.StatusFound {
			admitted = append(admitted, result)
		} else {
			refused = append(refused, result)
		}
	}
	require.Len(t, admitted, 1, "exactly one concurrent claim wins: %+v", results)
	require.Len(t, refused, 1, "exactly one concurrent claim loses: %+v", results)
	require.NotNil(t, admitted[0].session)
	requireRefused(t, refused[0], http.StatusUnauthorized, "setup_closed", "already claimed")
	require.Equal(t, []string{admitted[0].login}, install.owners())
	require.Equal(t, 1, install.memberCount())
	require.False(t, install.setupTokenStored())
	require.Zero(t, install.setupSessions())

	// The losing session is closed for every setup request, and so is the
	// token.
	loser := refused[0].browser
	status, body := install.openSetup(loser, install.setupToken)
	requireEnvelope(t, status, body, http.StatusUnauthorized, "setup_closed", "already claimed")
	_, refusal = install.start(loser)
	require.Nil(t, refusal, "losing device can restart sign-in without closing its browser")
	install.requireTokenSecret()
}

func TestOwnerSignInTokenDiesAtTheClaim(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	install.github.set("eve", 505, "admin")

	// A session opened under an earlier token also dies with the claim.
	early := install.browser()
	status, body := install.openSetup(early, install.setupToken)
	require.Equal(t, http.StatusNoContent, status, body)

	install.setupToken = install.restart()
	require.Equal(t, http.StatusFound, install.signIn("own", install.setupToken).status)
	require.False(t, install.setupTokenStored(), "the claim deletes the digest row")

	// Replaying the token, or the early session, claims nothing.
	requireRefused(t, install.signIn("eve", install.setupToken), http.StatusUnauthorized, "setup_closed", "already claimed")
	_, refusal := install.start(early)
	require.NotNil(t, refusal)
	requireRefused(t, *refusal, http.StatusUnauthorized, "setup_closed", "already claimed")
	// Without a setup session the roster decides.
	requireRefused(t, install.signIn("eve", ""), http.StatusForbidden, "not_a_member", "not a member")
	require.Equal(t, []string{"own"}, install.owners())
	require.Equal(t, 1, install.memberCount())
	install.requireTokenSecret()
}

// A setup session idle for 24 hours is expired.
func TestSetupSessionExpiresWhenIdle(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	browser := install.browser()
	status, body := install.openSetup(browser, install.setupToken)
	require.Equal(t, http.StatusNoContent, status, body)
	_, err := install.pool.Exec(context.Background(), `UPDATE install_settings SET updated_at = NOW() - INTERVAL '24 hours 1 minute' WHERE key LIKE 'setup.session.%'`)
	require.NoError(t, err)
	_, refusal := install.start(browser)
	require.NotNil(t, refusal)
	requireRefused(t, *refusal, http.StatusUnauthorized, "unauthenticated", "expired")
	require.Empty(t, install.owners())
}

// The claim makes a provisional owner: setup only until GitHub confirms push
// on the repository, read through the App, never a callback parameter
// (C-SEC-04 steps 6 to 8).
func TestOwnerSignInStaysProvisionalUntilGitHubConfirmsPush(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "read")

	browser := install.browser()
	status, body := install.openSetup(browser, install.setupToken)
	require.Equal(t, http.StatusNoContent, status, body)
	state, refusal := install.start(browser)
	require.Nil(t, refusal)
	// GitHub's setup_url redirect carries an installation_id; a forged one
	// must be ignored.
	claimed := install.finish(browser, "own", state, "&installation_id=999&setup_action=install")
	require.Equal(t, http.StatusFound, claimed.status, claimed.body)
	require.NotNil(t, claimed.session)
	require.Equal(t, []string{"own"}, install.owners())
	require.False(t, install.ownerVerified(), "a read-only owner stays provisional")
	require.Equal(t, map[string]string{"code": "needs_github_access",
		"message": "needs access on GitHub: push to acme/widgets", "fix": "https://github.com/acme/widgets/settings/access"}, install.ownerAccess())

	var recorded struct {
		InstallationID int64 `json:"installation_id"`
	}
	var raw []byte
	require.NoError(t, install.pool.QueryRow(context.Background(), `SELECT value FROM install_settings WHERE key = 'github.repository'`).Scan(&raw))
	require.NoError(t, json.Unmarshal(raw, &recorded))
	require.Equal(t, int64(signInInstallationID), recorded.InstallationID, "the installation comes from the App JWT read")
	install.github.mu.Lock()
	require.Contains(t, install.github.log, "installation acme/widgets")
	for _, line := range install.github.log {
		require.NotContains(t, line, "999")
	}
	install.github.mu.Unlock()

	// Setup reads work; everything else is owner_unverified.
	status, body = install.get(browser, "/api/user")
	requireEnvelope(t, status, body, http.StatusForbidden, "owner_unverified", "GitHub has not confirmed")
	for _, path := range []string{"/api/user/emails", "/api/user/repos", "/api/user/tokens"} {
		status, body := install.get(browser, path)
		requireEnvelope(t, status, body, http.StatusForbidden, "owner_unverified", "GitHub has not confirmed")
	}

	// The fix is on GitHub: maintain is push access (role_name says so where
	// the legacy permission field reads write). The next sign-in verifies.
	install.github.mu.Lock()
	install.github.people["own"] = signInPerson{id: 501, permission: "write", roleName: "maintain"}
	install.github.mu.Unlock()
	verified := install.signIn("own", "")
	require.Equal(t, http.StatusFound, verified.status, verified.body)
	require.False(t, install.ownerVerified(), "provisional sign-in must not run the gate")
	install.verifyOwner()
	require.True(t, install.ownerVerified())
	require.Nil(t, install.ownerAccess())
	status, body = install.get(verified.browser, "/api/user/emails")
	require.Equal(t, http.StatusOK, status, body)

	// Losing push access later refuses the owner's next sign-in.
	install.github.set("own", 501, "read")
	requireRefused(t, install.signIn("own", ""), http.StatusForbidden, "needs_github_access", "needs access on GitHub")
	// A GitHub failure refuses too (fail closed), with the GitHub class.
	install.github.set("own", 501, "502")
	requireRefused(t, install.signIn("own", ""), http.StatusBadGateway, "github_unavailable", "bad gateway")
	require.Equal(t, []string{"own"}, install.owners())
	install.requireTokenSecret()
}

// The host killed between the claim and the verification restarts with the
// owner still provisional (C-SEC-04 step 7).
func TestOwnerStaysProvisionalAcrossARestart(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	install.github.mu.Lock()
	install.github.installationDown = true
	install.github.mu.Unlock()

	claimed := install.signIn("own", install.setupToken)
	require.Equal(t, http.StatusFound, claimed.status, claimed.body)
	require.False(t, install.ownerVerified())
	require.Equal(t, "github_unavailable", install.ownerAccess()["code"])

	require.Empty(t, install.restart(), "a claimed install mints no setup token")
	require.False(t, install.ownerVerified(), "the restart keeps the owner provisional")
	require.Equal(t, "github_unavailable", install.ownerAccess()["code"], "and the step's state")
	status, body := install.get(claimed.browser, "/api/user/emails")
	requireEnvelope(t, status, body, http.StatusForbidden, "owner_unverified", "GitHub has not confirmed")

	install.github.mu.Lock()
	install.github.installationDown = false
	install.github.mu.Unlock()
	again := install.signIn("own", "")
	require.Equal(t, http.StatusFound, again.status, again.body)
	require.False(t, install.ownerVerified())
	var output bytes.Buffer
	handled, err := operator.Dispatch(context.Background(), []string{"owner", "verify-access"}, operator.Config{Stdout: &output, OpenDatabase: func(ctx context.Context) (*pgxpool.Pool, error) {
		return postgresfixture.Open(ctx, os.Getenv("SMITHERS_DATABASE_URL"), 0)
	}})
	require.True(t, handled)
	require.NoError(t, err)
	require.Contains(t, output.String(), "Owner access verified")
	require.True(t, install.ownerVerified())
}

// Before the claim a restart replaces the token; setup sessions survive.
func TestSetupTokenRotatesOnRestartBeforeTheClaim(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	old := install.setupToken
	browser := install.browser()
	status, body := install.openSetup(browser, old)
	require.Equal(t, http.StatusNoContent, status, body)

	fresh := install.restart()
	require.NotEmpty(t, fresh)
	require.NotEqual(t, old, fresh)
	status, body = install.openSetup(install.browser(), old)
	requireEnvelope(t, status, body, http.StatusForbidden, "setup_token_invalid", "setup URL")
	require.Equal(t, 1, install.setupSessions())

	// The session opened before the restart still claims.
	state, refusal := install.start(browser)
	require.Nil(t, refusal)
	claimed := install.finish(browser, "own", state, "")
	require.Equal(t, http.StatusFound, claimed.status, claimed.body)
	require.Equal(t, []string{"own"}, install.owners())
}

func TestOwnerSignInRefusesASecondGitHubUser(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	install.github.set("dave", 504, "write")
	require.Equal(t, http.StatusFound, install.signIn("own", install.setupToken).status)

	refused := install.signIn("dave", "")
	requireRefused(t, refused, http.StatusForbidden, "not_a_member", "not a member")
	require.Equal(t, []string{"own"}, install.owners())
	require.Equal(t, 1, install.memberCount())
	var daveUsers int
	require.NoError(t, install.pool.QueryRow(context.Background(), `SELECT count(*) FROM users WHERE lower_username = 'dave'`).Scan(&daveUsers))
	require.Zero(t, daveUsers, "a refused sign-in creates no account")
	install.requireTokenSecret()
}

// Until the repository is chosen the claim stands, the owner stays
// provisional, and nobody else gets in.
func TestOwnerSignInClaimsBeforeTheRepositoryIsChosen(t *testing.T) {
	install := startSignInInstallWith(t, "127.0.0.1", signInSetup{})
	install.github.set("own", 501, "write")
	install.github.set("dave", 504, "write")

	claimed := install.signIn("own", install.setupToken)
	require.Equal(t, http.StatusFound, claimed.status, claimed.body)
	require.Equal(t, []string{"own"}, install.owners())
	require.False(t, install.ownerVerified())
	again := install.signIn("own", "")
	require.Equal(t, http.StatusFound, again.status, again.body)
	require.False(t, install.ownerVerified())
	requireRefused(t, install.signIn("dave", ""), http.StatusForbidden, "not_a_member", "not a member")
	install.github.mu.Lock()
	for _, line := range install.github.log {
		require.NotContains(t, line, "permission", "no repository, so no push check")
	}
	install.github.mu.Unlock()

	require.NoError(t, db.New(install.pool).UpsertInstallSetting(context.Background(), db.UpsertInstallSettingParams{Key: "github.repository", Value: []byte(`{"owner_login":"acme","owner_kind":"org","repository_name":"widgets"}`)}))
	verified := install.signIn("own", "")
	require.Equal(t, http.StatusFound, verified.status, verified.body)
	install.verifyOwner()
	require.True(t, install.ownerVerified())
	install.requireTokenSecret()
}

// An install upgraded from the password owner keeps that owner, unlinked to
// GitHub (migration 0106). It prints a setup URL, and the owner's first
// GitHub sign-in from a setup session links the same owner: same users row,
// no second owner.
func TestUpgradedPasswordOwnerLinksGitHubFromASetupSession(t *testing.T) {
	var ownerUserID int64
	install := startSignInInstallWith(t, "127.0.0.1", signInSetup{repository: true, seed: func(pool *pgxpool.Pool) {
		ctx := context.Background()
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (username, lower_username, is_admin) VALUES ('Will', 'will', TRUE) RETURNING id`).Scan(&ownerUserID))
		oldDDL, err := os.ReadFile("../../db/product/migrations/0004_single_owner_identity.sql")
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `ALTER TABLE collaborators DROP COLUMN github_user_id,DROP COLUMN unix_uid,DROP COLUMN suspended_at; DROP INDEX collaborators_setup_user; ALTER TABLE collaborators ALTER COLUMN repository_id SET NOT NULL; ALTER TABLE oauth_states DROP COLUMN setup_session_digest; DELETE FROM smithers_product_migrations WHERE version=106`)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, string(oldDDL)[strings.Index(string(oldDDL), "CREATE TABLE local_credentials"):])
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO self_host_owners(user_id) VALUES($1);`, ownerUserID)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO local_credentials(user_id,password_hash) VALUES($1,'retired-password');`, ownerUserID)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO oauth_accounts(user_id,provider,provider_user_id) VALUES($1,'workos','user_non_numeric');`, ownerUserID)
		require.NoError(t, err)
		require.NoError(t, product.Apply(ctx, pool))
	}})
	install.github.set("will-gh", 777, "admin")
	install.github.set("eve", 505, "admin")
	require.NotEmpty(t, install.setupToken, "an unlinked owner leaves the install unclaimed")

	// Without the token nobody links, not even the owner's GitHub account.
	requireRefused(t, install.signIn("will-gh", ""), http.StatusUnauthorized, "unauthenticated", "setup URL")

	linked := install.signIn("will-gh", install.setupToken)
	require.Equal(t, http.StatusFound, linked.status, linked.body)
	status, username := install.whoAmI(linked.browser)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "Will", username, "the sign-in is the upgraded owner's account")
	var userID, githubID int64
	var login string
	require.NoError(t, install.pool.QueryRow(context.Background(),
		`SELECT c.user_id,c.github_user_id,(SELECT a.profile_data->>'login' FROM oauth_accounts a WHERE a.user_id=c.user_id AND a.provider='workos' AND a.provider_user_id=c.github_user_id::TEXT) FROM collaborators c JOIN self_host_owners o ON o.user_id=c.user_id`).Scan(&userID, &githubID, &login))
	require.Equal(t, ownerUserID, userID)
	require.Equal(t, int64(777), githubID)
	require.Equal(t, "will-gh", login)
	require.Equal(t, 1, install.memberCount())
	require.False(t, install.setupTokenStored())
	require.True(t, install.ownerVerified())

	again := install.signIn("will-gh", "")
	require.Equal(t, http.StatusFound, again.status, again.body)
	requireRefused(t, install.signIn("eve", ""), http.StatusForbidden, "not_a_member", "not a member")
	require.Empty(t, install.restart(), "a linked owner closes setup")
}

// The install boots without any bootstrap token, and the password owner
// routes are gone.
func TestInstallHasNoLocalPasswordRoutes(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	client := install.browser()
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/api/auth/local/status"},
		{http.MethodPost, "/api/auth/local/bootstrap"},
		{http.MethodPost, "/api/auth/local/login"},
		{http.MethodPost, "/api/auth/local/token"},
		{http.MethodPost, "/api/auth/local/password"},
	} {
		request, err := http.NewRequest(route.method, install.origin+route.path,
			strings.NewReader(`{"username":"owner","password":"owner password","bootstrap_token":"x"}`))
		require.NoError(t, err)
		request.Header.Set("Content-Type", "application/json")
		response, err := client.Do(request)
		require.NoError(t, err)
		_ = response.Body.Close()
		require.Equal(t, http.StatusNotFound, response.StatusCode, "%s %s", route.method, route.path)
	}
	require.Zero(t, install.memberCount())
}

// spec §5.1.0 / C-SEC-04: credential persistence belongs to the claim transaction.
func TestOwnerClaimRollsBackWhenSessionCommitFails(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("owner", 777, "admin")
	_, err := install.pool.Exec(context.Background(), `CREATE FUNCTION reject_claim_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'claim session rejected'; END $$;
 CREATE CONSTRAINT TRIGGER reject_claim_session AFTER INSERT ON auth_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_claim_session()`)
	require.NoError(t, err)
	result := install.signIn("owner", install.setupToken)
	require.Equal(t, http.StatusInternalServerError, result.status, result.body)
	require.Zero(t, install.memberCount(), "a failed credential commit must leave no owner")
	require.True(t, install.setupTokenStored())
	require.Equal(t, 1, install.setupSessions())
	var accounts int
	require.NoError(t, install.pool.QueryRow(context.Background(), `SELECT count(*) FROM oauth_accounts`).Scan(&accounts))
	require.Zero(t, accounts)
	_, err = install.pool.Exec(context.Background(), `DROP TRIGGER reject_claim_session ON auth_sessions`)
	require.NoError(t, err)
	install.setupToken = install.restart()
	require.Equal(t, http.StatusFound, install.signIn("owner", install.setupToken).status)
}

// spec §5.1.2: identity comes from the authenticated profile, including renames.
func TestUpgradedLinkedOwnerUsesAuthenticatedLoginForPush(t *testing.T) {
	install := startSignInInstallWith(t, "127.0.0.1", signInSetup{repository: true, seed: func(pool *pgxpool.Pool) {
		_, err := pool.Exec(context.Background(), `WITH u AS (INSERT INTO users(username,lower_username,is_admin) VALUES ('Will','will',TRUE) RETURNING id)
  , o AS (INSERT INTO self_host_owners(user_id) SELECT id FROM u) INSERT INTO collaborators(user_id,github_user_id,permission) SELECT id,777,'admin' FROM u`)
		require.NoError(t, err)
	}})
	install.github.set("Will", 778, "admin")
	install.github.set("will-gh", 777, "read")
	require.Equal(t, http.StatusFound, install.signIn("will-gh", "").status)
	install.verifyOwner()
	require.False(t, install.ownerVerified(), "another account's push must not verify the owner")
	install.github.set("will-gh", 777, "write")
	require.Equal(t, http.StatusFound, install.signIn("will-gh", "").status)
	install.verifyOwner()
	require.True(t, install.ownerVerified())
}

// §5.1.0 / C-SEC-04: same install, two origins, host-only cookies and per-origin callbacks.
func TestOwnerSignInUsesEachKnownOriginOnTheSameInstall(t *testing.T) {
	lan := lanAddress(t)
	var second string
	install := startSignInInstallWith(t, "127.0.0.1", signInSetup{repository: true, listenAll: true, origins: func(primary string) string {
		parsed, err := url.Parse(primary)
		require.NoError(t, err)
		second = "http://" + net.JoinHostPort(lan, parsed.Port())
		return primary + "," + second
	}})
	install.github.set("own", 501, "admin")
	var err error
	for _, origin := range []string{install.origin, second} {
		install.setupToken, err = services.MintSetupToken(context.Background(), db.New(install.pool))
		require.NoError(t, err)
		original := install.origin
		install.origin = origin
		browser := install.browser()
		status, body := install.openSetup(browser, install.setupToken)
		require.Equal(t, http.StatusNoContent, status, body)
		response, err := browser.Get(origin + "/api/auth/github")
		require.NoError(t, err)
		response.Body.Close()
		require.Equal(t, http.StatusFound, response.StatusCode)
		destination, err := url.Parse(response.Header.Get("Location"))
		require.NoError(t, err)
		require.Equal(t, install.github.server.URL+"/login/oauth/authorize", destination.Scheme+"://"+destination.Host+destination.Path)
		require.Equal(t, origin+"/api/auth/github/callback", destination.Query().Get("redirect_uri"))
		if origin == second {
			require.Equal(t, http.StatusFound, install.finish(browser, "own", destination.Query().Get("state"), "").status)
		}
		install.origin = original
	}
	require.Equal(t, 1, install.memberCount())
	require.Zero(t, install.setupSessions())
}

// §5.1.0 / C-SEC-04: live setup is memberless; scope, expiry and claim invalidation are distinct.
func TestSetupSessionScopeAndExpiryPredicates(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "admin")
	browser := install.browser()
	status, body := install.openSetup(browser, install.setupToken)
	require.Equal(t, 204, status, body)
	for _, tc := range []struct{ method, path string }{{"GET", "/api/todos"}, {"POST", "/api/todos?member_id=1"}, {"GET", "/api/members"}, {"POST", "/api/install/setup/repository"}, {"POST", "/api/install/quiesce"}, {"GET", "/acme/widgets.git/info/refs"}, {"GET", "/metrics"}, {"GET", "/auth/key/nonce"}, {"GET", "/ssh"}} {
		request, err := http.NewRequest(tc.method, install.origin+tc.path, nil)
		require.NoError(t, err)
		response, err := browser.Do(request)
		require.NoError(t, err)
		payload, _ := io.ReadAll(response.Body)
		response.Body.Close()
		requireEnvelope(t, response.StatusCode, string(payload), 403, "permission", "finish setup")
		require.Contains(t, string(payload), `"class":"permission"`)
	}
	require.Zero(t, install.memberCount())
	// A bogus credential is not a live credential with insufficient scope.
	bogus := install.browser()
	base, _ := url.Parse(install.origin)
	bogus.Jar.SetCookies(base, []*http.Cookie{{Name: "smithers_setup", Value: "invalid", Path: "/"}})
	status, body = install.get(bogus, "/api/todos")
	requireEnvelope(t, status, body, 401, "unauthenticated", "invalid")
	require.Empty(t, bogus.Jar.Cookies(base), "invalid setup cookie must be cleared")
	install.setupToken = install.restart()
	require.Equal(t, http.StatusFound, install.signIn("own", install.setupToken).status)
	status, body = install.get(browser, "/api/install")
	requireEnvelope(t, status, body, 401, "setup_closed", "claimed")
	require.Empty(t, browser.Jar.Cookies(base), "claim loser must be able to sign in on its next request")
	response, err := browser.Get(install.origin + "/api/auth/github")
	require.NoError(t, err)
	response.Body.Close()
	require.Equal(t, http.StatusFound, response.StatusCode)
}

// Exchange-first and claim-first barriers use real PostgreSQL locks, with no production fault hook.
func TestSetupExchangeAndClaimSerialize(t *testing.T) {
	for _, first := range []string{"exchange", "claim"} {
		t.Run(first, func(t *testing.T) {
			install := startSignInInstall(t, "127.0.0.1")
			install.github.set("own", 501, "admin")
			browser := install.browser()
			status, body := install.openSetup(browser, install.setupToken)
			require.Equal(t, 204, status, body)
			state, refusal := install.start(browser)
			require.Nil(t, refusal)
			ctx := context.Background()
			freshToken, mintErr := services.MintSetupToken(ctx, db.New(install.pool))
			require.NoError(t, mintErr)
			install.setupToken = freshToken
			barrier, err := install.pool.Acquire(ctx)
			require.NoError(t, err)
			defer barrier.Release()
			_, err = barrier.Exec(ctx, `SELECT pg_advisory_lock(344301)`)
			require.NoError(t, err)
			defer barrier.Exec(ctx, `SELECT pg_advisory_unlock(344301)`)
			table, event, when := "install_settings", "INSERT", "WHEN (NEW.key LIKE 'setup.session.%')"
			if first == "claim" {
				table, event, when = "auth_sessions", "INSERT", ""
			}
			_, err = install.pool.Exec(ctx, fmt.Sprintf(`CREATE FUNCTION setup_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(344301); RETURN NEW; END $$;
  CREATE TRIGGER setup_barrier BEFORE %s ON %s FOR EACH ROW %s EXECUTE FUNCTION setup_barrier()`, event, table, when))
			require.NoError(t, err)
			exchangeDone := make(chan int, 1)
			claimDone := make(chan signInResult, 1)
			exchange := func() { s, _ := install.openSetup(install.browser(), install.setupToken); exchangeDone <- s }
			claim := func() { claimDone <- install.finish(browser, "own", state, "") }
			if first == "exchange" {
				go exchange()
			} else {
				go claim()
			}
			require.Eventually(t, func() bool {
				var count int
				err := install.pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'`).Scan(&count)
				return err == nil && count == 1
			}, 5*time.Second, 10*time.Millisecond)
			if first == "exchange" {
				go claim()
			} else {
				go exchange()
			}
			require.Eventually(t, func() bool {
				var count int
				err := install.pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event IN ('transactionid','advisory')`).Scan(&count)
				return err == nil && count >= 2
			}, 5*time.Second, 10*time.Millisecond)
			_, err = barrier.Exec(ctx, `SELECT pg_advisory_unlock(344301)`)
			require.NoError(t, err)
			require.Equal(t, http.StatusFound, (<-claimDone).status)
			expected := 204
			if first == "claim" {
				expected = 401
			}
			require.Equal(t, expected, <-exchangeDone)
			require.Equal(t, 1, install.memberCount())
			require.Zero(t, install.setupSessions())
			require.False(t, install.setupTokenStored())
		})
	}
}

func (i *signInInstall) verifyOwner() {
	q := db.New(i.pool)
	codec, err := webhook.NewSecretCodec("owner-signin-webhook-key")
	require.NoError(i.t, err)
	installations := services.NewGitHubUserReposService(q, nil, services.WithGitHubUserReposCredentialStore(services.NewGitHubAppCredentialStore(i.pool, codec)))
	cfg, err := config.Load("")
	require.NoError(i.t, err)
	memberService := services.NewMemberService(i.pool, services.NewSettingsInstallRepository(q, installations, cfg.Auth.GitHubAppRepository))
	require.NoError(i.t, memberService.VerifyOwner(context.Background()))
}

// C-SEC-04: kill the compiled native entry point after claim commit, before access
// verification returns. No graceful shutdown or production failure hook is used.
func TestOwnerClaimSurvivesKilledCompiledHost(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	require.NoError(t, err)
	bundle := t.TempDir()
	binary := filepath.Join(bundle, "smithers-backend")
	build := exec.Command("go", "test", "-c", "-o", binary, "./apps/backend")
	build.Dir = root
	output, err := build.CombinedOutput()
	require.NoError(t, err, string(output))
	// This authentication-only harness never launches coding/model work. A
	// digest-verified inert host fixture satisfies bundle admission without mocking auth or PostgreSQL.
	inert := []byte("#!/bin/sh\nexit 1\n")
	sum := sha256.Sum256(inert)
	require.NoError(t, os.WriteFile(filepath.Join(bundle, "coding"), inert, 0700))
	manifest := fmt.Sprintf(`{"version":1,"hosts":{"coding":{"executable":"coding","sha256":"%x","flows":["coding/dispatch"]}}}`, sum)
	require.NoError(t, os.WriteFile(filepath.Join(bundle, "flow-hosts.json"), []byte(manifest), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(bundle, "model"), inert, 0700))
	require.NoError(t, os.WriteFile(filepath.Join(bundle, "model.sha256"), []byte(fmt.Sprintf("%x  model\n", sum)), 0600))
	install := startSignInInstall(t, "127.0.0.1")
	t.Cleanup(func() {
		if t.Failed() {
			t.Log(install.logs.String())
			t.Log(regexp.MustCompile(`token=[A-Za-z0-9_-]+`).ReplaceAllString(install.stdout.String(), "token=REDACTED"))
		}
	})
	install.stop()
	install.github.set("own", 501, "admin")
	if os.Getenv("SMITHERS_FFI_LIBRARY_PATH") == "" {
		t.Setenv("SMITHERS_FFI_LIBRARY_PATH", filepath.Join(root, "target/debug/libsmithers_ffi.dylib"))
	}
	t.Setenv("SMITHERS_DATA_ROOT", t.TempDir())
	t.Setenv("SMITHERS_FLOW_HOST_MANIFEST", filepath.Join(bundle, "flow-hosts.json"))
	t.Setenv("SMITHERS_MODEL_HOST_BUNDLE", filepath.Join(bundle, "model"))
	t.Setenv("SMITHERS_WORKSPACE_ISOLATION", "process")
	t.Setenv("SMITHERS_ACC_CLAIM_PROCESS_TEST", "1")
	if os.Getenv("SMITHERS_WORKSPACE_JJ_EXPORT_BINARY") == "" {
		t.Setenv("SMITHERS_WORKSPACE_JJ_EXPORT_BINARY", filepath.Join(root, "target/debug/smithers-jj-export"))
	}
	node, err := exec.LookPath("node")
	require.NoError(t, err)
	node, err = filepath.EvalSymlinks(node)
	require.NoError(t, err)
	t.Setenv("SMITHERS_NODE_BINARY", node)
	var command *exec.Cmd
	var done chan error
	start := func() {
		install.stdout = &lockedBuffer{}
		command = exec.Command(binary, "-test.run=^TestOwnerClaimProcessHelper$", "-test.v")
		command.Dir = root
		command.Stdout = install.stdout
		command.Stderr = install.logs
		require.NoError(t, command.Start())
		done = make(chan error, 1)
		go func() { done <- command.Wait() }()
		require.Eventually(t, func() bool {
			select {
			case err := <-done:
				_ = err
				return false
			default:
			}
			response, err := http.Get(install.origin + "/readyz")
			if err != nil {
				return false
			}
			response.Body.Close()
			return response.StatusCode == 200
		}, 30*time.Second, 20*time.Millisecond, install.logs.String())
	}
	kill := func() { require.NoError(t, command.Process.Kill()); <-done }
	t.Cleanup(func() {
		if command != nil && command.ProcessState == nil {
			_ = command.Process.Kill()
			<-done
		}
	})
	start()
	match := setupURLLine.FindStringSubmatch(install.stdout.String())
	require.Len(t, match, 3)
	install.setupToken = match[2]
	browser := install.browser()
	status, body := install.openSetup(browser, install.setupToken)
	require.Equal(t, 204, status, body)
	state, refusal := install.start(browser)
	require.Nil(t, refusal)
	// Hold the live GitHub installation reply, after the local claim committed.
	reached := make(chan struct{})
	release := make(chan struct{})
	install.github.mu.Lock()
	install.github.installationReached = reached
	install.github.installationRelease = release
	install.github.mu.Unlock()
	callbackDone := make(chan struct{})
	go func() {
		_, _ = browser.Get(install.origin + "/api/auth/github/callback?code=code-own&state=" + url.QueryEscape(state))
		close(callbackDone)
	}()
	select {
	case <-reached:
	case <-time.After(10 * time.Second):
		t.Fatal("verification did not start")
	}
	require.Equal(t, 1, install.memberCount())
	require.False(t, install.ownerVerified())
	require.Zero(t, install.setupSessions())
	var sessions int
	require.NoError(t, install.pool.QueryRow(context.Background(), `SELECT count(*) FROM auth_sessions`).Scan(&sessions))
	require.Equal(t, 1, sessions)
	kill()
	close(release)
	<-callbackDone
	install.github.mu.Lock()
	install.github.installationReached = nil
	install.github.installationRelease = nil
	install.github.mu.Unlock()
	start()
	require.Empty(t, setupURLLine.FindStringSubmatch(install.stdout.String()))
	require.Equal(t, 1, install.memberCount())
	require.False(t, install.ownerVerified())
	again := install.signIn("own", "")
	require.Equal(t, http.StatusFound, again.status, again.body)
	status, body = install.get(again.browser, "/api/todos")
	requireEnvelope(t, status, body, 403, "owner_unverified", "GitHub has not confirmed")
	kill()
}

// spec §5.1.0 / C-SEC-04: provisional browser sign-in does not authorize
// CLI/worker PATs or carried first-party grants. Real DB verifies no writes
// and that refused code/refresh redemptions roll back consumption.
func TestProvisionalOwnerCannotMintCredentials(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "read")
	require.Equal(t, http.StatusFound, install.signIn("own", install.setupToken).status)
	ctx := context.Background()
	q := db.New(install.pool)
	var uid int64
	require.NoError(t, install.pool.QueryRow(ctx, "SELECT user_id FROM self_host_owners").Scan(&uid))
	user, err := q.GetUserByID(ctx, uid)
	require.NoError(t, err)
	auth := services.NewAuthService(q, config.AuthConfig{Mode: "selfhost"}, nil, nil)
	// Even a setup-marked caller must not confer setup authority on a mint.
	_, err = auth.CreateToken(identity.WithSetupRequest(ctx), uid, services.CreateTokenRequest{Name: "cli", Scopes: []string{"read:user"}})
	require.ErrorContains(t, err, "finish setup")
	consent, err := auth.PrepareAdminCLIConsent(ctx, services.OAuthCallbackResult{User: user, AdminCLI: &services.AdminCLIRequest{TTL: time.Hour, CallbackPort: 45678}}, "upstream", "verifier")
	require.NoError(t, err)
	_, err = auth.ApproveAdminCLILogin(ctx, consent.State, "verifier", consent.CSRF, "127.0.0.1")
	require.ErrorContains(t, err, "finish setup")
	var count int
	require.NoError(t, install.pool.QueryRow(ctx, "SELECT count(*) FROM access_tokens WHERE user_id=$1", uid).Scan(&count))
	require.Zero(t, count)
	// Cookie-free CLI callback resolves the identity after AuthLoader.
	cli := install.browser()
	response, err := cli.Get(install.origin + "/api/auth/github/cli?callback_port=45678")
	require.NoError(t, err)
	response.Body.Close()
	require.Equal(t, 302, response.StatusCode)
	location, err := url.Parse(response.Header.Get("Location"))
	require.NoError(t, err)
	refused := install.finish(cli, "own", location.Query().Get("state"), "")
	requireEnvelope(t, refused.status, refused.body, 403, "owner_unverified", "finish setup")
	// Worker proof authenticates the worker; it does not verify the owner.
	request, err := http.NewRequest("POST", install.origin+"/api/auth/github/token-exchange", strings.NewReader(`{"github_access_token":"gho-own","token_name":"worker"}`))
	require.NoError(t, err)
	request.Header.Set("Authorization", "Bearer owner-signin-worker")
	request.Header.Set("Content-Type", "application/json")
	response, err = install.browser().Do(request)
	require.NoError(t, err)
	payload, _ := io.ReadAll(response.Body)
	response.Body.Close()
	requireEnvelope(t, response.StatusCode, string(payload), 403, "owner_unverified", "finish setup")
	require.NoError(t, install.pool.QueryRow(ctx, "SELECT count(*) FROM access_tokens WHERE user_id=$1", uid).Scan(&count))
	require.Zero(t, count)
	// A carried session-origin grant has no source PAT to authorize it.
	var appID int64
	require.NoError(t, install.pool.QueryRow(ctx, "INSERT INTO oauth2_applications (client_id,client_secret_hash,name,owner_id) VALUES ($1,'','First party',$2) RETURNING id", services.FirstPartyClientID, uid).Scan(&appID))
	require.NoError(t, func() error {
		_, e := install.pool.Exec(ctx, "UPDATE oauth2_applications SET confidential=false, redirect_uris=ARRAY['http://localhost:45678/callback'], scopes=ARRAY['read:user'] WHERE id=$1", appID)
		return e
	}())
	svc := services.NewOAuth2ServiceWithPool(q, install.pool, identity.NewMemberBoundary(q))
	verifier := strings.Repeat("a", 43)
	challengeBytes := sha256.Sum256([]byte(verifier))
	_, err = install.pool.Exec(ctx, "INSERT INTO oauth2_authorization_codes (code_hash,app_id,user_id,redirect_uri,scopes,code_challenge,code_challenge_method,expires_at) VALUES ($1,$2,$3,'http://localhost:45678/callback',ARRAY['read:user'],$4,'S256',now()+interval '1 hour')", credentialDigest("carried-code"), appID, uid, base64.RawURLEncoding.EncodeToString(challengeBytes[:]))
	require.NoError(t, err)
	_, err = q.CreateOAuth2RefreshToken(ctx, db.CreateOAuth2RefreshTokenParams{TokenHash: credentialDigest("carried-refresh"), AppID: appID, UserID: uid, Scopes: []string{"read:user"}, ExpiresAt: time.Now().Add(time.Hour)})
	require.NoError(t, err)
	for _, kind := range []string{"code", "refresh"} {
		t.Run(kind, func(t *testing.T) {
			form := url.Values{"client_id": {services.FirstPartyClientID}}
			if kind == "code" {
				form.Set("grant_type", "authorization_code")
				form.Set("code", "carried-code")
				form.Set("redirect_uri", "http://localhost:45678/callback")
				form.Set("code_verifier", verifier)
			} else {
				form.Set("grant_type", "refresh_token")
				form.Set("refresh_token", "carried-refresh")
			}
			response, err := install.browser().PostForm(install.origin+"/api/oauth2/token", form)
			require.NoError(t, err)
			payload, _ := io.ReadAll(response.Body)
			response.Body.Close()
			requireEnvelope(t, response.StatusCode, string(payload), 403, "owner_unverified", "finish setup")
		})
	}
	require.NoError(t, install.pool.QueryRow(ctx, "SELECT count(*) FROM oauth2_access_tokens WHERE user_id=$1", uid).Scan(&count))
	require.Zero(t, count)
	code, err := q.GetOAuth2AuthorizationCodeByHash(ctx, credentialDigest("carried-code"))
	require.NoError(t, err)
	require.False(t, code.UsedAt.Valid)
	_, err = q.GetOAuth2RefreshTokenByHash(ctx, credentialDigest("carried-refresh"))
	require.NoError(t, err)
	// Verification enables the same ordinary mint and carried grants.
	install.github.set("own", 501, "write")
	install.verifyOwner()
	_, err = auth.CreateToken(ctx, uid, services.CreateTokenRequest{Name: "cli", Scopes: []string{"read:user"}})
	require.NoError(t, err)
	_, err = svc.ExchangeCode(ctx, services.FirstPartyClientID, "", "carried-code", "http://localhost:45678/callback", verifier)
	require.NoError(t, err)
	_, err = svc.RefreshToken(ctx, services.FirstPartyClientID, "", "carried-refresh")
	require.NoError(t, err)
}
func credentialDigest(raw string) string {
	digest := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", digest)
}

// Post-claim DB failure cannot revoke the committed session, but must be
// observable to the operator rather than silently leaving setup blocked.
func TestOwnerVerificationDatabaseFailureIsLogged(t *testing.T) {
	install := startSignInInstall(t, "127.0.0.1")
	install.github.set("own", 501, "read")
	_, err := install.pool.Exec(context.Background(), `CREATE FUNCTION reject_owner_access() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key='setup.owner_access' THEN RAISE EXCEPTION 'access receipt unavailable'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER reject_owner_access BEFORE INSERT OR UPDATE ON install_settings FOR EACH ROW EXECUTE FUNCTION reject_owner_access()`)
	require.NoError(t, err)
	result := install.signIn("own", install.setupToken)
	require.Equal(t, 302, result.status, result.body)
	require.NotNil(t, result.session)
	require.False(t, install.ownerVerified())
	require.Contains(t, install.logs.String(), "owner access verification failed after claim")
	require.Contains(t, install.logs.String(), "failed to record the owner access check")
}

// C-SEC-04 / spec §5.1.2: migrated local login is not proof of GitHub identity.
func TestOwnerRecoveryRefusesDifferentGitHubIdentity(t *testing.T) {
	// C-SEC-04 / Astra 2026-10-03: linked ID 777 cannot borrow ID 778's push access.
	install := startSignInInstallWith(t, "127.0.0.1", signInSetup{repository: true, seed: func(pool *pgxpool.Pool) {
		_, err := pool.Exec(context.Background(), `WITH u AS (INSERT INTO users(username,lower_username,is_admin) VALUES ('Will','will',TRUE) RETURNING id)  , o AS (INSERT INTO self_host_owners(user_id) SELECT id FROM u) INSERT INTO collaborators(user_id,github_user_id,permission) SELECT id,777,'admin' FROM u`)
		require.NoError(t, err)
	}})
	install.github.set("Will", 778, "admin")
	install.github.set("will-gh", 777, "read")
	q := db.New(install.pool)
	codec, err := webhook.NewSecretCodec("owner-signin-webhook-key")
	require.NoError(t, err)
	repos := services.NewGitHubUserReposService(q, nil, services.WithGitHubUserReposCredentialStore(services.NewGitHubAppCredentialStore(install.pool, codec)))
	service := services.NewMemberService(install.pool, services.NewSettingsInstallRepository(q, repos, signInRepoOwner+"/"+signInRepoName))
	err = service.VerifyOwner(context.Background())
	var refusal *pkgerrors.APIError
	require.ErrorAs(t, err, &refusal)
	require.Equal(t, pkgerrors.CodeNeedsGitHubAccess, refusal.Code)
	require.False(t, install.ownerVerified())
	var stdout, stderr bytes.Buffer
	handled, err := operator.Dispatch(context.Background(), []string{"owner", "verify-access"}, operator.Config{Stdout: &stdout, Stderr: &stderr, OpenDatabase: func(ctx context.Context) (*pgxpool.Pool, error) {
		return pgxpool.New(ctx, os.Getenv("SMITHERS_DATABASE_URL"))
	}})
	require.True(t, handled)
	require.ErrorAs(t, err, &refusal)
	require.Equal(t, pkgerrors.CodeNeedsGitHubAccess, refusal.Code)
	require.NotContains(t, stdout.String(), "Owner access verified")
	require.False(t, install.ownerVerified())
}
