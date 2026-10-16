package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// InstallIssueRouteService reads the install repository's GitHub issues
// through the install's App.
type InstallIssueRouteService interface {
	InstallIssues(ctx context.Context, repositoryID int64, state string, page int) ([]services.InstallIssue, error)
	InstallIssue(ctx context.Context, repositoryID, number int64) (services.InstallIssueThread, error)
}

// InstallIssuesHandler serves the issue list card and the issue card on an
// install: GET /api/issues and GET /api/issues/{n}. Members read them by role
// (issue.read); the repository is the install's, never the caller's.
type InstallIssuesHandler struct {
	Queries *db.Queries
	Service InstallIssueRouteService
}

func (h *InstallIssuesHandler) authorize(w http.ResponseWriter, r *http.Request) (int64, bool) {
	if h == nil || h.Service == nil {
		todoRouteError(w, nil)
		return 0, false
	}
	repo, _, ok := authorizeInstallRepository(w, r, h.Queries, "issue.read")
	return repo, ok
}

// List answers one page of the repository's issues: ?state=open (default),
// closed or all, and ?page (1 by default), newest first.
func (h *InstallIssuesHandler) List(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.authorize(w, r)
	if !ok {
		return
	}
	state := r.URL.Query().Get("state")
	if state == "" {
		state = "open"
	}
	page := 1
	if raw := r.URL.Query().Get("page"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			todoRouteError(w, &services.TodoControlError{Status: http.StatusBadRequest, Code: "invalid_issue_query", Class: "user", Message: "page is a number"})
			return
		}
		page = parsed
	}
	issues, err := h.Service.InstallIssues(r.Context(), repo, state, page)
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(issues)
}

// Get answers issue n and its comments.
func (h *InstallIssuesHandler) Get(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.authorize(w, r)
	if !ok {
		return
	}
	n, err := strconv.ParseInt(chi.URLParam(r, "n"), 10, 64)
	if err != nil || n <= 0 {
		todoRouteError(w, &services.TodoControlError{Status: http.StatusBadRequest, Code: "invalid_issue_query", Class: "user", Message: "Invalid issue number"})
		return
	}
	thread, err := h.Service.InstallIssue(r.Context(), repo, n)
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(thread)
}

// Comment queues the canonical catalog command against the install repository.
func (h *InstallIssuesHandler) Comment(w http.ResponseWriter, r *http.Request) {
	repository, _, ok := authorizeInstallRepository(w, r, h.Queries, "issue.comment")
	if !ok {
		return
	}
	writer, ok := h.Service.(interface {
		RequestInstallIssueComment(context.Context, int64, int64, string, string) (jobs.RequestReceipt, error)
	})
	if !ok {
		todoRouteError(w, nil)
		return
	}
	number, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil || number <= 0 {
		todoRouteError(w, &services.TodoControlError{Status: 400, Code: "invalid_issue_comment", Class: "user", Message: "Invalid issue number"})
		return
	}
	var input struct {
		Body string `json:"body"`
	}
	if !decodeStrictJSONBody(w, r, &input) {
		return
	}
	receipt, err := writer.RequestInstallIssueComment(r.Context(), repository, number, input.Body, r.Header.Get("Idempotency-Key"))
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	errors.WriteJSON(w, http.StatusAccepted, receipt)
}

// Create requests the issue.new write without waiting for GitHub.
func (h *InstallIssuesHandler) Create(w http.ResponseWriter, r *http.Request) {
	repository, _, ok := authorizeInstallRepository(w, r, h.Queries, "issue.new")
	if !ok {
		return
	}
	writer, ok := h.Service.(interface {
		RequestInstallIssueCreate(context.Context, int64, services.InstallIssueCreateInput, string) (jobs.RequestReceipt, error)
	})
	if !ok {
		todoRouteError(w, nil)
		return
	}
	var input services.InstallIssueCreateInput
	if !decodeStrictJSONBody(w, r, &input) {
		return
	}
	receipt, err := writer.RequestInstallIssueCreate(r.Context(), repository, input, r.Header.Get("Idempotency-Key"))
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	errors.WriteJSON(w, http.StatusAccepted, receipt)
}

func (h *InstallIssuesHandler) CreateStatus(w http.ResponseWriter, r *http.Request) {
	repository, _, ok := authorizeInstallRepository(w, r, h.Queries, "issue.read")
	if !ok {
		return
	}
	reader, ok := h.Service.(interface {
		InstallIssueCreateStatus(context.Context, int64, string) (map[string]any, error)
	})
	if !ok {
		todoRouteError(w, nil)
		return
	}
	result, err := reader.InstallIssueCreateStatus(r.Context(), repository, chi.URLParam(r, "id"))
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	errors.WriteJSON(w, http.StatusOK, result)
}

