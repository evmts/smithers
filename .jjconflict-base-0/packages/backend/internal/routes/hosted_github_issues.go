package routes

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// HostedGitHubIssueWriter is the durable repository-scoped GitHub issue
// writer these doors admit onto. Every method admits ONE act and returns at
// once; the write itself happens on the shared issue-write worker.
type HostedGitHubIssueWriter interface {
	RequestGitHubIssueCreate(ctx context.Context, repository int64, input services.InstallIssueCreateInput, key string) (jobs.RequestReceipt, error)
	RequestGitHubIssueComment(ctx context.Context, repository, number int64, body, key string) (jobs.RequestReceipt, error)
	RequestGitHubIssueClose(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error)
	RequestGitHubIssueReopen(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error)
	RequestGitHubIssueCommentEdit(ctx context.Context, repository, comment int64, body, key string) (jobs.RequestReceipt, error)
	RequestGitHubIssueTransition(ctx context.Context, repository, number int64, transition, key string) (jobs.RequestReceipt, error)
	GitHubIssueRequestStatus(ctx context.Context, repository int64, id string) (map[string]any, error)
}

// HostedGitHubIssuesHandler serves the repository's OWN GitHub issue tracker
// under the existing repo-scoped GitHub family:
//
//	POST   /api/repos/{owner}/{repo}/github/issues
//	POST   /api/repos/{owner}/{repo}/github/issues/{number}/comments
//	POST   /api/repos/{owner}/{repo}/github/issues/{number}/close
//	POST   /api/repos/{owner}/{repo}/github/issues/{number}/reopen
//	PATCH  /api/repos/{owner}/{repo}/github/issues/comments/{id}
//	POST   /api/repos/{owner}/{repo}/github/issues/{number}/transitions/{id}
//	GET    /api/repos/{owner}/{repo}/github/issues/requests/{id}
//
// These are DISTINCT from /api/repos/{owner}/{repo}/issues, which is Smithers
// Cloud's own tracker and keeps its meaning exactly: the two number
// independently, so `#6` names two different objects and each door says which
// one it means. The repository comes from the route's own loaded context —
// never from a request body — and the middleware chain is the ordinary
// RequireAuth + ScopeWriteRepository + RequireRepoPermission(write) one.
type HostedGitHubIssuesHandler struct {
	Service HostedGitHubIssueWriter
}

// repository is the route's loaded repository. A request can neither name
// another one nor forge the binding: the chain resolved it before this ran.
func (h *HostedGitHubIssuesHandler) repository(w http.ResponseWriter, r *http.Request) (int64, bool) {
	if h == nil || h.Service == nil {
		pkgerrors.WriteError(w, pkgerrors.Internal("the GitHub issue writer is not configured"))
		return 0, false
	}
	repo := middleware.RepoFromContext(r.Context())
	if repo == nil {
		pkgerrors.WriteError(w, pkgerrors.Internal("repository context not loaded"))
		return 0, false
	}
	return repo.ID, true
}

func (h *HostedGitHubIssuesHandler) number(w http.ResponseWriter, r *http.Request, param, code string) (int64, bool) {
	value, err := strconv.ParseInt(chi.URLParam(r, param), 10, 64)
	if err != nil || value <= 0 {
		todoRouteError(w, &services.TodoControlError{Status: http.StatusBadRequest, Code: code, Class: "user", Message: "Invalid issue"})
		return 0, false
	}
	return value, true
}

// accepted answers the admission receipt. It says the act was REQUESTED, not
// that GitHub has done it: nothing here has reached GitHub yet.
func accepted(w http.ResponseWriter, receipt jobs.RequestReceipt, err error) {
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	pkgerrors.WriteJSON(w, http.StatusAccepted, receipt)
}

// Create admits the create of one GitHub issue in this repository.
func (h *HostedGitHubIssuesHandler) Create(w http.ResponseWriter, r *http.Request) {
	repository, ok := h.repository(w, r)
	if !ok {
		return
	}
	var input services.InstallIssueCreateInput
	if !decodeStrictJSONBody(w, r, &input) {
		return
	}
	receipt, err := h.Service.RequestGitHubIssueCreate(r.Context(), repository, input, r.Header.Get("Idempotency-Key"))
	accepted(w, receipt, err)
}

