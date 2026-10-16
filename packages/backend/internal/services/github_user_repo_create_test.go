package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

/*
 * One real GitHub repository create, over real PostgreSQL (the durable store),
 * a real HTTP GitHub (httptest) and the real worker. Nothing here reaches
 * github.com: the API origin is the fixture's, and every request it receives
 * is recorded so the tests can assert WHICH calls were made, how many times,
 * and with whose credential.
 */

const (
	testGitHubUserToken = "gho_create_token"
	testGitHubLogin     = "octo"
	testGitHubUserID    = int64(4242)
)

// githubCreateFixture is the GitHub the create talks to.
type githubCreateFixture struct {
	mu sync.Mutex
	// calls records "METHOD path" in order: the one POST is visible here.
	calls []string
	// tokens records the credential each call carried.
	tokens []string
	// createStatus is the status POST /user/repos answers with (201 default).
	createStatus int
	// createBody overrides the created repository GitHub reports.
	createBody map[string]any
	// readbackStatus is the status GET /repos/{owner}/{repo} answers with.
	readbackStatus int
	// readbackBody overrides the repository the readback reports.
	readbackBody map[string]any
	// viewerLogin/viewerID are what GET /user answers.
	viewerLogin string
	viewerID    int64
	// dropCreateReply closes the connection after the repository was created.
	dropCreateReply bool
}

func newGitHubCreateFixture() *githubCreateFixture {
	return &githubCreateFixture{
		createStatus: http.StatusCreated, readbackStatus: http.StatusOK,
		viewerLogin: testGitHubLogin, viewerID: testGitHubUserID,
	}
}

func (f *githubCreateFixture) record(r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, r.Method+" "+r.URL.Path)
	f.tokens = append(f.tokens, r.Header.Get("Authorization"))
}

func (f *githubCreateFixture) countOf(call string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	count := 0
	for _, seen := range f.calls {
		if seen == call {
			count++
		}
	}
	return count
}

func (f *githubCreateFixture) credentials() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string{}, f.tokens...)
}

