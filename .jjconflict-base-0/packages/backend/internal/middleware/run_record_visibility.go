package middleware

import (
	"context"
	stdErrors "errors"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"net/http"
	"regexp"
	"strconv"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

type RunRecordVisibilityReader interface {
	RepoPermissionQuerier
	WorkflowRunRepository(context.Context, int64) (db.Repository, error)
	MayViewWorkflowRun(context.Context, int64, int64) (bool, error)
}

// Only public run-record namespaces participate. Admin and worker/internal
// endpoints retain their own authority. UUID install flow jobs retain theirs.
var runRecordPath = regexp.MustCompile(`^/api/(?:repos/[^/]+/[^/]+/(?:actions/|workflows/|workflow/)?runs/|runs/|flows/runs/)([^/]+)(?:/|$)`)

// RunRecordVisibility runs after identity loading and before auth/scope gates,
// so those gates cannot distinguish another person's turn from a missing run.
// Lists additionally apply this same database predicate before SQL pagination.
func RunRecordVisibility(store RunRecordVisibilityReader) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			match := runRecordPath.FindStringSubmatch(r.URL.Path)
			if store == nil || len(match) == 0 {
				next.ServeHTTP(w, r)
				return
			}
			id, err := strconv.ParseInt(match[1], 10, 64)
			if err != nil || id <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			viewer := RunRecordViewerID(r.Context())
			visible, err := store.MayViewWorkflowRun(r.Context(), id, viewer)
			if err != nil {
				pkgerrors.WriteError(w, pkgerrors.Internal("failed to fetch workflow run").WithCause(err))
				return
			}
			if !visible {
				pkgerrors.WriteError(w, pkgerrors.NotFound("workflow run not found"))
				return
			}
			repository, err := store.WorkflowRunRepository(r.Context(), id)
			if err != nil {
				if stdErrors.Is(err, pgx.ErrNoRows) {
					pkgerrors.WriteError(w, pkgerrors.NotFound("workflow run not found"))
				} else {
					pkgerrors.WriteError(w, pkgerrors.Internal("failed to fetch workflow run").WithCause(err))
				}
				return
			}
			permission, permissionErr := ResolveRepoPermission(r.Context(), store, repository, UserFromContext(r.Context()))
			if permissionErr != nil {
				pkgerrors.WriteError(w, permissionErr)
				return
			}
			if !permission.Satisfies(PermissionRead) {
				pkgerrors.WriteError(w, pkgerrors.NotFound("workflow run not found"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RunRecordViewerID is a person, not the owner impersonated by a guest/run
// credential. Zero cannot own a session; ordinary repository reads still use
// the credential's existing principal and permissions.
func RunRecordViewerID(ctx context.Context) int64 {
	if AuthInfoFromContext(ctx).IsAgent() {
		return 0
	}
	if user := UserFromContext(ctx); user != nil && !IsAgentAccount(user.UserType) {
		return user.ID
	}
	return 0
}