// Comment admits a comment on one of this repository's GitHub issues.
func (h *HostedGitHubIssuesHandler) Comment(w http.ResponseWriter, r *http.Request) {
	repository, ok := h.repository(w, r)
	if !ok {
		return
	}
	number, ok := h.number(w, r, "number", "invalid_issue_comment")
	if !ok {
		return
	}
	var input struct {
		Body string `json:"body"`
	}
	if !decodeStrictJSONBody(w, r, &input) {
		return
	}
	receipt, err := h.Service.RequestGitHubIssueComment(r.Context(), repository, number, input.Body, r.Header.Get("Idempotency-Key"))
	accepted(w, receipt, err)
}

// Close and Reopen carry no body: the door itself names the act, so a request
// authorized to close can never arrive as a reopen.
func (h *HostedGitHubIssuesHandler) Close(w http.ResponseWriter, r *http.Request) {
	h.state(w, r, HostedGitHubIssueWriter.RequestGitHubIssueClose)
}

func (h *HostedGitHubIssuesHandler) Reopen(w http.ResponseWriter, r *http.Request) {
	h.state(w, r, HostedGitHubIssueWriter.RequestGitHubIssueReopen)
}

func (h *HostedGitHubIssuesHandler) state(w http.ResponseWriter, r *http.Request,
	admit func(HostedGitHubIssueWriter, context.Context, int64, int64, string) (jobs.RequestReceipt, error)) {
	repository, ok := h.repository(w, r)
	if !ok {
		return
	}
	number, ok := h.number(w, r, "number", "invalid_issue_state")
	if !ok {
		return
	}
	receipt, err := admit(h.Service, r.Context(), repository, number, r.Header.Get("Idempotency-Key"))
	accepted(w, receipt, err)
}

// EditComment admits a new body for one comment the App wrote on this
// repository. The comment id is the subject, so no issue number can disagree
// with it.
func (h *HostedGitHubIssuesHandler) EditComment(w http.ResponseWriter, r *http.Request) {
	repository, ok := h.repository(w, r)
	if !ok {
		return
	}
	comment, ok := h.number(w, r, "id", "invalid_issue_comment")
	if !ok {
		return
	}
	var input struct {
		Body string `json:"body"`
	}
	if !decodeStrictJSONBody(w, r, &input) {
		return
	}
	receipt, err := h.Service.RequestGitHubIssueCommentEdit(r.Context(), repository, comment, input.Body, r.Header.Get("Idempotency-Key"))
	accepted(w, receipt, err)
}

// Transition admits ONE declared issue transition. The transition id is a
// path segment and the issue number another, so the request carries no body
// at all: it cannot name a label, a repository or an actor. Which labels the
// transition moves between, and whether a person has to make it, come from
// the repository's own committed declaration — read by the service before
// this returns and re-read on the worker before the write.
//
// An undeclared transition, a declaration this server could not read, and an
// agent asking for a person-only move are all refused here, so no durable
// operation exists for them and nothing is asked of GitHub.
func (h *HostedGitHubIssuesHandler) Transition(w http.ResponseWriter, r *http.Request) {
	repository, ok := h.repository(w, r)
	if !ok {
		return
	}
	number, ok := h.number(w, r, "number", "invalid_issue_state")
	if !ok {
		return
	}
	receipt, err := h.Service.RequestGitHubIssueTransition(r.Context(), repository, number,
		chi.URLParam(r, "id"), r.Header.Get("Idempotency-Key"))
	accepted(w, receipt, err)
}

// Request answers one admitted act's outcome. It is the door a client whose
// acknowledgment was lost reads INSTEAD of sending the write again.
func (h *HostedGitHubIssuesHandler) Request(w http.ResponseWriter, r *http.Request) {
	repository, ok := h.repository(w, r)
	if !ok {
		return
	}
	result, err := h.Service.GitHubIssueRequestStatus(r.Context(), repository, chi.URLParam(r, "id"))
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	pkgerrors.WriteJSON(w, http.StatusOK, result)
}
