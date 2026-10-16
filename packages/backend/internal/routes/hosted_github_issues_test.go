package routes

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// recordingHostedIssueWriter records exactly what each door admitted,
// including the idempotency key it must forward unchanged.
type recordingHostedIssueWriter struct{ admitted []string }

func (w *recordingHostedIssueWriter) admit(call string) (jobs.RequestReceipt, error) {
	w.admitted = append(w.admitted, call)
	return jobs.RequestReceipt{Kind: "requested", OperationID: "op-1"}, nil
}

func (w *recordingHostedIssueWriter) RequestGitHubIssueCreate(_ context.Context, repository int64, input services.InstallIssueCreateInput, key string) (jobs.RequestReceipt, error) {
	return w.admit(fmt.Sprintf("create %d %q %q %s", repository, input.Title, input.Body, key))
}

func (w *recordingHostedIssueWriter) RequestGitHubIssueComment(_ context.Context, repository, number int64, body, key string) (jobs.RequestReceipt, error) {
	return w.admit(fmt.Sprintf("comment %d #%d %q %s", repository, number, body, key))
}

func (w *recordingHostedIssueWriter) RequestGitHubIssueClose(_ context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	return w.admit(fmt.Sprintf("close %d #%d %s", repository, number, key))
}

func (w *recordingHostedIssueWriter) RequestGitHubIssueReopen(_ context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	return w.admit(fmt.Sprintf("reopen %d #%d %s", repository, number, key))
}

func (w *recordingHostedIssueWriter) RequestGitHubIssueCommentEdit(_ context.Context, repository, comment int64, body, key string) (jobs.RequestReceipt, error) {
	return w.admit(fmt.Sprintf("edit %d comment:%d %q %s", repository, comment, body, key))
}

func (w *recordingHostedIssueWriter) GitHubIssueRequestStatus(_ context.Context, repository int64, id string) (map[string]any, error) {
	w.admitted = append(w.admitted, fmt.Sprintf("status %d %s", repository, id))
	return map[string]any{"state": "completed"}, nil
}

// hostedIssueRouter mounts the doors with ONE repository loaded in context, as
// the composed chain loads it before the handler runs.
func hostedIssueRouter(writer HostedGitHubIssueWriter, repository int64) http.Handler {
	handler := &HostedGitHubIssuesHandler{Service: writer}
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.ContextWithRepoContext(r.Context(),
				&middleware.RepoContext{Repository: &db.Repository{ID: repository, Name: "flows"}}, middleware.PermissionWrite)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	router.Post("/api/repos/{owner}/{repo}/github/issues", handler.Create)
	router.Post("/api/repos/{owner}/{repo}/github/issues/{number}/comments", handler.Comment)
	router.Post("/api/repos/{owner}/{repo}/github/issues/{number}/close", handler.Close)
	router.Post("/api/repos/{owner}/{repo}/github/issues/{number}/reopen", handler.Reopen)
	router.Patch("/api/repos/{owner}/{repo}/github/issues/comments/{id}", handler.EditComment)
	router.Get("/api/repos/{owner}/{repo}/github/issues/requests/{id}", handler.Request)
	return router
}

func hostedIssueCall(t *testing.T, router http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "key-1")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

// Each door admits exactly ONE act, for the repository the route loaded — a
// body can neither name the repository nor turn one act into another.
func TestHostedGitHubIssueDoorsAdmitOneActForTheRoutesRepository(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, body, admitted string
	}{
		{"create", http.MethodPost, "/api/repos/will/flows/github/issues", `{"title":"Upstream bug","body":"Seen on main."}`, `create 77 "Upstream bug" "Seen on main." key-1`},
		{"comment", http.MethodPost, "/api/repos/will/flows/github/issues/6/comments", `{"body":"please look"}`, `comment 77 #6 "please look" key-1`},
		{"close", http.MethodPost, "/api/repos/will/flows/github/issues/6/close", "", `close 77 #6 key-1`},
		{"reopen", http.MethodPost, "/api/repos/will/flows/github/issues/6/reopen", "", `reopen 77 #6 key-1`},
		{"comment edit", http.MethodPatch, "/api/repos/will/flows/github/issues/comments/5", `{"body":"shorter"}`, `edit 77 comment:5 "shorter" key-1`},
		{"receipt", http.MethodGet, "/api/repos/will/flows/github/issues/requests/op-1", "", `status 77 op-1`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			writer := &recordingHostedIssueWriter{}
			recorder := hostedIssueCall(t, hostedIssueRouter(writer, 77), tc.method, tc.path, tc.body)
			expected := http.StatusAccepted
			if tc.method == http.MethodGet {
				expected = http.StatusOK
			}
			require.Equal(t, expected, recorder.Code, recorder.Body.String())
			require.Equal(t, []string{tc.admitted}, writer.admitted)
			require.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
		})
	}
}

// A repository named in the body is not read at all: the strict decode
// refuses the unknown field, so nothing is admitted.
func TestHostedGitHubIssueDoorsRefuseARepositoryInTheBody(t *testing.T) {
	writer := &recordingHostedIssueWriter{}
	recorder := hostedIssueCall(t, hostedIssueRouter(writer, 77), http.MethodPost,
		"/api/repos/will/flows/github/issues", `{"title":"t","body":"b","repository":99}`)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Empty(t, writer.admitted)
}

// An unusable subject is refused before admission, and an unconfigured writer
// fails closed rather than answering as though the act had been accepted.
func TestHostedGitHubIssueDoorsRefuseUnusableSubjects(t *testing.T) {
	writer := &recordingHostedIssueWriter{}
	router := hostedIssueRouter(writer, 77)
	for _, path := range []string{
		"/api/repos/will/flows/github/issues/0/close",
		"/api/repos/will/flows/github/issues/0/reopen",
		"/api/repos/will/flows/github/issues/0/comments",
	} {
		recorder := hostedIssueCall(t, router, http.MethodPost, path, `{"body":"x"}`)
		require.Equal(t, http.StatusBadRequest, recorder.Code, path)
	}
	require.Empty(t, writer.admitted)

	unconfigured := hostedIssueRouter(nil, 77)
	recorder := hostedIssueCall(t, unconfigured, http.MethodPost, "/api/repos/will/flows/github/issues/6/close", "")
	require.Equal(t, http.StatusInternalServerError, recorder.Code)
}
