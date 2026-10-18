package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/blobs"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/guest"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/reposites"
	"github.com/stretchr/testify/require"
)

// Only persistence is substituted: composition, directory resolution, origin
// admission, MintHostSession and AuthLoader below are production implementations.
type siteCompositionStore map[string]json.RawMessage

func (s siteCompositionStore) Read(_ context.Context, key string) (json.RawMessage, error) {
	return s[key], nil
}
func (s siteCompositionStore) Change(_ context.Context, keys []string, f func(map[string]json.RawMessage) error) error {
	v := map[string]json.RawMessage{}
	for _, key := range keys {
		v[key] = s[key]
	}
	if err := f(v); err != nil {
		return err
	}
	for key, value := range v {
		s[key] = value
	}
	return nil
}

type siteCompositionAuth struct {
	services.AuthQuerier
	middleware.AuthLoaderQuerier
	sessions map[string]db.AuthSession
	settings map[string]db.InstallSetting
}

type siteMemberRefusal struct{}

func (siteMemberRefusal) AuthorizeMember(context.Context, int64) *pkgerrors.APIError {
	return pkgerrors.Forbidden("Member required")
}

func (q *siteCompositionAuth) GetUserByID(context.Context, int64) (db.User, error) {
	return db.User{ID: 7, Username: "person", IsActive: true}, nil
}
func (q *siteCompositionAuth) CreateAuthSession(_ context.Context, p db.CreateAuthSessionParams) (db.AuthSession, error) {
	s := db.AuthSession{SessionKey: p.SessionKey, UserID: p.UserID, ExpiresAt: p.ExpiresAt}
	q.sessions[p.SessionKey] = s
	return s, nil
}
func (q *siteCompositionAuth) GetAuthSessionBySessionKey(_ context.Context, key string) (db.AuthSession, error) {
	if s, ok := q.sessions[key]; ok {
		return s, nil
	}
	return db.AuthSession{}, pgx.ErrNoRows
}
func (q *siteCompositionAuth) UpsertInstallSetting(_ context.Context, p db.UpsertInstallSettingParams) error {
	q.settings[p.Key] = db.InstallSetting{Key: p.Key, Value: p.Value}
	return nil
}
func (q *siteCompositionAuth) GetInstallSetting(_ context.Context, key string) (db.InstallSetting, error) {
	if s, ok := q.settings[key]; ok {
		return s, nil
	}
	return db.InstallSetting{}, pgx.ErrNoRows
}

