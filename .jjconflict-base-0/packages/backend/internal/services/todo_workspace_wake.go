package services

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// mythicalWakeFence answers which declared fence refuses this wake, or "" when
// none does. These are EXACTLY the five clauses the one compound condition
// tested, in the order they were written, with the same outcome: nothing is
// added, nothing is dropped, only the attribution is new. The TODO execution
// resolver's clauses differ (it also requires a counted attempt and the lane's
// own machine), so it keeps its own helpers rather than sharing these.
func mythicalWakeFence(item db.MythicalItem, lane db.MythicalLane, repositoryID int64, workspaceID string) mythicalFence {
	switch {
	case item.RepositoryID != repositoryID:
		return fenceRepository
	case !todoExecutionWorkspace(item, workspaceID):
		return fenceExecutionMachine
	case lane.ItemID != item.ID:
		return fenceLaneItem
	case lane.RepositoryID != repositoryID:
		return fenceLaneMachine
	case lane.RetiredAt.Valid:
		return fenceLaneRetired
	}
	return ""
}

// WakeTodoWorkspace runs only behind the resolver's host start. Re-read the
// item and lane inside the same lifecycle lock used by suspend and retirement;
// a stale delivery must not revive settled or paused work.
func (s *WorkspaceService) WakeTodoWorkspace(ctx context.Context, itemID, workspaceID string, repositoryID, userID int64) error {
	id, err := uuid.Parse(itemID)
	if err != nil {
		return mythicalFlowFailure{code: "runtime_target_invalid"}
	}
	store, ok := s.q.(interface {
		GetMythicalItem(context.Context, pgtype.UUID) (db.MythicalItem, error)
		GetMythicalLane(context.Context, string) (db.MythicalLane, error)
	})
	if !ok || !s.hasWorkspaceRuntime() {
		return mythicalFlowFailure{code: "runtime_binding_unavailable", retryable: true}
	}
	row, err := s.loadOwnedWorkspace(ctx, workspaceID, repositoryID, userID)
	if err != nil {
		return err
	}
	return s.withWorkspaceMutationAuthority(ctx, row, userID, func(ctx context.Context) error {
		unlock := s.lockRuntimeWorkspace(workspaceID)
		defer unlock()
		current, err := s.currentRuntimeWorkspaceLocked(ctx, row)
		if err != nil {
			return err
		}
		if current.DeletedAt.Valid {
			return mythicalFlowFailure{code: "runtime_target_forbidden", fence: fenceMachineDeleted}
		}
		item, err := store.GetMythicalItem(ctx, pgtype.UUID{Bytes: id, Valid: true})
		if err != nil {
			return mythicalFlowFailure{code: "runtime_binding_unavailable", retryable: true}
		}
		lane, err := store.GetMythicalLane(ctx, workspaceID)
		if err != nil {
			return mythicalFlowFailure{code: "runtime_binding_unavailable", retryable: true}
		}
		if fence := mythicalWakeFence(item, lane, repositoryID, workspaceID); fence != "" {
			return mythicalFlowFailure{code: "runtime_target_forbidden", fence: fence}
		}
		if item.PausedAt.Valid {
			return mythicalFlowFailure{code: "runtime_todo_paused", retryable: true}
		}
		switch item.State {
		case "landed", "cancelled", "rejected", "declined", "skipped", "dropped":
			return mythicalFlowFailure{code: "runtime_run_terminal"}
		}
		_, nativeAdmission := s.runtime.(interface {
			EnsureMachined(context.Context, string) error
		})
		recoveringBoot := current.Status == "starting" && current.VmID != "" && nativeAdmission
		if current.Status != "running" && current.Status != "suspended" && current.Status != "stopped" && !recoveringBoot {
			return mythicalLaneNotRunning(current, nil)
		}
		_, err = s.ensureRuntimeWorkspaceRunningLocked(ctx, current, userID)
		return err
	})
}
