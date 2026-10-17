package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

/*
 * The two GitHub-repository-create doors, at the handler boundary: what the
 * request may carry, who the create is admitted for, and what the receipt
 * says. The service itself (one real POST on the person's own credential,
 * actor re-authorization, readback, uncertainty) is covered over real
 * PostgreSQL and a real HTTP GitHub in services/github_user_repo_create_test.go.
 */

type mockGitHubRepoCreateService struct {
	mockGitHubUserReposRouteService
	createFn func(context.Context, int64, string, bool) (jobs.RequestReceipt, error)
	statusFn func(context.Context, int64, string) (services.GitHubRepoCreateStatus, error)
}

func (m mockGitHubRepoCreateService) RequestGitHubUserRepoCreate(ctx context.Context, userID int64, name string, private bool) (jobs.RequestReceipt, error) {
	return m.createFn(ctx, userID, name, private)
}

func (m mockGitHubRepoCreateService) GitHubUserRepoCreateStatus(ctx context.Context, userID int64, id string) (services.GitHubRepoCreateStatus, error) {
	return m.statusFn(ctx, userID, id)
}

func createRequest(t *testing.T, body string, signedIn bool) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/user/github-repos", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if !signedIn {
		return req
	}
	return req.WithContext(context.WithValue(req.Context(), middleware.UserContextKey, &db.User{ID: 42, Username: "octo"}))
}

func TestGitHubUserRepoCreateHandler_AdmitsForTheSignedInAccount(t *testing.T) {
	t.Parallel()
	handler := &GitHubUserReposHandler{Service: mockGitHubRepoCreateService{
		createFn: func(_ context.Context, userID int64, name string, private bool) (jobs.RequestReceipt, error) {
			assert.Equal(t, int64(42), userID, "the create is admitted for the session's own account")
			assert.Equal(t, "widget", name)
			assert.True(t, private, "an absent `private` is private")
			return jobs.RequestReceipt{OperationID: "op-1", RequestID: "key-1", Kind: "requested", State: jobs.StateAccepted, AcceptedAt: time.Unix(0, 0).UTC()}, nil
		},
	}}
	rec := httptest.NewRecorder()
	handler.CreateGitHubUserRepo(rec, createRequest(t, `{"name":"widget"}`, true))

	require.Equal(t, http.StatusAccepted, rec.Code, "the acknowledgment is not the repository")
	assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
	var receipt map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &receipt))
	assert.Equal(t, "op-1", receipt["operationId"])
	assert.Equal(t, "accepted", receipt["state"])
}

func TestGitHubUserRepoCreateHandler_RefusesWhatItCannotRun(t *testing.T) {
	t.Parallel()
	refusing := &GitHubUserReposHandler{Service: mockGitHubRepoCreateService{
		createFn: func(context.Context, int64, string, bool) (jobs.RequestReceipt, error) {
			return jobs.RequestReceipt{}, pkgerrors.Unauthorized("github oauth account is not connected")
		},
	}}
	rec := httptest.NewRecorder()
	refusing.CreateGitHubUserRepo(rec, createRequest(t, `{"name":"widget"}`, true))
	assert.Equal(t, http.StatusUnauthorized, rec.Code, "no linked GitHub account, no create")

	// Signed out: nothing is admitted and no service call is made.
	anonymous := &GitHubUserReposHandler{Service: mockGitHubRepoCreateService{
		createFn: func(context.Context, int64, string, bool) (jobs.RequestReceipt, error) {
			t.Error("a signed-out request must not reach the create")
			return jobs.RequestReceipt{}, nil
		},
	}}
	rec = httptest.NewRecorder()
	anonymous.CreateGitHubUserRepo(rec, createRequest(t, `{"name":"widget"}`, false))
	assert.Equal(t, http.StatusUnauthorized, rec.Code)

	/*
	 * The body is the name (and optionally `private`). An owner, a token, a
	 * URL or an idempotency key in it is an unknown field, refused before
	 * anything is admitted — a client cannot name the account it writes under.
	 */
	strict := &GitHubUserReposHandler{Service: mockGitHubRepoCreateService{
		createFn: func(context.Context, int64, string, bool) (jobs.RequestReceipt, error) {
			t.Error("an unknown field must not reach the create")
			return jobs.RequestReceipt{}, nil
		},
	}}
	for _, body := range []string{
		`{"name":"widget","owner":"someone-else"}`,
		`{"name":"widget","token":"gho_x"}`,
		`{"name":"widget","idempotency_key":"forged"}`,
		`{"name":"widget","html_url":"https://github.com/someone-else/widget"}`,
		`not json`,
	} {
		rec = httptest.NewRecorder()
		strict.CreateGitHubUserRepo(rec, createRequest(t, body, true))
		assert.Equal(t, http.StatusBadRequest, rec.Code, body)
	}
}

func TestGitHubUserRepoCreateHandler_PassesAnExplicitVisibility(t *testing.T) {
	t.Parallel()
	seen := []bool{}
	handler := &GitHubUserReposHandler{Service: mockGitHubRepoCreateService{
		createFn: func(_ context.Context, _ int64, _ string, private bool) (jobs.RequestReceipt, error) {
			seen = append(seen, private)
			return jobs.RequestReceipt{OperationID: "op-1", State: jobs.StateAccepted}, nil
		},
	}}
	for _, body := range []string{`{"name":"widget","private":false}`, `{"name":"widget","private":true}`} {
		rec := httptest.NewRecorder()
		handler.CreateGitHubUserRepo(rec, createRequest(t, body, true))
		require.Equal(t, http.StatusAccepted, rec.Code)
	}
	assert.Equal(t, []bool{false, true}, seen)
}

func TestGitHubUserRepoCreateStatusHandler_ReadsTheCallersOwnRequest(t *testing.T) {
	t.Parallel()
	handler := &GitHubUserReposHandler{Service: mockGitHubRepoCreateService{
		statusFn: func(_ context.Context, userID int64, id string) (services.GitHubRepoCreateStatus, error) {
			assert.Equal(t, int64(42), userID)
			assert.Equal(t, "op-1", id)
			return services.GitHubRepoCreateStatus{
				OperationID: "op-1", State: "completed", Stage: "readback",
				FullName: "octo/widget", RepositoryID: 909,
			}, nil
		},
	}}
	request := httptest.NewRequest(http.MethodGet, "/api/user/github-repo-requests/op-1", nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("id", "op-1")
	ctx := context.WithValue(request.Context(), chi.RouteCtxKey, routeContext)
	ctx = context.WithValue(ctx, middleware.UserContextKey, &db.User{ID: 42, Username: "octo"})
	rec := httptest.NewRecorder()
	handler.GetGitHubUserRepoCreate(rec, request.WithContext(ctx))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
	var status services.GitHubRepoCreateStatus
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &status))
	assert.Equal(t, "completed", status.State)
	assert.Equal(t, "octo/widget", status.FullName)
	assert.Equal(t, int64(909), status.RepositoryID)
	assert.Empty(t, status.Code)
}

func TestGitHubUserRepoCreateHandler_UnwiredServiceAnswersUnavailable(t *testing.T) {
	t.Parallel()
	// A service without the create (no durable store wired): the door says so
	// rather than writing GitHub inline from the request.
	handler := &GitHubUserReposHandler{Service: mockGitHubUserReposRouteService{}}
	rec := httptest.NewRecorder()
	handler.CreateGitHubUserRepo(rec, createRequest(t, `{"name":"widget"}`, true))
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	rec = httptest.NewRecorder()
	handler.GetGitHubUserRepoCreate(rec, createRequest(t, "", true))
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
}
