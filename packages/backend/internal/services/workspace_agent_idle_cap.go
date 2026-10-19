package services

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// agentBoxIdleRetireBatch bounds one sweep's retirements.
const agentBoxIdleRetireBatch = 50

// agentBoxIdleCapStore is the store surface the idle cap reads and writes.
type agentBoxIdleCapStore interface {
	ListIdleAgentBoxes(ctx context.Context, idleSeconds int64, limit int32) ([]string, error)
	RetireAgentBox(ctx context.Context, workspaceID string) (bool, error)
	MarkAgentBoxUnreaped(ctx context.Context, workspaceID string, unreaped bool) error
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
	_, err = s.retireAgentBoxLocked(ctx, store, row, "idle_cap", 1)
	return err
}

// agentBoxHeadVerifyAttempts and agentBoxHeadVerifyWait bound how long a
// retirement at turn end waits for the head reporter's last publish.
var (
	agentBoxHeadVerifyAttempts = 4
	agentBoxHeadVerifyWait     = 500 * time.Millisecond
)

// retireAgentBoxLocked retires a running agent box under its runtime lock:
// the next box restores the recorded head, so it retires only when that head
// is the published branch head and nothing the turn recorded is lost. It
// revokes the head token, stops the coding hosts, deletes the guest and its
// disk, records the box asleep for reconstruction and closes its usage. It
// reports false, with the reason logged, when the head is unverified.
func (s *WorkspaceService) retireAgentBoxLocked(ctx context.Context, store agentBoxIdleCapStore, row db.Workspace, reason string, attempts int) (bool, error) {
	logger := slog.With("workspace_id", row.ID, "reason", reason)
	var verifyErr error
	for attempt := 0; attempt < max(attempts, 1); attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return false, ctx.Err()
			case <-time.After(agentBoxHeadVerifyWait):
			}
			if current, err := s.q.GetWorkspace(ctx, row.ID); err == nil {
				row = current
			}
		}
		if verifyErr = s.verifyReclaimedWorkspaceSource(ctx, row); verifyErr == nil {
			break
		}
	}
	if verifyErr != nil {
		logger.Warn("agent box kept: its recorded head is not published", "outcome", "kept_head_unverified", "head_commit_id", row.HeadCommitID, "error", verifyErr)
		return false, nil
	}
	revoked := s.revokeAgentWorkspaceHeadToken(ctx, row)
	operationCtx, err := s.workspaceRuntimeContext(ctx, row, row.UserID, workspaceLifecycleOperation(row, "retire-"+reason))
	if err != nil {
		return false, err
	}
	kept := s.stopAgentWorkspaceHosts(operationCtx, row)
	if err := s.deleteRuntimeWorkspaceLocked(ctx, row, row.UserID); err != nil {
		logger.Warn("agent box retirement failed; the next pass retries it", "outcome", "release_failed", "head_token_revoked", revoked, "error", err)
		return false, err
	}
	retired, err := store.RetireAgentBox(context.WithoutCancel(ctx), row.ID)
	if err != nil || !retired {
		return false, err
	}
	s.meterWorkspaceUsage(ctx, row, "suspended")
	s.notifyWorkspace(ctx, row.ID, "suspended")
	attrs := []any{"outcome", "retired", "vm_id", row.VmID, "head_commit_id", row.HeadCommitID, "head_token_revoked", revoked}
	if kept = strings.TrimSpace(kept); kept != "" {
		attrs = append(attrs, "kept_for", kept)
	}
	if reason == "idle_cap" {
		logger.Info("agent box retired after its idle cap", attrs...)
	} else {
		logger.Info("agent box retired: its run's processes could not be confirmed ended", attrs...)
	}
	return true, nil
}

// cleanUnreapedAgentBoxLocked clears a box whose last run's processes were not
// confirmed ended before its next turn mints anything: a confirmed reap keeps
// the box, else the box is retired and the turn rebuilds it from the recorded
// head. A box neither reaped nor retired refuses the turn, retryably.
func (s *WorkspaceService) cleanUnreapedAgentBoxLocked(ctx context.Context, row db.Workspace) (db.Workspace, error) {
	store, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return row, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "the box is still being cleaned after its last turn; try again in a moment")
	}
	if reaper, ok := s.runtime.(workspaceapi.WorkspaceRunProcessReaper); ok {
		operationCtx, err := s.workspaceRuntimeContext(ctx, row, row.UserID, workspaceLifecycleOperation(row, "reap"))
		if err == nil {
			if err = reaper.ReapRunProcesses(operationCtx, row.ID); err == nil {
				if err := store.MarkAgentBoxUnreaped(ctx, row.ID, false); err != nil {
					return row, err
				}
				return s.q.GetWorkspace(ctx, row.ID)
			}
		}
		slog.Warn("agent box reap before a turn failed", "workspace_id", row.ID, "error", err)
	}
	retired, err := s.retireAgentBoxLocked(ctx, store, row, "unreaped", 1)
	if err != nil {
		return row, err
	}
	if !retired {
		return row, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "the box is still being cleaned after its last turn; try again in a moment")
	}
	return s.q.GetWorkspace(ctx, row.ID)
}

// retiredAgentBox reports a box the idle cap retired: asleep with no guest,
// waiting to be rebuilt from its recorded head. Its next start creates a new
// guest rather than waking one, so it needs no machine admission.
func retiredAgentBox(row db.Workspace) bool {
	return row.Status == "suspended" && strings.TrimSpace(row.VmID) == "" && row.DiskReclaimedAt.Valid
}