func TestRepositorySiteProductionWrapperBootstrapAndSession(t *testing.T) {
	blob, err := blobs.NewFilesystemStore(blobs.FilesystemConfig{Root: t.TempDir(), PublicBaseURL: "http://127.0.0.1", SigningKey: bytes.Repeat([]byte("x"), 32)})
	require.NoError(t, err)
	defer blob.Close()
	repo := reposites.Repository{ID: 1, Owner: "first", Name: "manual", OrganizationID: 101}
	store := siteCompositionStore{}
	put := func(key string, value any) { b, e := json.Marshal(value); require.NoError(t, e); store[key] = b }
	put("repo/1", reposites.Site{Repository: repo, Enabled: true})
	put("host/docs.customer.test", reposites.Host{Hostname: "docs.customer.test", RepositoryID: 1, Verified: true, Bound: true, Token: "binding-1", CheckedAt: time.Now()})
	put("host/pending.customer.test", reposites.Host{Hostname: "pending.customer.test", RepositoryID: 1, CheckedAt: time.Now()})
	sites := &reposites.Service{Config: reposites.Config{Enabled: true, Suffix: "smithers.sh"}, Store: store, Blobs: blob, Repository: func(context.Context, int64) (reposites.Repository, error) { return repo, nil }}
	require.NoError(t, blobs.Put(context.Background(), blob, "site-html", "text/html", bytes.NewBufferString("<script>alert(1)</script>")))
	put("version/1/live", reposites.Version{ID: "live", Files: map[string]reposites.File{"/x.html": {Key: "site-html", ContentType: "text/html"}}})
	put("repo/1", reposites.Site{Repository: repo, Enabled: true, Active: "live"})
	put("host/other.customer.test", reposites.Host{Hostname: "other.customer.test", RepositoryID: 1, Verified: true, Bound: true, Token: "binding-other", CheckedAt: time.Now()})
	handler := &routes.RepositorySitesHandler{Service: sites}
	for _, tc := range []struct {
		name, host, forwarded, target string
		hops, want                    int
	}{
		{"control", "control.test", "", "docs.customer.test", 0, 404},
		{"own site", "docs.customer.test", "", "docs.customer.test", 0, 200},
		{"other site", "docs.customer.test", "", "other.customer.test", 0, 404},
		{"trusted edge", "control.test", "docs.customer.test", "docs.customer.test", 1, 200},
		{"untrusted assertion", "control.test", "docs.customer.test", "docs.customer.test", 0, 404},
		{"edge control", "docs.customer.test", "control.test", "docs.customer.test", 1, 404},
	} {
		t.Run("content "+tc.name, func(t *testing.T) {
			cfg := &config.Config{Sites: config.RepositorySitesConfig{Enabled: true}, Server: config.ServerConfig{PublicURL: "https://control.test", TrustedProxyHops: tc.hops}}
			r := httptest.NewRequest("GET", "https://"+tc.host+"/api/sites/content?host="+tc.target+"&path=/x.html", nil)
			r.Header.Set("X-Forwarded-Host", tc.forwarded)
			w := httptest.NewRecorder()
			repositorySiteHTTP(http.HandlerFunc(handler.Content), cfg, sites).ServeHTTP(w, r)
			require.Equal(t, tc.want, w.Code, w.Body.String())
			if tc.want == 200 {
				require.Equal(t, "text/html", w.Header().Get("Content-Type"))
				require.Equal(t, "<script>alert(1)</script>", w.Body.String())
			}
		})
	}
	cfg := &config.Config{Sites: config.RepositorySitesConfig{Enabled: true}, Server: config.ServerConfig{PublicURL: "https://control.test"}}
	q := &siteCompositionAuth{sessions: map[string]db.AuthSession{}, settings: map[string]db.InstallSetting{}}
	auth := services.NewAuthService(q, config.AuthConfig{}, nil, nil)
	auth.HostSessionAdmission = siteMemberRefusal{}
	_, _, err = auth.MintHostSession(context.Background(), 7, "docs.customer.test", 1, "binding-1")
	require.Error(t, err)
	require.Empty(t, q.sessions, "roster refusal must precede session creation")
	auth.HostSessionAdmission = nil
	key, expiry, err := auth.MintHostSession(context.Background(), 7, "docs.customer.test", 1, "binding-1")
	require.NoError(t, err)
	require.Contains(t, key, middleware.RepositorySiteSessionPrefix)
	require.True(t, expiry.After(time.Now()))
	require.NotContains(t, q.sessions, key, "raw credential must not be stored")
	require.Contains(t, q.settings, middleware.RepositorySiteSessionKey(key))
	var audience middleware.RepositorySiteSession
	require.NoError(t, json.Unmarshal(q.settings[middleware.RepositorySiteSessionKey(key)].Value, &audience))
	require.Equal(t, "binding-1", audience.BindingToken)
	require.Equal(t, int64(1), audience.RepositoryID)
	next := middleware.AuthLoader(q, config.AuthConfig{})(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })))
	origins := []string{"https://control.test"}
	h := repositorySiteHTTP(withInstallBootstrap(next, appBootstrap{Capabilities: []string{"identity", "sites", "agent", "cloud.terminal"}}, func() []string { return origins }), cfg, sites)
	for _, tc := range []struct {
		name, host, path, origin, cookie string
		want                             int
	}{
		{"bound bootstrap", "docs.customer.test", "/api/bootstrap", "https://docs.customer.test", "", 200},
		{"foreign Origin", "docs.customer.test", "/api/bootstrap", "https://foreign.test", "", 403},
		{"wrong Host", "wrong.customer.test", "/api/bootstrap", "https://docs.customer.test", "", 421},
		{"pending Host", "pending.customer.test", "/api/bootstrap", "", "", 421},
		{"control origin unchanged", "control.test", "/api/bootstrap", "https://docs.customer.test", "", 403},
		{"site session own repo", "docs.customer.test", "/api/repos/first/manual", "", key, 204},
		{"site session other repo", "docs.customer.test", "/api/repos/victim/private", "", key, 403},
		{"site session account tokens", "docs.customer.test", "/api/auth/tokens", "", key, 403},
		{"site session global flows", "docs.customer.test", "/api/flows", "", key, 403},
		{"site session copied to control", "control.test", "/api/user", "", key, 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "https://"+tc.host+tc.path, nil)
			r.Header.Set("Origin", tc.origin)
			// Caller assertions must have no effect on directory binding or origin.
			r.Header.Set("X-Smithers-Repository", "victim/private")
			r.Header.Set("X-Forwarded-Host", "docs.customer.test")
			if tc.cookie != "" {
				r.AddCookie(&http.Cookie{Name: config.DefaultSessionCookieName, Value: tc.cookie})
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			require.Equal(t, tc.want, w.Code, w.Body.String())
			if tc.want == 200 {
				require.NotContains(t, w.Body.String(), "cloud.terminal")
				require.NotContains(t, w.Body.String(), "agent")
				require.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
			}
		})
	}
	require.Equal(t, []string{"https://control.test"}, origins)
	put("host/docs.customer.test", reposites.Host{Hostname: "docs.customer.test", RepositoryID: 1, Verified: true, Bound: true, Token: "binding-2", CheckedAt: time.Now()})
	r := httptest.NewRequest("GET", "https://docs.customer.test/api/repos/first/manual", nil)
	r.AddCookie(&http.Cookie{Name: config.DefaultSessionCookieName, Value: key})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	require.Equal(t, 401, w.Code, "rebound hosts must reject the old site session")
	// Preserve the guest lane's own admission and budget policy. A verified
	// site origin can reach that policy; an arbitrary origin cannot.
	guestRouter := chi.NewRouter()
	mountGuestPublic(guestRouter, &guest.Handler{Config: config.GuestConfig{Repositories: []string{"first/manual"}, Disabled: true}}, nil, cfg)
	guestHTTP := repositorySiteHTTP(guestRouter, cfg, sites)
	for _, origin := range []string{"https://docs.customer.test", "https://foreign.test"} {
		r := httptest.NewRequest(http.MethodPost, "https://docs.customer.test/api/repos/first/manual/guest/chat", bytes.NewBufferString(`{"prompt":"hello"}`))
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		guestHTTP.ServeHTTP(w, r)
		if origin == "https://docs.customer.test" {
			require.Contains(t, w.Body.String(), "guest_disabled")
		} else {
			require.Equal(t, http.StatusForbidden, w.Code)
			require.NotContains(t, w.Body.String(), "guest_disabled")
		}
	}
}
