package reposites_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/blobs"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/reposites"
	"github.com/stretchr/testify/require"
)

// PostgreSQL is unavailable in this lane. This store substitutes only the atomic
// persistence port; the HTTP router, auth/CSRF, publication filesystem and
// Cloudflare client below are real. PG adapter integration remains unverified.
type records struct {
	mu     sync.Mutex
	values map[string]json.RawMessage
}

func (s *records) Read(_ context.Context, key string) (json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append(json.RawMessage(nil), s.values[key]...), nil
}
func (s *records) Change(_ context.Context, keys []string, f func(map[string]json.RawMessage) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	v := map[string]json.RawMessage{}
	for _, key := range keys {
		v[key] = append(json.RawMessage(nil), s.values[key]...)
	}
	if e := f(v); e != nil {
		return e
	}
	for key, b := range v {
		s.values[key] = append(json.RawMessage(nil), b...)
	}
	return nil
}

type dns struct {
	values map[string][]string
	cname  string
}

func (d *dns) LookupTXT(_ context.Context, key string) ([]string, error) { return d.values[key], nil }
func (d *dns) LookupCNAME(context.Context, string) (string, error)       { return d.cname, nil }

type users struct{}

func (users) GetAuthSessionBySessionKey(_ context.Context, key string) (db.AuthSession, error) {
	if key != "owner" && key != "reader" {
		return db.AuthSession{}, pgx.ErrNoRows
	}
	id := int64(7)
	if key == "reader" {
		id = 8
	}
	return db.AuthSession{SessionKey: key, UserID: id, ExpiresAt: time.Now().Add(365 * 24 * time.Hour)}, nil
}
func (users) RefreshAuthSession(context.Context, db.RefreshAuthSessionParams) (db.AuthSession, error) {
	return db.AuthSession{}, pgx.ErrNoRows
}
func (users) GetAuthInfoByTokenHash(context.Context, string) (db.GetAuthInfoByTokenHashRow, error) {
	return db.GetAuthInfoByTokenHashRow{}, pgx.ErrNoRows
}
func (users) GetFirstPartyOAuth2AccessTokenByHash(context.Context, string) (db.Oauth2AccessToken, error) {
	return db.Oauth2AccessToken{}, pgx.ErrNoRows
}
func (users) UpdateAccessTokenLastUsed(context.Context, int64) error { return nil }
func (users) GetUserByID(_ context.Context, id int64) (db.User, error) {
	return db.User{ID: id, Username: fmt.Sprint(id), IsActive: true}, nil
}

