package routes

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

/*
 * The two doors of one real GitHub repository create, for the signed-in
 * person's OWN GitHub account (services/github_user_repo_create.go):
 *
 *   POST /api/user/github-repos            — admit the create, answer 202
 *   GET  /api/user/github-repo-requests/id — read what became of it
 *
 * The request names a repository NAME and nothing else: no owner, no token, no
 * URL and no idempotency key. The owner is whatever the server's own
 * credential resolution says the account is, and the key is derived from that
 * actor plus the intent, so a client can neither write under another login nor
 * fork one intent into two repositories.
 *
 * The Smithers Cloud create (POST /api/user/repos) is untouched: it still
 * creates a Smithers Cloud repository with the same request and the same
 * answer it always did.
 */

// GitHubRepoCreateInput is the create door's whole request body.
type GitHubRepoCreateInput struct {
	Name string `json:"name"`
	// Private defaults to true when the field is absent: a personal repository
	// nobody asked to publish stays unpublished.
	Private *bool `json:"private,omitempty"`
}

// CreateGitHubUserRepo admits one create on the caller's GitHub account.
func (h *GitHubUserReposHandler) CreateGitHubUserRepo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	user, err := requireRouteUser(r)
	if err != nil {
		pkgerrors.WriteError(w, err.(*pkgerrors.APIError))
		return
	}
	writer, ok := h.Service.(interface {
		RequestGitHubUserRepoCreate(context.Context, int64, string, bool) (jobs.RequestReceipt, error)
	})
	if !ok {
		pkgerrors.WriteError(w, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "github repository creation is unavailable"))
		return
	}
	var input GitHubRepoCreateInput
	if !decodeStrictJSONBody(w, r, &input) {
		return
	}
	private := input.Private == nil || *input.Private
	receipt, svcErr := writer.RequestGitHubUserRepoCreate(r.Context(), user.ID, input.Name, private)
	if svcErr != nil {
		writeRouteError(w, r, svcErr)
		return
	}
	pkgerrors.WriteJSON(w, http.StatusAccepted, receipt)
}

// GetGitHubUserRepoCreate answers one of the caller's own create requests, so
// a lost acknowledgment is read instead of posted again.
func (h *GitHubUserReposHandler) GetGitHubUserRepoCreate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	user, err := requireRouteUser(r)
	if err != nil {
		pkgerrors.WriteError(w, err.(*pkgerrors.APIError))
		return
	}
	reader, ok := h.Service.(interface {
		GitHubUserRepoCreateStatus(context.Context, int64, string) (services.GitHubRepoCreateStatus, error)
	})
	if !ok {
		pkgerrors.WriteError(w, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "github repository creation is unavailable"))
		return
	}
	status, svcErr := reader.GitHubUserRepoCreateStatus(r.Context(), user.ID, chi.URLParam(r, "id"))
	if svcErr != nil {
		writeRouteError(w, r, svcErr)
		return
	}
	pkgerrors.WriteJSON(w, http.StatusOK, status)
}