// state queues a close or a reopen of the install repository's GitHub issue.
// Both carry no body: the door itself names the act, so a classified
// `issues.close` request can never turn into a reopen (or a comment) between
// authorization and the write.
func (h *InstallIssuesHandler) state(w http.ResponseWriter, r *http.Request, command string,
	admit func(services.InstallIssueStateWriter, context.Context, int64, int64, string) (jobs.RequestReceipt, error)) {
	repository, _, ok := authorizeInstallRepository(w, r, h.Queries, command)
	if !ok {
		return
	}
	writer, ok := h.Service.(services.InstallIssueStateWriter)
	if !ok {
		todoRouteError(w, nil)
		return
	}
	number, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil || number <= 0 {
		todoRouteError(w, &services.TodoControlError{Status: 400, Code: "invalid_issue_state", Class: "user", Message: "Invalid issue number"})
		return
	}
	receipt, err := admit(writer, r.Context(), repository, number, r.Header.Get("Idempotency-Key"))
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	errors.WriteJSON(w, http.StatusAccepted, receipt)
}

// Close requests POST /api/issues/{number}/close.
func (h *InstallIssuesHandler) Close(w http.ResponseWriter, r *http.Request) {
	h.state(w, r, "issues.close", services.InstallIssueStateWriter.RequestInstallIssueClose)
}

// Reopen requests POST /api/issues/{number}/reopen.
func (h *InstallIssuesHandler) Reopen(w http.ResponseWriter, r *http.Request) {
	h.state(w, r, "issues.reopen", services.InstallIssueStateWriter.RequestInstallIssueReopen)
}

// Transition requests POST /api/issues/{number}/transitions/{id}: ONE
// transition the install repository's OWN committed declaration names.
//
// The transition id is a path segment and the issue number another, so the
// request carries no body at all: it can name neither a label, nor a
// repository, nor an actor. Which labels the move carries, and whether a
// person has to make it, come from the repository's declaration at its
// default bookmark — read by the service before this returns and re-read on
// the worker before the write.
//
// An undeclared transition, a declaration this server could not read, and an
// agent asking for a person-only move are all refused by the service, so no
// durable operation exists for them and nothing is asked of GitHub.
func (h *InstallIssuesHandler) Transition(w http.ResponseWriter, r *http.Request) {
	repository, _, ok := authorizeInstallRepository(w, r, h.Queries, "issues.transition")
	if !ok {
		return
	}
	writer, ok := h.Service.(services.InstallIssueTransitionWriter)
	if !ok {
		todoRouteError(w, nil)
		return
	}
	number, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil || number <= 0 {
		todoRouteError(w, &services.TodoControlError{Status: 400, Code: "invalid_issue_state", Class: "user", Message: "Invalid issue number"})
		return
	}
	receipt, err := writer.RequestInstallIssueTransition(r.Context(), repository, number,
		chi.URLParam(r, "id"), r.Header.Get("Idempotency-Key"))
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	errors.WriteJSON(w, http.StatusAccepted, receipt)
}

// EditComment requests PATCH /api/issues/comments/{id}: a new body for one
// comment the install's App wrote. The comment id is the subject, as the
// hosted comment door uses it, so no issue number can disagree with it.
func (h *InstallIssuesHandler) EditComment(w http.ResponseWriter, r *http.Request) {
	repository, _, ok := authorizeInstallRepository(w, r, h.Queries, "issue.comment")
	if !ok {
		return
	}
	writer, ok := h.Service.(interface {
		RequestInstallIssueCommentEdit(context.Context, int64, int64, string, string) (jobs.RequestReceipt, error)
	})
	if !ok {
		todoRouteError(w, nil)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		todoRouteError(w, &services.TodoControlError{Status: 400, Code: "invalid_issue_comment", Class: "user", Message: "Invalid comment"})
		return
	}
	var input struct {
		Body string `json:"body"`
	}
	if !decodeStrictJSONBody(w, r, &input) {
		return
	}
	receipt, err := writer.RequestInstallIssueCommentEdit(r.Context(), repository, id, input.Body, r.Header.Get("Idempotency-Key"))
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	errors.WriteJSON(w, http.StatusAccepted, receipt)
}