func TestRepositorySiteOwnerHTTPCloudflareLifecycle(t *testing.T) {
	status, ssl := "pending", "pending_validation"
	deleted := false
	failDelete := false
	now := time.Now().UTC()
	providerCalls := []string{}
	cf := boundedSiteServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer fake-cloudflare", r.Header.Get("Authorization"))
		providerCalls = append(providerCalls, r.Method+" "+r.URL.Path)
		if r.Method == "DELETE" {
			if failDelete {
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			}
			deleted = true
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": map[string]string{"id": "cf-id"}})
			return
		}
		record := map[string]any{"id": "cf-id", "hostname": "docs.customer.test", "status": status, "ownership_verification": map[string]string{"type": "TXT", "name": "_cf-custom-hostname.docs.customer.test", "value": "provider-proof"}, "ssl": map[string]any{"status": ssl, "validation_records": []map[string]string{{"txt_name": "_acme-challenge.docs.customer.test", "txt_value": "certificate-proof"}}}}
		var result any = record
		if r.Method == "GET" {
			result = []any{}
			if len(providerCalls) > 1 {
				result = []any{record}
			}
		}
		if r.Method == "POST" {
			var request map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
			require.Equal(t, "docs.customer.test", request["hostname"])
			require.Equal(t, map[string]any{"method": "txt", "type": "dv"}, request["ssl"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "result": result})
	}), false)
	defer cf.Close()
	blob, e := blobs.NewFilesystemStore(blobs.FilesystemConfig{Root: t.TempDir(), PublicBaseURL: "http://127.0.0.1", SigningKey: bytes.Repeat([]byte("x"), 32)})
	require.NoError(t, e)
	defer blob.Close()
	store := &records{values: map[string]json.RawMessage{}}
	dns := &dns{values: map[string][]string{}, cname: "sites.smithers.sh."}
	service := &reposites.Service{Config: reposites.Config{Enabled: true, Suffix: "smithers.sh", FirstPartyOrgIDs: []string{"101", "102"}, CNAME: "sites.smithers.sh"}, Store: store, Blobs: blob, DNS: dns, Now: func() time.Time { return now }, Certificates: &reposites.Cloudflare{ZoneID: "zone", Token: "fake-cloudflare", Origin: cf.URL}}
	ownership := map[int64]reposites.Repository{1: {ID: 1, Owner: "first", Name: "manual", OrganizationID: 101}, 2: {ID: 2, Owner: "outsider", Name: "other", OrganizationID: 999}, 3: {ID: 3, Owner: "smithers", Name: "smithers", OrganizationID: 101}, 4: {ID: 4, Owner: "effeck", Name: "effeck", OrganizationID: 102}}
	service.Repository = func(_ context.Context, id int64) (reposites.Repository, error) { return ownership[id], nil }
	handler := &routes.RepositorySitesHandler{Service: service}
	router := chi.NewRouter()
	router.Get("/api/sites/resolve", handler.Resolve)
	// Stands in for compose's repositorySiteHTTP: content is served only for the
	// site bound from the trusted edge host, never from the query alone.
	router.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			host := r.Header.Get("X-Forwarded-Host")
			if site, err := service.Resolve(r.Context(), host); err == nil {
				r = r.WithContext(middleware.ContextWithRepositorySite(r.Context(), middleware.RepositorySiteBinding{Generation: site.ScopeGeneration, Host: host, RepositoryID: site.Repository.ID, Owner: site.Repository.Owner, Name: site.Repository.Name}))
			}
			next.ServeHTTP(w, r)
		})
	}).Get("/api/sites/content", handler.Content)
	router.Group(func(r chi.Router) {
		r.Use(middleware.AuthLoader(users{}, config.AuthConfig{}))
		r.Use(middleware.RequireAuth)
		r.Use(middleware.CSRF)
		r.Get("/api/probe", func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{"user": middleware.UserFromContext(r.Context()).ID, "host": r.Header.Get("X-Forwarded-Host")})
		})
		r.Route("/api/repos/{owner}/{repo}/site", func(r chi.Router) {
			r.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					repoID := int64(1)
					if chi.URLParam(r, "repo") == "other" {
						repoID = 2
					}
					if chi.URLParam(r, "repo") == "smithers" {
						repoID = 3
					}
					if chi.URLParam(r, "repo") == "effeck" {
						repoID = 4
					}
					owner := chi.URLParam(r, "owner")
					permission := middleware.PermissionRead
					if middleware.UserFromContext(r.Context()).ID == 7 {
						permission = middleware.PermissionOwner
					}
					ctx := middleware.ContextWithRepoContext(r.Context(), &middleware.RepoContext{Owner: owner, Repository: &db.Repository{ID: repoID, Name: chi.URLParam(r, "repo"), OrgID: pgtype.Int8{Int64: ownership[repoID].OrganizationID, Valid: true}}}, permission)
					next.ServeHTTP(w, r.WithContext(ctx))
				})
			})
			r.Post("/", handler.Action)
			r.Get("/", handler.Action)
		})
	})
	server := boundedSiteServer(t, router, false)
	defer server.Close()
	call := func(actor, repo string, command reposites.Command, want int) map[string]any {
		t.Helper()
		data, e := json.Marshal(command)
		require.NoError(t, e)
		r, e := http.NewRequest("POST", server.URL+"/api/repos/"+repo+"/site", bytes.NewReader(data))
		require.NoError(t, e)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", "csrf")
		if actor != "" {
			r.AddCookie(&http.Cookie{Name: config.DefaultSessionCookieName, Value: actor})
			r.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "csrf"})
		}
		res, e := http.DefaultClient.Do(r)
		require.NoError(t, e)
		defer res.Body.Close()
		b, e := io.ReadAll(res.Body)
		require.NoError(t, e)
		require.Equal(t, want, res.StatusCode, string(b))
		var value map[string]any
		require.NoError(t, json.Unmarshal(b, &value))
		return value
	}
	resolve := func(host string, want int) {
		t.Helper()
		res, e := http.Get(server.URL + "/api/sites/resolve?host=" + host)
		require.NoError(t, e)
		defer res.Body.Close()
		require.Equal(t, want, res.StatusCode)
	}
	call("", "first/manual", reposites.Command{Action: "enable"}, 401)
	call("reader", "first/manual", reposites.Command{Action: "enable"}, 403)
	call("owner", "first/manual", reposites.Command{Action: "enable", AppPrefix: "/repo/"}, 200)
	for _, name := range []string{"smithers", "effeck"} {
		site := call("owner", name+"/"+name, reposites.Command{Action: "enable"}, 200)
		require.Equal(t, "https://"+name+".smithers.sh", site["url"])
		resolve(name+".smithers.sh", 200)
	}
	ownership[2] = reposites.Repository{ID: 2, Owner: "second", Name: "other", OrganizationID: 102}
	call("owner", "second/other", reposites.Command{Action: "enable", Name: "manual"}, 409)
	ownership[2] = reposites.Repository{ID: 2, Owner: "outsider", Name: "other", OrganizationID: 999}
	call("owner", "outsider/other", reposites.Command{Action: "enable", Name: "external"}, 409)
	for _, slug := range []string{"first", "second"} {
		ownership[2] = reposites.Repository{ID: 2, Owner: slug, Name: "other", OrganizationID: 999}
		call("owner", slug+"/other", reposites.Command{Action: "enable", Name: "spoof"}, 409)
	}
	ownership[2] = reposites.Repository{ID: 2, Owner: "outsider", Name: "other", OrganizationID: 999}
	call("owner", "outsider/other", reposites.Command{Action: "enable"}, 200)
	for _, name := range []string{"flow", "build", "api", "www"} {
		call("owner", "second/other", reposites.Command{Action: "enable", Name: name}, 409)
	}
	resolve("unknown.smithers.sh", 421)
	resolve("manual.smithers.sh", 200)
	service.Config.FirstPartyOrgIDs = nil
	resolve("manual.smithers.sh", 421)
	service.Config.FirstPartyOrgIDs = []string{"101", "102"}
	files := []reposites.Upload{{Path: "index.html", Data: []byte("<h1>site</h1>")}, {Path: "spec/intro.md", Data: []byte("# Intro")}, {Path: "setup.md", Data: []byte("setup")}, {Path: "llms.txt", Data: []byte("index")}}
	published := call("owner", "first/manual", reposites.Command{Action: "publish", Files: files}, 200)
	first := published["active"].(string)
	root, err := filepath.Abs("../../..")
	require.NoError(t, err)
	build := exec.Command("bun", "build", "apps/server/src/edge.ts", "--target=browser")
	build.Dir = root
	script, err := build.Output()
	require.NoError(t, err)
	proof := exec.Command("node", "apps/server/scripts/cutover/repository-sites-workerd.mjs")
	proof.Dir = root
	proof.Stdin = bytes.NewReader(script)
	proof.Env = append(os.Environ(), "SMITHERS_SITE_PROOF_BACKEND="+server.URL)
	output, err := proof.CombinedOutput()
	require.NoError(t, err, "%s", output)
	require.Contains(t, string(output), "repository site workerd/backend composed proof passed")
	call("owner", "first/manual", reposites.Command{Action: "publish", Files: files}, 200)
	for _, p := range []string{"/", "/spec/intro.md", "/setup.md", "/llms.txt"} {
		// The edge names the site host it serves; the query alone grants nothing.
		req, e := http.NewRequest("GET", server.URL+"/api/sites/content?host=manual.smithers.sh&path="+p, nil)
		require.NoError(t, e)
		req.Header.Set("X-Forwarded-Host", "manual.smithers.sh")
		res, e := http.DefaultClient.Do(req)
		require.NoError(t, e)
		b, e := io.ReadAll(res.Body)
		res.Body.Close()
		require.NoError(t, e)
		require.Equal(t, 200, res.StatusCode, string(b))
		require.NotEmpty(t, res.Header.Get("ETag"))
		require.Equal(t, "nosniff", res.Header.Get("X-Content-Type-Options"))
	}
	changed := call("owner", "first/manual", reposites.Command{Action: "publish", Expected: first, Files: []reposites.Upload{{Path: "index.html", Data: []byte("next")}}}, 200)
	call("owner", "first/manual", reposites.Command{Action: "activate", Expected: changed["active"].(string), Version: first}, 200)
	call("owner", "first/manual", reposites.Command{Action: "publish", Expected: first, Files: []reposites.Upload{{Path: "../escape", Data: []byte("bad")}}}, 400)
	call("owner", "first/manual", reposites.Command{Action: "publish", Expected: first, Files: []reposites.Upload{{Path: "repo/index.html", Data: []byte("bad")}}}, 400)
	for _, bad := range []string{"http://evil.example", "*.evil.example", "127.0.0.1", "com", "evil.example:443", "user@evil.example"} {
		call("owner", "first/manual", reposites.Command{Action: "domain.add", Domain: bad}, 400)
	}
	for _, reserved := range []string{"smithers.sh", "flow.smithers.sh", "unclaimed.smithers.sh"} {
		call("owner", "first/manual", reposites.Command{Action: "domain.add", Domain: reserved}, 409)
	}
	pending := call("owner", "first/manual", reposites.Command{Action: "domain.add", Domain: "docs.customer.test"}, 200)
	require.False(t, pending["bound"].(bool))
	resolve("docs.customer.test", 421)
	records := pending["records"].([]any)
	require.GreaterOrEqual(t, len(records), 4)
	token := pending["token"].(string)
	call("owner", "outsider/other", reposites.Command{Action: "domain.add", Domain: "docs.customer.test"}, 409)
	dns.values["_smithers.docs.customer.test"] = []string{token}
	verified := call("owner", "first/manual", reposites.Command{Action: "domain.verify", Domain: "docs.customer.test"}, 200)
	require.True(t, verified["verified"].(bool))
	require.False(t, verified["bound"].(bool))
	status = "active"
	stillPending := call("owner", "first/manual", reposites.Command{Action: "domain.verify", Domain: "docs.customer.test"}, 200)
	require.False(t, stillPending["bound"].(bool))
	resolve("docs.customer.test", 421)
	ssl = "active"
	bound := call("owner", "first/manual", reposites.Command{Action: "domain.verify", Domain: "docs.customer.test"}, 200)
	require.True(t, bound["bound"].(bool))
	resolve("docs.customer.test", 200)
	// On-demand renewal/status reconciliation fails closed when either DNS or
	// certificate readiness regresses; no deploy or static Helm wildcard is needed.
	now = now.Add(61 * time.Second)
	ssl = "pending_validation"
	resolve("docs.customer.test", 421)
	ssl = "active"
	call("owner", "first/manual", reposites.Command{Action: "domain.verify", Domain: "docs.customer.test"}, 200)
	dns.values["_smithers.docs.customer.test"] = []string{"wrong-proof"}
	now = now.Add(61 * time.Second)
	resolve("docs.customer.test", 421)
	dns.values["_smithers.docs.customer.test"] = []string{token}
	call("owner", "first/manual", reposites.Command{Action: "domain.verify", Domain: "docs.customer.test"}, 200)
	call("reader", "first/manual", reposites.Command{Action: "domain.remove", Domain: "docs.customer.test"}, 403)
	failDelete = true
	call("owner", "first/manual", reposites.Command{Action: "domain.remove", Domain: "docs.customer.test"}, 503)
	resolve("docs.customer.test", 421)
	call("owner", "first/manual", reposites.Command{Action: "domain.add", Domain: "docs.customer.test"}, 409)
	call("owner", "first/manual", reposites.Command{Action: "domain.verify", Domain: "docs.customer.test"}, 404)
	failDelete = false
	call("owner", "first/manual", reposites.Command{Action: "domain.remove", Domain: "docs.customer.test"}, 200)
	require.True(t, deleted)
	resolve("docs.customer.test", 421)
	ownership[1] = reposites.Repository{ID: 1, Owner: "first", Name: "manual", OrganizationID: 999}
	resolve("manual.smithers.sh", 421)
	require.Len(t, filter(providerCalls, "POST"), 1, "uncertain/repeated reconcile must not create duplicate custom hostnames")
}
func filter(v []string, prefix string) []string {
	out := []string{}
	for _, s := range v {
		if strings.HasPrefix(s, prefix) {
			out = append(out, s)
		}
	}
	return out
}
func TestReservedSiteNamesMatchEdgeInventory(t *testing.T) {
	b, e := os.ReadFile(filepath.Join("..", "..", "..", "apps", "server", "wrangler.docs-redirect.jsonc"))
	require.NoError(t, e)
	matches := regexp.MustCompile(`"pattern": "([a-z0-9-]+)\.smithers\.sh/\*"`).FindAllSubmatch(b, -1)
	require.NotEmpty(t, matches)
	for _, m := range matches {
		require.True(t, reposites.ReservedName(string(m[1])), string(m[1]))
	}
	require.True(t, reposites.ReservedName("build"))
}

