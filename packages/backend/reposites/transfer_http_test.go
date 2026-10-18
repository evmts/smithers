package reposites_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/blobs"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/reposites"
	"github.com/stretchr/testify/require"
)

type transferredUsers struct {
	users
	minted int
}

func (q *transferredUsers) MintHostSession(_ context.Context, id int64, host string, repositoryID int64, bindingToken string) (string, time.Time, error) {
	q.minted++
	return "destination-session-secret", time.Now().Add(time.Hour), nil
}
func (q *transferredUsers) GetAuthSessionBySessionKey(ctx context.Context, key string) (db.AuthSession, error) {
	if key == "destination-session-secret" {
		return db.AuthSession{SessionKey: key, UserID: 7, ExpiresAt: time.Now().Add(365 * 24 * time.Hour)}, nil
	}
	return q.users.GetAuthSessionBySessionKey(ctx, key)
}

type rewriteTransport struct {
	base   http.RoundTripper
	target *url.URL
}

func (t rewriteTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	copy := r.Clone(r.Context())
	copy.URL.Scheme = t.target.Scheme
	copy.URL.Host = t.target.Host
	copy.Host = r.URL.Host
	return t.base.RoundTrip(copy)
}

func TestCentralSiteSignInHTTPRoundTrip(t *testing.T) {
	blob, e := blobs.NewFilesystemStore(blobs.FilesystemConfig{Root: t.TempDir(), PublicBaseURL: "http://127.0.0.1", SigningKey: bytes.Repeat([]byte("x"), 32)})
	require.NoError(t, e)
	defer blob.Close()
	now := time.Now().UTC()
	repo := reposites.Repository{ID: 1, Owner: "first", Name: "manual", OrganizationID: 101}
	site := &reposites.Service{Config: reposites.Config{Enabled: true, Suffix: "smithers.sh", FirstPartyOrgIDs: []string{"101"}}, Store: &records{values: map[string]json.RawMessage{}}, Blobs: blob, Now: func() time.Time { return now }, Repository: func(context.Context, int64) (reposites.Repository, error) { return repo, nil }}
	_, e = site.Execute(context.Background(), repo, reposites.Command{Action: "enable", AppPrefix: "/repo/"})
	require.NoError(t, e)
	q := &transferredUsers{}
	signIn := &routes.SiteSignInHandler{Sites: site, CentralOrigin: "https://smithers.sh", Minter: q, AuthConfig: config.AuthConfig{SessionCookieName: "smithers_session", CookieSecure: false}}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/site/start", signIn.Start)
	mux.Handle("/api/auth/site/authorize", middleware.AuthLoader(q, config.AuthConfig{})(http.HandlerFunc(signIn.Authorize)))
	mux.HandleFunc("/api/auth/site/complete", signIn.Complete)
	mux.Handle("/api/whoami", middleware.AuthLoader(q, config.AuthConfig{})(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(middleware.UserFromContext(r.Context()).ID)
	}))))
	server := boundedSiteServer(t, mux, true)
	defer server.Close()
	target, e := url.Parse(server.URL)
	require.NoError(t, e)
	jar, e := cookiejar.New(nil)
	require.NoError(t, e)
	client := &http.Client{Transport: rewriteTransport{server.Client().Transport, target}, Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	get := func(raw string, want int) *http.Response {
		t.Helper()
		res, e := client.Get(raw)
		require.NoError(t, e)
		require.Equal(t, want, res.StatusCode, raw)
		res.Body.Close()
		return res
	}
	central, _ := url.Parse("https://smithers.sh")
	jar.SetCookies(central, []*http.Cookie{{Name: config.DefaultSessionCookieName, Value: "owner", Path: "/", Secure: true, HttpOnly: true}})
	origin := "https://manual.smithers.sh"
	authorize := func(raw string) *http.Response {
		t.Helper()
		before := q.minted
		consent := get(raw, 200)
		require.Equal(t, "DENY", consent.Header.Get("X-Frame-Options"))
		require.Equal(t, before, q.minted)
		parsed, e := url.Parse(raw)
		require.NoError(t, e)
		csrf := ""
		for _, cookie := range jar.Cookies(central) {
			if cookie.Name == middleware.CSRFCookieName {
				csrf = cookie.Value
			}
		}
		form := url.Values{"request": {parsed.Query().Get("request")}, "csrf": {csrf}}
		req, e := http.NewRequest("POST", "https://smithers.sh/api/auth/site/authorize", strings.NewReader(form.Encode()))
		require.NoError(t, e)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Origin", "https://smithers.sh")
		res, e := client.Do(req)
		require.NoError(t, e)
		res.Body.Close()
		require.Equal(t, 302, res.StatusCode)
		return res
	}

	for _, bad := range []string{"https://evil.example/", "//evil.example/", "/%2f%2fevil.example/", "/%252f%252fevil.example/", "/\\evil.example/"} {
		get(origin+"/api/auth/site/start?return_to="+url.QueryEscape(bad), 400)
	}
	first := get(origin+"/api/auth/site/start?return_to="+url.QueryEscape("/repo/?tab=home"), 302)
	require.True(t, strings.HasPrefix(first.Header.Get("Location"), "https://smithers.sh/api/auth/site/authorize?request="))
	state := first.Cookies()[0]
	require.Equal(t, "__Host-smithers_transfer", state.Name)
	require.True(t, state.HttpOnly)
	require.True(t, state.Secure)
	require.Empty(t, state.Domain)
	authorized := authorize(first.Header.Get("Location"))
	proof := authorized.Header.Get("Location")
	require.True(t, strings.HasPrefix(proof, origin+"/api/auth/site/complete?proof="))
	require.NotContains(t, proof, "destination-session-secret")
	// A copied state cannot redeem this proof on the central or another Host.
	wrong := strings.Replace(proof, "manual.smithers.sh", "smithers.sh", 1)
	jar.SetCookies(central, []*http.Cookie{state})
	get(wrong, 401)
	completed := get(proof, 303)
	require.Equal(t, "/repo/?tab=home", completed.Header.Get("Location"))
	require.Equal(t, "no-store", completed.Header.Get("Cache-Control"))
	require.Equal(t, "no-referrer", completed.Header.Get("Referrer-Policy"))
	for _, cookie := range completed.Cookies() {
		require.True(t, cookie.Secure)
		require.Empty(t, cookie.Domain)
		require.Equal(t, "/", cookie.Path)
	}
	get(origin+"/api/whoami", 200)
	require.Equal(t, 1, q.minted)
	destination, _ := url.Parse(origin)
	jar.SetCookies(destination, []*http.Cookie{state})
	get(proof, 401)
	require.Equal(t, 1, q.minted, "proof replay cannot mint another session")
	// Removing the destination state prevents login even with a fresh valid proof.
	fresh := get(origin+"/api/auth/site/start?return_to=/repo/", 302)
	authorized = authorize(fresh.Header.Get("Location"))
	expired := authorized.Header.Get("Location")
	now = now.Add(61 * time.Second)
	get(expired, 401)
	require.Equal(t, 1, q.minted)
	// An anonymous central browser gets the one existing GitHub OAuth callback,
	// carrying only the validated internal return path.
	jar.SetCookies(central, []*http.Cookie{{Name: config.DefaultSessionCookieName, Path: "/", MaxAge: -1, Secure: true}})
	start := get(origin+"/api/auth/site/start?return_to=/repo/", 302)
	login := get(start.Header.Get("Location"), 302)
	require.True(t, strings.HasPrefix(login.Header.Get("Location"), "/api/auth/github?return_to="))
	require.NotContains(t, login.Header.Get("Location"), origin)
}
