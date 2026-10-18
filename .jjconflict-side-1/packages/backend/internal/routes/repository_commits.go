package routes

import (
	"context"
	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"net/http"
	"strconv"
)

type repositoryCommitService interface {
	ListRepositoryCommits(context.Context, *db.User, string, string, string, string, string, int) (repohost.RepositoryCommitPage, error)
	GetRepositoryCommit(context.Context, *db.User, string, string, string) (repohost.RepositoryCommitDetail, error)
}

// ListRepositoryCommits serves bounded history pages under the contents access rule.
func (h *RepoHandler) ListRepositoryCommits(w http.ResponseWriter, r *http.Request) {
	service, ok := h.Service.(repositoryCommitService)
	if !ok {
		writeRouteError(w, r, errors.Internal("repository history unavailable"))
		return
	}
	limit := 30
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			writeRouteError(w, r, errors.BadRequest("invalid history limit"))
			return
		}
		limit = parsed
	}
	page, err := service.ListRepositoryCommits(r.Context(), middleware.UserFromContext(r.Context()), chi.URLParam(r, "owner"), chi.URLParam(r, "repo"), r.URL.Query().Get("ref"), r.URL.Query().Get("path"), r.URL.Query().Get("cursor"), limit)
	if err != nil {
		writeRouteError(w, r, err)
		return
	}
	errors.WriteJSON(w, http.StatusOK, page)
}

// GetRepositoryCommit serves one immutable commit and its file summary.
func (h *RepoHandler) GetRepositoryCommit(w http.ResponseWriter, r *http.Request) {
	service, ok := h.Service.(repositoryCommitService)
	if !ok {
		writeRouteError(w, r, errors.Internal("repository history unavailable"))
		return
	}
	detail, err := service.GetRepositoryCommit(r.Context(), middleware.UserFromContext(r.Context()), chi.URLParam(r, "owner"), chi.URLParam(r, "repo"), chi.URLParam(r, "sha"))
	if err != nil {
		writeRouteError(w, r, err)
		return
	}
	errors.WriteJSON(w, http.StatusOK, detail)
}