func (f *githubCreateFixture) start(t *testing.T) {
	t.Helper()
	repository := func() map[string]any {
		return map[string]any{
			"id": 909, "full_name": testGitHubLogin + "/widget",
			"owner": map[string]any{"id": testGitHubUserID, "login": testGitHubLogin},
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.record(r)
		f.mu.Lock()
		defer f.mu.Unlock()
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/user":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"id": f.viewerID, "login": f.viewerLogin})
		case r.Method == http.MethodPost && r.URL.Path == "/user/repos":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			assert.Equal(t, "widget", body["name"])
			assert.Equal(t, true, body["private"], "a personal repository nobody published stays private")
			if f.dropCreateReply {
				// The repository was created and the answer never arrived.
				panic(http.ErrAbortHandler)
			}
			w.WriteHeader(f.createStatus)
			if f.createStatus == http.StatusCreated {
				payload := f.createBody
				if payload == nil {
					payload = repository()
				}
				_ = json.NewEncoder(w).Encode(payload)
			}
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/repos/"):
			w.WriteHeader(f.readbackStatus)
			if f.readbackStatus == http.StatusOK {
				payload := f.readbackBody
				if payload == nil {
					payload = repository()
				}
				_ = json.NewEncoder(w).Encode(payload)
			}
		default:
			t.Errorf("unexpected GitHub call: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	t.Setenv(envGitHubAppAPIBaseURL, server.URL)
}

// newGitHubCreateService wires one service instance on its own jobs store, so
// a test can admit through one instance and run the worker through another:
// the operation lives in PostgreSQL, not in a process.
func newGitHubCreateService(t *testing.T, pool *pgxpool.Pool, queries *fakeGitHubUserReposDB) *GitHubUserReposService {
	t.Helper()
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	service := NewGitHubUserReposService(queries, fakeOAuthTokenDecrypter{token: testGitHubUserToken})
	service.SetGitHubRepoCreateJobs(store)
	return service
}

func linkedGitHubAccount() *fakeGitHubUserReposDB {
	queries := newFakeGitHubUserReposDB()
	queries.accounts = []db.OauthAccount{{
		Provider: "github", ProviderUserID: "4242", AccessTokenEncrypted: []byte("encrypted"),
	}}
	return queries
}

// settleGitHubCreate runs the real worker until the operation is terminal.
func settleGitHubCreate(t *testing.T, service *GitHubUserReposService, userID int64, operationID string) GitHubRepoCreateStatus {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stopped := make(chan error, 1)
	go func() {
		stopped <- service.createJobs.RunWorker(ctx, jobs.WorkerConfig{
			WorkerID: "github-repo-create-test", Capacity: 1, Lease: 30 * time.Second,
			PollInterval: time.Millisecond, RetryDelay: 10 * time.Millisecond,
			Operations: []string{GitHubUserRepoCreateOperation},
		}, service.HandleGitHubUserRepoCreate)
	}()
	deadline := time.Now().Add(30 * time.Second)
	for {
		status, err := service.GitHubUserRepoCreateStatus(context.Background(), userID, operationID)
		require.NoError(t, err)
		if jobs.State(status.State).Terminal() {
			cancel()
			<-stopped
			return status
		}
		if time.Now().After(deadline) {
			cancel()
			<-stopped
			t.Fatalf("operation never settled: %+v", status)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// The whole act: one POST on the person's own credential, a readback GitHub
// repeated, and a receipt that names the repository GitHub itself answered.
func TestGitHubUserRepoCreateCompletesAfterReadback(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.start(t)
	queries := linkedGitHubAccount()

	admitting := newGitHubCreateService(t, pool, queries)
	receipt, err := admitting.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	require.NotEmpty(t, receipt.OperationID)
	assert.Equal(t, jobs.StateAccepted, receipt.State, "admission answers before GitHub does")
	assert.Equal(t, 0, fixture.countOf("POST /user/repos"), "admission writes GitHub nothing")

	// A different service instance and a different jobs store: the operation
	// is durable, so a restarted worker finishes the admitted intent.
	worker := newGitHubCreateService(t, pool, queries)
	status := settleGitHubCreate(t, worker, 7, receipt.OperationID)
	assert.Equal(t, string(jobs.StateCompleted), status.State)
	assert.Equal(t, "octo/widget", status.FullName)
	assert.Equal(t, int64(909), status.RepositoryID)
	assert.Equal(t, githubRepoCreateStageReadback, status.Stage)
	assert.Empty(t, status.Code)
	assert.Equal(t, 1, fixture.countOf("POST /user/repos"), "exactly one repository was created")
	assert.Equal(t, 1, fixture.countOf("GET /repos/octo/widget"), "the repository is read back once")
	for _, credential := range fixture.credentials() {
		assert.Equal(t, "Bearer "+testGitHubUserToken, credential, "only the actor's own credential writes")
	}
}

// Pressing Create twice on one intent is one repository.
func TestGitHubUserRepoCreateJoinsTheSameIntent(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.start(t)
	service := newGitHubCreateService(t, pool, linkedGitHubAccount())

	first, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	second, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	assert.Equal(t, first.OperationID, second.OperationID, "one intent is one operation")
	assert.True(t, second.Joined)

	status := settleGitHubCreate(t, service, 7, first.OperationID)
	require.Equal(t, string(jobs.StateCompleted), status.State)
	// And a press AFTER it completed still joins the finished receipt.
	third, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	assert.Equal(t, first.OperationID, third.OperationID)
	assert.Equal(t, 1, fixture.countOf("POST /user/repos"), "no repeat press creates a second repository")
}

// A POST whose reply was lost: uncertain, attempted once, never repeated.
func TestGitHubUserRepoCreateUncertainReplyIsNeverRetried(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.dropCreateReply = true
	fixture.start(t)
	service := newGitHubCreateService(t, pool, linkedGitHubAccount())

	receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	status := settleGitHubCreate(t, service, 7, receipt.OperationID)
	assert.Equal(t, string(jobs.StateUncertain), status.State)
	assert.Equal(t, GitHubRepoCreateCodeUncertain, status.Code)
	assert.Equal(t, 1, status.ExternalAttempt, "the attempt was durable before the POST left")
	assert.Equal(t, 1, fixture.countOf("POST /user/repos"))
	assert.Equal(t, 0, fixture.countOf("GET /repos/octo/widget"), "an unconfirmed create reads nothing back")

	// Pressing Create again joins the uncertain operation: a repository that
	// may already exist is never created a second time.
	again, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	assert.Equal(t, receipt.OperationID, again.OperationID)
	assert.Equal(t, 1, fixture.countOf("POST /user/repos"))
}

// Each refusal GitHub gives names its own act, and none of them claims a
// repository was created.
func TestGitHubUserRepoCreateRefusals(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		status int
		code   string
	}{
		{"a rejected credential asks for a new one", http.StatusUnauthorized, GitHubRepoCreateCodeReauthorize},
		{"a refused create is a permission answer", http.StatusForbidden, GitHubRepoCreateCodePermission},
		{"a name the account has is not a create", http.StatusUnprocessableEntity, GitHubRepoCreateCodeExists},
		{"a rate-limited call created nothing", http.StatusTooManyRequests, GitHubRepoCreateCodeRateLimited},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			pool, _ := postgresfixture.NewProductDatabase(t)
			fixture := newGitHubCreateFixture()
			fixture.createStatus = testCase.status
			fixture.start(t)
			service := newGitHubCreateService(t, pool, linkedGitHubAccount())

			receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
			require.NoError(t, err)
			status := settleGitHubCreate(t, service, 7, receipt.OperationID)
			assert.Equal(t, string(jobs.StateFailed), status.State)
			assert.Equal(t, testCase.code, status.Code)
			assert.Equal(t, githubRepoCreateStageCreate, status.Stage)
			assert.Empty(t, status.FullName, "a refusal names no repository")
			assert.Equal(t, 0, fixture.countOf("GET /repos/octo/widget"))

			// A refusal created nothing, so the person may try again: the next
			// press is a NEW operation rather than a replay of the refusal.
			next, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
			require.NoError(t, err)
			assert.NotEqual(t, receipt.OperationID, next.OperationID)
		})
	}
}

// The account's GitHub identity changed after admission: the intent is not
// this actor's any more, so nothing is written and the receipt is kept.
func TestGitHubUserRepoCreateRefusesAChangedActor(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.start(t)
	queries := linkedGitHubAccount()
	service := newGitHubCreateService(t, pool, queries)

	receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	queries.accounts = []db.OauthAccount{{
		Provider: "github", ProviderUserID: "8888", AccessTokenEncrypted: []byte("encrypted"),
	}}
	status := settleGitHubCreate(t, service, 7, receipt.OperationID)
	assert.Equal(t, string(jobs.StateFailed), status.State)
	assert.Equal(t, GitHubRepoCreateCodeActorChanged, status.Code)
	assert.Equal(t, githubRepoCreateStageActor, status.Stage)
	assert.Equal(t, 0, fixture.countOf("POST /user/repos"), "a changed actor writes nothing")
}

// GitHub's login no longer matches the account the intent was admitted for.
func TestGitHubUserRepoCreateRefusesAForkedViewer(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.viewerID = 9999
	fixture.start(t)
	service := newGitHubCreateService(t, pool, linkedGitHubAccount())

	receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	status := settleGitHubCreate(t, service, 7, receipt.OperationID)
	assert.Equal(t, string(jobs.StateFailed), status.State)
	assert.Equal(t, GitHubRepoCreateCodeActorChanged, status.Code)
	assert.Equal(t, 0, fixture.countOf("POST /user/repos"))
}

/*
 * A readback that answers a different repository is not this create's proof —
 * and it is not a refusal either. GitHub answered 201 before it, so the POST
 * MAY have created the repository: the only honest outcome is uncertain, and a
 * repeat press must JOIN that one operation instead of issuing a second POST.
 *
 * This is the regression for root's 2026-10-16 review of lane 59: the mismatch
 * settled `failed`, and `failed` is the one state githubRepoCreateKey reopens,
 * so pressing Create again created a second repository.
 */
func TestGitHubUserRepoCreateMismatchedReadbackStaysUncertainAndIsNeverRepeated(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.readbackBody = map[string]any{
		"id": 11, "full_name": "someone-else/widget",
		"owner": map[string]any{"id": 55, "login": "someone-else"},
	}
	fixture.start(t)
	service := newGitHubCreateService(t, pool, linkedGitHubAccount())

	receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	status := settleGitHubCreate(t, service, 7, receipt.OperationID)
	assert.Equal(t, string(jobs.StateUncertain), status.State, "a create that got 201 is never reported as a refusal")
	assert.Equal(t, GitHubRepoCreateCodeReadbackMismatch, status.Code)
	assert.Empty(t, status.FullName, "an unverified create names no repository")
	assert.Zero(t, status.RepositoryID)
	assert.Equal(t, 1, status.ExternalAttempt)
	assert.Equal(t, 1, fixture.countOf("POST /user/repos"))

	// The press that used to open a second generation of the key.
	again, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	assert.Equal(t, receipt.OperationID, again.OperationID, "a repeat press joins the uncertain operation")
	assert.True(t, again.Joined)
	// Settle whatever that press admitted. A joined operation is already
	// terminal, so this returns the SAME receipt; a second generation would
	// run the worker again and leave a second POST behind.
	repeated := settleGitHubCreate(t, service, 7, again.OperationID)
	assert.Equal(t, string(jobs.StateUncertain), repeated.State)
	assert.Equal(t, 1, fixture.countOf("POST /user/repos"), "no second repository is ever created")

	// Reading it again still answers uncertain, and still names nothing.
	reread, err := service.GitHubUserRepoCreateStatus(context.Background(), 7, receipt.OperationID)
	require.NoError(t, err)
	assert.Equal(t, string(jobs.StateUncertain), reread.State)
	assert.Equal(t, GitHubRepoCreateCodeReadbackMismatch, reread.Code)
	assert.Empty(t, reread.FullName)
}

/*
 * Nothing but a complete, agreeing identity is a created repository. Each case
 * below is one GitHub answered after its own 201, and none of them may be
 * claimed as a create: a zero or absent id (JSON's default, not an identity),
 * two different ids across the two answers, another account's owner id, and a
 * name that is not the one asked for.
 */
func TestGitHubUserRepoCreateRefusesMalformedCreatedIdentities(t *testing.T) {
	const full = testGitHubLogin + "/widget"
	owner := func() map[string]any {
		return map[string]any{"id": testGitHubUserID, "login": testGitHubLogin}
	}
	for _, testCase := range []struct {
		name            string
		created, readbk map[string]any
	}{
		{"the readback has no id at all",
			map[string]any{"id": 909, "full_name": full, "owner": owner()},
			map[string]any{"full_name": full, "owner": owner()}},
		{"the readback's id is zero",
			map[string]any{"id": 909, "full_name": full, "owner": owner()},
			map[string]any{"id": 0, "full_name": full, "owner": owner()}},
		{"the created id is zero",
			map[string]any{"id": 0, "full_name": full, "owner": owner()},
			map[string]any{"id": 909, "full_name": full, "owner": owner()}},
		{"the created id is absent",
			map[string]any{"full_name": full, "owner": owner()},
			map[string]any{"id": 909, "full_name": full, "owner": owner()}},
		{"the two ids are different repositories",
			map[string]any{"id": 909, "full_name": full, "owner": owner()},
			map[string]any{"id": 910, "full_name": full, "owner": owner()}},
		{"the created owner is another account",
			map[string]any{"id": 909, "full_name": full, "owner": map[string]any{"id": 55, "login": testGitHubLogin}},
			map[string]any{"id": 909, "full_name": full, "owner": owner()}},
		{"the created name is another repository",
			map[string]any{"id": 909, "full_name": testGitHubLogin + "/other", "owner": owner()},
			map[string]any{"id": 909, "full_name": full, "owner": owner()}},
		{"the created answer carries no identity",
			map[string]any{},
			map[string]any{"id": 909, "full_name": full, "owner": owner()}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			pool, _ := postgresfixture.NewProductDatabase(t)
			fixture := newGitHubCreateFixture()
			fixture.createBody, fixture.readbackBody = testCase.created, testCase.readbk
			fixture.start(t)
			service := newGitHubCreateService(t, pool, linkedGitHubAccount())

			receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
			require.NoError(t, err)
			status := settleGitHubCreate(t, service, 7, receipt.OperationID)
			assert.Equal(t, string(jobs.StateUncertain), status.State)
			assert.Equal(t, GitHubRepoCreateCodeReadbackMismatch, status.Code)
			assert.Empty(t, status.FullName, "no malformed identity is ever claimed created")
			assert.Zero(t, status.RepositoryID)

			again, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
			require.NoError(t, err)
			assert.Equal(t, receipt.OperationID, again.OperationID)
			assert.Equal(t, 1, fixture.countOf("POST /user/repos"))
		})
	}
}

/*
 * The queued actor fence. The payload names the account whose credential the
 * worker is about to load, so an admission whose payload disagrees with the
 * scope or the authorization context it was admitted under is not this
 * operation's intent: it is refused BEFORE any credential lookup or GitHub
 * call. Admitted here through the store's own Admit, the way a poisoned queue
 * row would reach the worker.
 */
func TestGitHubUserRepoCreateRefusesAPoisonedPayloadScope(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		scopeUser     int64
		payload       string
		authorization string
	}{
		{"the payload names another account than the scope it was admitted under",
			7, `{"user_id":8,"github_user_id":"4242","name":"widget","private":true}`,
			`{"user_id":8,"github_user_id":"4242"}`},
		{"the payload names another account than the authorization context",
			7, `{"user_id":7,"github_user_id":"4242","name":"widget","private":true}`,
			`{"user_id":8,"github_user_id":"4242"}`},
		{"the payload names another GitHub identity than the authorization context",
			7, `{"user_id":7,"github_user_id":"4242","name":"widget","private":true}`,
			`{"user_id":7,"github_user_id":"8888"}`},
		{"the operation carries no authorization context at all",
			7, `{"user_id":7,"github_user_id":"4242","name":"widget","private":true}`, ``},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			pool, _ := postgresfixture.NewProductDatabase(t)
			fixture := newGitHubCreateFixture()
			fixture.start(t)
			service := newGitHubCreateService(t, pool, linkedGitHubAccount())

			admission := jobs.Admission{
				Scope: githubRepoCreateScope(testCase.scopeUser), Operation: GitHubUserRepoCreateOperation,
				RequestID: "poisoned-" + testCase.name, Payload: json.RawMessage(testCase.payload),
				EffectPolicy: jobs.EffectUnsafe,
			}
			if testCase.authorization != "" {
				admission.AuthorizationContext = json.RawMessage(testCase.authorization)
			}
			receipt, err := service.createJobs.Admit(context.Background(), admission)
			require.NoError(t, err)

			status := settleGitHubCreate(t, service, testCase.scopeUser, receipt.OperationID)
			assert.Equal(t, string(jobs.StateFailed), status.State)
			assert.Equal(t, GitHubRepoCreateCodeInvalid, status.Code)
			assert.Equal(t, githubRepoCreateStageActor, status.Stage)
			assert.Equal(t, 0, fixture.countOf("GET /user"), "no credential is proved for a payload the fence refused")
			assert.Equal(t, 0, fixture.countOf("POST /user/repos"), "and nothing is written on GitHub")
			assert.Empty(t, status.FullName, "and the refusal names no repository")
		})
	}
}

