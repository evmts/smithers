package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

/*
 * The GitHub-repository create at the SOURCE boundary: the two real doors on a
 * real chi router with the production middleware chain the hosted Cloud
 * composition mounts them behind, the real service, the real durable store on
 * real PostgreSQL, and the real worker registered on the real operation name.
 *
 * Nothing here is a fake fetch and nothing reaches github.com: GitHub is a
 * local httptest origin, and every call it receives is recorded so the tests
 * can assert which calls were made and how many times.
 *
 * The service's own unit coverage lives in
 * services/github_user_repo_create_test.go. What this file adds is the part no
 * separate Service or Handler test can show: two different signed-in people on
 * ONE composition, each reaching only their own operation, with the worker
 * that settles them running the way compose/main.go registers it.
 */

// boundaryGitHub is the GitHub the composition talks to.
type boundaryGitHub struct {
	mu    sync.Mutex
	calls []string
	// accounts maps a credential to the GitHub account it belongs to.
	accounts map[string]struct {
		login string
		id    int64
	}
	// nextRepoID gives each created repository its own GitHub id.
	nextRepoID int64
	// created records which repositories the POST has made, by full name.
	created map[string]int64
}

func newBoundaryGitHub() *boundaryGitHub {
	return &boundaryGitHub{
		accounts: map[string]struct {
			login string
			id    int64
		}{
			"gho_ada": {login: "ada", id: 1001},
			"gho_bo":  {login: "bo", id: 1002},
		},
		nextRepoID: 5000,
		created:    map[string]int64{},
	}
}

func (g *boundaryGitHub) countOf(call string) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	count := 0
	for _, seen := range g.calls {
		if seen == call {
			count++
		}
	}
	return count
}

