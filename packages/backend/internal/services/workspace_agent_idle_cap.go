package services

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// agentBoxIdleRetireBatch bounds one sweep's retirements.
const agentBoxIdleRetireBatch = 50

// agentBoxIdleCapStore is the store surface the idle cap reads and writes.
type agentBoxIdleCapStore interface {
	ListIdleAgentBoxes(ctx context.Context, idleSeconds int64, limit int32) ([]string, error)
	RetireAgentBox(ctx context.Context, workspaceID string) (bool, error)
}

// WithAgentBoxIdleCap sets how long a quiesced agent box may sit with no turn
// before it is retired. Zero disables the cap.
func WithAgentBoxIdleCap(idleCap time.Duration) WorkspaceServiceOption {
	return func(s *WorkspaceService) {
		if idleCap >= 0 {
			s.agentBoxIdleCap = idleCap
		}
	}
}

// RetireIdleAgentBoxes retires the agent boxes that have had no turn for the
// idle cap. A quiesced box keeps running between turns and bills its payer for
// every awake second, and a deployment without machine admission cannot wake
// a slept box (plue#862), so an idle box is retired instead: its guest and
// disk are deleted, its usage interval closes, and the next turn on the branch
// builds a new box from the branch head the old one recorded. A box is
// retired only when that head is verifiably published, so no recorded work is
// lost. An install releases idle branches through its own machine lifecycle.
func (s *WorkspaceService) RetireIdleAgentBoxes(ctx context.Context) error {
	if s == nil || s.agentBoxIdleCap <= 0 || s.machineAdmission != nil || !s.hasWorkspaceRuntime() || s.requireBranchMachineProviders() != nil {
		return nil
	}
	store, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return nil
	}
	idleSeconds := int64(s.agentBoxIdleCap / time.Second)
	ids, err := store.ListIdleAgentBoxes(ctx, idleSeconds, agentBoxIdleRetireBatch)
	if err != nil {
		return err
	}
	var failures []error
	for _, id := range ids {
		if err := ctx.Err(); err != nil {
			return errors.Join(append(failures, err)...)
		}
		if err := s.retireIdleAgentBox(ctx, store, id, idleSeconds); err != nil {
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}

func (s *WorkspaceService) retireIdleAgentBox(ctx context.Context, store agentBoxIdleCapStore, id string, idleSeconds int64) error {
	logger := slog.With("workspace_id", id, "idle_cap_seconds", idleSeconds)
	unlock := s.lockRuntimeWorkspace(id)
	defer unlock()
	row, err := s.q.GetWorkspace(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if row.DeletedAt.Valid || row.Status != "running" || row.DiskReclaimedAt.Valid {
		return nil
	}
	// A turn that started since the list owns the box now.
	if use, ok := s.q.(agentWorkspaceReleaseStore); ok {
		current, err := use.AgentWorkspaceUse(ctx, id, "")
		if err != nil {
			return err
		}
		if current.InUse() {
			logger.Info("agent box kept past its idle cap", "outcome", "kept_in_use", "kept_for", agentWorkspaceUseDetail(current))
			return nil
		}
	}
	// The next box restores the recorded head. Retire only when that head is
	// the published branch head, so nothing the turn recorded is lost.
	if err := s.verifyReclaimedWorkspaceSource(ctx, row); err != nil {
		logger.Warn("agent box kept past its idle cap", "outcome", "kept_head_unverified", "head_commit_id", row.HeadCommitID, "error", err)
		return nil
	}
	revoked := s.revokeAgentWorkspaceHeadToken(ctx, row)
	operationCtx, err := s.workspaceRuntimeContext(ctx, row, row.UserID, workspaceLifecycleOperation(row, "retire-idle"))
	if err != nil {
		return err
	}
	kept := s.stopAgentWorkspaceHosts(operationCtx, row)
	if err := s.deleteRuntimeWorkspaceLocked(ctx, row, row.UserID); err != nil {
		logger.Warn("agent box retirement failed; the next sweep retries it", "outcome", "release_failed", "head_token_revoked", revoked, "error", err)
		return err
	}
	retired, err := store.RetireAgentBox(context.WithoutCancel(ctx), id)
	if err != nil {
		return err
	}
	if !retired {
		return nil
	}
	s.meterWorkspaceUsage(ctx, row, "suspended")
	s.notifyWorkspace(ctx, id, "suspended")
	attrs := []any{"outcome", "retired", "vm_id", row.VmID, "head_commit_id", row.HeadCommitID, "head_token_revoked", revoked}
	if kept = strings.TrimSpace(kept); kept != "" {
		attrs = append(attrs, "kept_for", kept)
	}
	logger.Info("agent box retired after its idle cap", attrs...)
	return nil
}

// retiredAgentBox reports a box the idle cap retired: asleep with no guest,
// waiting to be rebuilt from its recorded head. Its next start creates a new
// guest rather than waking one, so it needs no machine admission.
func retiredAgentBox(row db.Workspace) bool {
	return row.Status == "suspended" && strings.TrimSpace(row.VmID) == "" && row.DiskReclaimedAt.Valid
}
