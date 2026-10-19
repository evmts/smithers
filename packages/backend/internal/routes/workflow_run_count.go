package routes

import (
	"context"
	"net/http"

	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// ActiveWorkflowRunCounter reports the caller's visible runs, independently of
// the shared-repository capacity quota's conservative internal accounting.
type ActiveWorkflowRunCounter interface {
	CountVisibleActiveWorkflowRunsForUser(ctx context.Context, userID, viewerID int64) (int, error)
}

type WorkflowRunCountHandler struct {
	Counter ActiveWorkflowRunCounter
}

// GetActiveWorkflowRunCount handles GET /api/user/workflow-runs/active-count.
// Identity comes from the authenticated request; private turns never count.
func (h *WorkflowRunCountHandler) GetActiveWorkflowRunCount(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		pkgerrors.WriteError(w, pkgerrors.Unauthorized("authentication required"))
		return
	}
	if h.Counter == nil {
		pkgerrors.WriteError(w, pkgerrors.Internal("workflow run counter unavailable"))
		return
	}

	count, err := h.Counter.CountVisibleActiveWorkflowRunsForUser(r.Context(), user.ID, middleware.RunRecordViewerID(r.Context()))
	if err != nil {
		writeInternalError(w, r, "failed to count active workflow runs", err)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	pkgerrors.WriteJSON(w, http.StatusOK, map[string]int{"active_count": count})
}