// A create nobody can read back is unconfirmed, not a success.
func TestGitHubUserRepoCreateUnreadableReadbackStaysUncertain(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.readbackStatus = http.StatusNotFound
	fixture.start(t)
	service := newGitHubCreateService(t, pool, linkedGitHubAccount())

	receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	status := settleGitHubCreate(t, service, 7, receipt.OperationID)
	assert.Equal(t, string(jobs.StateUncertain), status.State)
	assert.Empty(t, status.FullName)
}

// One account's create is not another account's to read.
func TestGitHubUserRepoCreateStatusIsScopedToTheAccount(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	fixture := newGitHubCreateFixture()
	fixture.start(t)
	service := newGitHubCreateService(t, pool, linkedGitHubAccount())

	receipt, err := service.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.NoError(t, err)
	_, err = service.GitHubUserRepoCreateStatus(context.Background(), 8, receipt.OperationID)
	require.Error(t, err)
	assert.Equal(t, http.StatusNotFound, statusOfAPIError(err))
	_, err = service.GitHubUserRepoCreateStatus(context.Background(), 7, "not-an-operation")
	require.Error(t, err)
	assert.Equal(t, http.StatusNotFound, statusOfAPIError(err))
}

// Nothing is admitted without a GitHub link, an owner-shaped name, or a store.
func TestGitHubUserRepoCreateRefusesBeforeAdmission(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	unlinked := newGitHubCreateService(t, pool, newFakeGitHubUserReposDB())
	_, err := unlinked.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.Error(t, err)
	assert.Equal(t, http.StatusUnauthorized, statusOfAPIError(err), "no linked GitHub account, no create")

	service := newGitHubCreateService(t, pool, linkedGitHubAccount())
	for _, name := range []string{"", "  ", "owner/widget", "..", strings.Repeat("w", 101)} {
		_, err = service.RequestGitHubUserRepoCreate(context.Background(), 7, name, true)
		require.Error(t, err, name)
		assert.Equal(t, http.StatusBadRequest, statusOfAPIError(err), name)
	}

	unwired := NewGitHubUserReposService(linkedGitHubAccount(), fakeOAuthTokenDecrypter{token: testGitHubUserToken})
	_, err = unwired.RequestGitHubUserRepoCreate(context.Background(), 7, "widget", true)
	require.Error(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, statusOfAPIError(err), "no store, no inline GitHub write")
}
