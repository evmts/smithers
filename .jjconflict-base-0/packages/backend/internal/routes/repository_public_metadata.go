package routes

import (
	"context"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// GetPublicRepositoryMetadata serves imported public issue and pull records
// through the repository's ordinary read permission, without user credentials.
func (h *RepoHandler) GetPublicRepositoryMetadata(w http.ResponseWriter, r *http.Request) {
	reader, ok := h.Service.(interface {
		ReadPublicRepositoryMetadata(context.Context, *db.User, string, string, string, url.Values) (services.GitHubRepoMetadataResult, error)
	})
	if !ok {
		writeRouteError(w, r, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "GitHub metadata unavailable"))
		return
	}
	owner, repo, err := repoOwnerAndName(r)
	if err != nil {
		writeRouteError(w, r, err)
		return
	}
	result, err := reader.ReadPublicRepositoryMetadata(r.Context(), middleware.UserFromContext(r.Context()), owner, repo, chi.URLParam(r, "*"), r.URL.Query())
	if err != nil {
		writeRouteError(w, r, err)
		return
	}
	// Permission is checked on every request, including after visibility changes.
	w.Header().Set("Cache-Control", "no-store")
	if result.Link != "" {
		w.Header().Set("Link", result.Link)
	}
	(&GitHubUserReposHandler{}).writeGitHubRepoMetadataResult(w, result)
}