func (g *boundaryGitHub) start(t *testing.T) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		g.calls = append(g.calls, r.Method+" "+r.URL.Path)
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		account, known := g.accounts[token]
		if !known {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/user":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": account.id, "login": account.login})
		case r.Method == http.MethodPost && r.URL.Path == "/user/repos":
			var body struct {
				Name string `json:"name"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			full := account.login + "/" + body.Name
			if _, taken := g.created[full]; taken {
				w.WriteHeader(http.StatusUnprocessableEntity)
				return
			}
			g.nextRepoID++
			g.created[full] = g.nextRepoID
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": g.nextRepoID, "full_name": full,
				"owner": map[string]any{"id": account.id, "login": account.login},
			})
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/repos/"):
			full := strings.TrimPrefix(r.URL.Path, "/repos/")
			id, exists := g.created[full]
			if !exists || !strings.HasPrefix(full, account.login+"/") {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": id, "full_name": full,
				"owner": map[string]any{"id": account.id, "login": account.login},
			})
		default:
			t.Errorf("unexpected GitHub call: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	t.Setenv("SMITHERS_GITHUB_APP_API_BASE_URL", server.URL)
}

// boundaryAccounts is the stored GitHub link of every account in the test,
// which is where the owner and the credential come from — never a request.
type boundaryAccounts struct{ byUser map[int64]db.OauthAccount }

func (a boundaryAccounts) ListUserOAuthAccounts(_ context.Context, userID int64) ([]db.OauthAccount, error) {
	account, linked := a.byUser[userID]
	if !linked {
		return nil, nil
	}
	return []db.OauthAccount{account}, nil
}

func (a boundaryAccounts) GetGitHubRepoListing(context.Context, int64) (db.GithubRepoListing, error) {
	return db.GithubRepoListing{}, nil
}

func (a boundaryAccounts) UpsertGitHubRepoListing(context.Context, db.UpsertGitHubRepoListingParams) (db.GithubRepoListing, error) {
	return db.GithubRepoListing{}, nil
}

func (a boundaryAccounts) ClaimGitHubRepoListingSync(context.Context, int64) (int64, error) {
	return 0, nil
}

func (a boundaryAccounts) SetGitHubRepoListingSyncError(context.Context, db.SetGitHubRepoListingSyncErrorParams) error {
	return nil
}

func (a boundaryAccounts) DeleteGitHubRepoListing(context.Context, int64) error { return nil }

// boundaryDecrypter returns the stored ciphertext as the token itself, so each
// account's credential is distinguishable at the GitHub origin.
type boundaryDecrypter struct{}

func (boundaryDecrypter) DecryptOAuthAccessToken(ciphertext []byte) (string, error) {
	return string(ciphertext), nil
}

// boundaryComposition is the router, the service and the running worker.
type boundaryComposition struct {
	server *httptest.Server
	github *boundaryGitHub
}

// boundaryCallerHeader names the account a request is made as. A context value
// does not cross an HTTP boundary, and crossing a real one is the point of
// this file, so the harness carries the caller in a header the production
// chain never reads and the test middleware turns into the auth info the auth
// loader would have loaded.
const boundaryCallerHeader = "X-Boundary-Caller"

func startBoundaryComposition(t *testing.T) *boundaryComposition {
	t.Helper()
	pool, _ := postgresfixture.NewProductDatabase(t)
	github := newBoundaryGitHub()
	github.start(t)
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	accounts := boundaryAccounts{byUser: map[int64]db.OauthAccount{
		11: {Provider: "github", ProviderUserID: "1001", AccessTokenEncrypted: []byte("gho_ada")},
		22: {Provider: "github", ProviderUserID: "1002", AccessTokenEncrypted: []byte("gho_bo")},
	}}
	service := services.NewGitHubUserReposService(accounts, boundaryDecrypter{})
	service.SetGitHubRepoCreateJobs(store)
	handler := &GitHubUserReposHandler{Service: service}

	// The worker exactly as compose/main.go registers it: the real store, the
	// real operation name and the real handler.
	workerCtx, stopWorker := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		_ = store.RunWorker(workerCtx, jobs.WorkerConfig{
			WorkerID: "github-repo-create-boundary", Capacity: 1, Lease: 30 * time.Second,
			PollInterval: 2 * time.Millisecond, RetryDelay: 10 * time.Millisecond,
			Operations: []string{services.GitHubUserRepoCreateOperation},
		}, service.HandleGitHubUserRepoCreate)
	}()
	t.Cleanup(func() {
		stopWorker()
		<-stopped
	})

	router := chi.NewRouter()
	// The hosted composition's own chain for these two doors. The signed-in
	// person is carried the way the auth loader carries one.
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			who, err := strconv.ParseInt(r.Header.Get(boundaryCallerHeader), 10, 64)
			if err != nil || who <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			user := &db.User{ID: who, Username: "person"}
			ctx := context.WithValue(r.Context(), middleware.UserContextKey, user)
			ctx = middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: user, SessionHash: strings.Repeat("a", 64)})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	write := []func(http.Handler) http.Handler{
		middleware.PrivateNoStore, middleware.RequireAuth,
		middleware.RejectRepositoryRestrictedToken, middleware.RequireScope(middleware.ScopeWriteRepository),
	}
	read := []func(http.Handler) http.Handler{
		middleware.PrivateNoStore, middleware.RequireAuth,
		middleware.RejectRepositoryRestrictedToken, middleware.RequireScope(middleware.ScopeReadRepository),
	}
	router.With(write...).Post("/api/user/github-repos", handler.CreateGitHubUserRepo)
	router.With(read...).Get("/api/user/github-repo-requests/{id}", handler.GetGitHubUserRepoCreate)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	return &boundaryComposition{server: server, github: github}
}

func (c *boundaryComposition) do(t *testing.T, userID int64, method, path, body string) (int, map[string]any) {
	t.Helper()
	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	var request *http.Request
	var err error
	if reader == nil {
		request, err = http.NewRequest(method, c.server.URL+path, nil)
	} else {
		request, err = http.NewRequest(method, c.server.URL+path, reader)
		request.Header.Set("Content-Type", "application/json")
	}
	require.NoError(t, err)
	if userID > 0 {
		request.Header.Set(boundaryCallerHeader, strconv.FormatInt(userID, 10))
	}
	response, err := c.server.Client().Do(request)
	require.NoError(t, err)
	defer func() { _ = response.Body.Close() }()
	var envelope map[string]any
	_ = json.NewDecoder(response.Body).Decode(&envelope)
	return response.StatusCode, envelope
}

// settle reads the caller's own receipt door until the operation is terminal.
func (c *boundaryComposition) settle(t *testing.T, userID int64, operationID string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for {
		status, body := c.do(t, userID, http.MethodGet, "/api/user/github-repo-requests/"+operationID, "")
		require.Equal(t, http.StatusOK, status, body)
		state, _ := body["state"].(string)
		if jobs.State(state).Terminal() {
			return body
		}
		if time.Now().After(deadline) {
			t.Fatalf("operation never settled: %+v", body)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// Two people, one composition: each create runs on its own credential, under
// its own GitHub login, and neither can read the other's operation.
func TestGitHubUserRepoCreateBoundaryServesEachAccountsOwnCreate(t *testing.T) {
	composition := startBoundaryComposition(t)

	status, admitted := composition.do(t, 11, http.MethodPost, "/api/user/github-repos", `{"name":"widget"}`)
	require.Equal(t, http.StatusAccepted, status, admitted)
	ada, _ := admitted["operationId"].(string)
	require.NotEmpty(t, ada)

	status, admitted = composition.do(t, 22, http.MethodPost, "/api/user/github-repos", `{"name":"widget"}`)
	require.Equal(t, http.StatusAccepted, status, admitted)
	bo, _ := admitted["operationId"].(string)
	require.NotEmpty(t, bo)
	require.NotEqual(t, ada, bo, "the same name from two accounts is two operations")

	adasReceipt := composition.settle(t, 11, ada)
	assert.Equal(t, string(jobs.StateCompleted), adasReceipt["state"])
	assert.Equal(t, "ada/widget", adasReceipt["full_name"], "the owner is the credential's own login")
	assert.Positive(t, adasReceipt["repository_id"])

	bosReceipt := composition.settle(t, 22, bo)
	assert.Equal(t, string(jobs.StateCompleted), bosReceipt["state"])
	assert.Equal(t, "bo/widget", bosReceipt["full_name"])
	assert.NotEqual(t, adasReceipt["repository_id"], bosReceipt["repository_id"])

	assert.Equal(t, 2, composition.github.countOf("POST /user/repos"), "one POST per account")

	// Neither person's operation is the other's to read, and a signed-out
	// caller reads nothing at all.
	for _, foreign := range []struct {
		who         int64
		operationID string
	}{{11, bo}, {22, ada}} {
		status, body := composition.do(t, foreign.who, http.MethodGet, "/api/user/github-repo-requests/"+foreign.operationID, "")
		assert.Equal(t, http.StatusNotFound, status, body)
	}
	status, body := composition.do(t, 0, http.MethodGet, "/api/user/github-repo-requests/"+ada, "")
	assert.Equal(t, http.StatusUnauthorized, status, body)
	status, body = composition.do(t, 0, http.MethodPost, "/api/user/github-repos", `{"name":"widget"}`)
	assert.Equal(t, http.StatusUnauthorized, status, body)

	// A repeat press on a completed create joins the finished receipt rather
	// than creating a second repository.
	status, again := composition.do(t, 11, http.MethodPost, "/api/user/github-repos", `{"name":"widget"}`)
	require.Equal(t, http.StatusAccepted, status, again)
	assert.Equal(t, ada, again["operationId"])
	assert.Equal(t, 2, composition.github.countOf("POST /user/repos"))
}