func boundedSiteServer(t *testing.T, handler http.Handler, tls bool) *httptest.Server {
	t.Helper()
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(t.Name()))
	for offset := 0; offset < 2000; offset++ {
		listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", 49400+(int(hash.Sum32())+offset)%2000))
		if err != nil {
			continue
		}
		server := httptest.NewUnstartedServer(handler)
		server.Listener.Close()
		server.Listener = listener
		if tls {
			server.StartTLS()
		} else {
			server.Start()
		}
		return server
	}
	t.Fatal("no lane test port available")
	return nil
}

// Disabled hosting must refuse even a previously enabled binding and must
// not start central OAuth, return content, accept owner commands or set cookies.
func TestRepositorySitesDisabledHTTP(t *testing.T) {
	blob, err := blobs.NewFilesystemStore(blobs.FilesystemConfig{Root: t.TempDir(), PublicBaseURL: "http://127.0.0.1", SigningKey: bytes.Repeat([]byte("x"), 32)})
	require.NoError(t, err)
	service := &reposites.Service{Config: reposites.Config{Enabled: true, Suffix: "smithers.sh", FirstPartyOrgIDs: []string{"101"}}, Store: &records{values: map[string]json.RawMessage{}}, Blobs: blob}
	handler := &routes.RepositorySitesHandler{Service: service}
	signin := &routes.SiteSignInHandler{Sites: service, CentralOrigin: "https://smithers.sh"}
	repo := reposites.Repository{ID: 1, Owner: "first", Name: "manual", OrganizationID: 101}
	service.Repository = func(context.Context, int64) (reposites.Repository, error) { return repo, nil }
	_, err = service.Execute(context.Background(), repo, reposites.Command{Action: "enable"})
	require.NoError(t, err)
	_, err = service.Resolve(context.Background(), "manual.smithers.sh")
	require.NoError(t, err)
	service.Config.Enabled = false
	for _, host := range []string{"manual.smithers.sh", "custom.example"} {
		_, err := service.Resolve(context.Background(), host)
		require.Error(t, err)
	}
	for _, action := range []string{"status", "enable", "publish", "activate", "domain.add", "domain.verify", "domain.remove"} {
		_, err := service.Execute(context.Background(), repo, reposites.Command{Action: action})
		require.Error(t, err)
	}
	for _, tc := range []struct {
		name, method, target string
		serve                http.HandlerFunc
	}{
		{"resolve", "GET", "https://smithers.sh/api/sites/resolve?host=manual.smithers.sh", handler.Resolve},
		{"content", "GET", "https://smithers.sh/api/sites/content?host=manual.smithers.sh&path=/", handler.Content},
		{"action", "POST", "https://smithers.sh/api/repos/first/manual/site", handler.Action},
		{"start", "GET", "https://manual.smithers.sh/api/auth/site/start", signin.Start},
		{"authorize", "GET", "https://smithers.sh/api/auth/site/authorize", signin.Authorize},
		{"consent", "POST", "https://smithers.sh/api/auth/site/authorize", signin.Authorize},
		{"complete", "GET", "https://manual.smithers.sh/api/auth/site/complete", signin.Complete},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(tc.method, tc.target, strings.NewReader(`{"action":"status"}`))
			request = request.WithContext(context.WithValue(request.Context(), middleware.UserContextKey, &db.User{ID: 7}))
			request = request.WithContext(middleware.ContextWithRepoContext(request.Context(), &middleware.RepoContext{Owner: repo.Owner, Repository: &db.Repository{ID: repo.ID, Name: repo.Name}}, middleware.PermissionOwner))
			response := httptest.NewRecorder()
			tc.serve(response, request)
			require.Equal(t, http.StatusServiceUnavailable, response.Code)
			require.Empty(t, response.Header().Get("Location"))
			require.Empty(t, response.Result().Cookies())
		})
	}
}
