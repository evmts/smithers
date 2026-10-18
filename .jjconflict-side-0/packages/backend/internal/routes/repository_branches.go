package routes

import (
	"context"
	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"net/http"
)

// ListRepositoryBranches enriches the existing bookmark list for public repository reads.
func (h *RepoHandler) ListRepositoryBranches(w http.ResponseWriter, r *http.Request) {
	service, ok := h.Service.(interface {
		ListRepositoryBranches(context.Context, *db.User, string, string, string, int) (services.RepositoryBranchPage, error)
	})
	if !ok {
		writeRouteError(w, r, errors.Internal("repository branches unavailable"))
		return
	}
	cursor, limit, err := parseOffsetPagination(r)
	if err != nil {
		writeRouteError(w, r, err)
		return
	}
	page, err := service.ListRepositoryBranches(r.Context(), middleware.UserFromContext(r.Context()), chi.URLParam(r, "owner"), chi.URLParam(r, "repo"), cursor, limit)
	if err != nil {
		writeRouteError(w, r, err)
		return
	}
	errors.WriteJSON(w, http.StatusOK, page)
}
