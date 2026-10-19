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
)

// agentBoxIdleRetireBatch bounds one sweep's retirements.
const agentBoxIdleRetireBatch = 50

// agentBoxIdleCapStore is the store surface the idle cap reads and writes.
type agentBoxIdleCapStore interface {
	ListIdleAgentBoxes(ctx context.Context, idleSeconds int64, limit int32) ([]string, error)
	RetireAgentBox(ctx context.Context, workspaceID, lease string) (bool, error)
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
	fence, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return nil
	}
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
	// A turn or a person that came since the list owns the box now. The lease
	// is taken in the transaction that reads the box unused and idle.
	s.agentBoxReleasePoint(agentBoxBeforeClaim, id)
	claim, err := fence.ClaimAgentBoxRelease(ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: id, CheckUse: true, IdleSeconds: idleSeconds,
		AfterEmptyUse: func() { s.agentBoxReleasePoint(agentBoxAfterEmptyUse, id) }})
	if err != nil {
		return err
	}
	if claim.Lease == "" {
		kept := agentWorkspaceUseDetail(claim.Use)
		switch {
		case claim.Busy:
			kept = "another release holds the box"
		case claim.Recent:
			kept = "recent activity"
		case kept == "":
			kept = "box is " + claim.Status
		}
		logger.Info("agent box kept past its idle cap", "outcome", "kept_in_use", "kept_for", kept)
		return nil
	}
	lease := claim.Lease
	defer func() {
		if err := fence.EndAgentBoxLease(context.WithoutCancel(ctx), id, lease, claim.Stage); err != nil {
			logger.Warn("end agent box lease failed; it lapses on its own", "error", err)
		}
	}()
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID = claim.HeadPushTokenID, claim.Lease, claim.VmID
	guard := agentBoxGuard{fence: fence, workspaceID: id, guest: claim.VmID, lease: &lease}
	if _, err = s.retireAgentBoxLeased(ctx, guard, store, row, "idle_cap", 1); errors.Is(err, errAgentBoxLost) {
		logger.Warn("agent box kept past its idle cap", "outcome", "kept_in_use", "kept_for", err.Error())
		return nil
	}
	return err
}

// agentBoxHeadVerifyAttempts and agentBoxHeadVerifyWait bound how long a
// retirement at turn end waits for the head reporter's last publish.
var (
	agentBoxHeadVerifyAttempts = 4
	agentBoxHeadVerifyWait     = 500 * time.Millisecond
)

// retireAgentBoxLeased retires a running agent box while the caller holds its
// lease (*guard.lease, renewed in place): the next box restores the recorded
// head, so it retires only when that head is the published branch head and
// nothing the turn recorded is lost. It revokes the head token, stops the
// coding hosts, renews the lease to prove no turn joined since, deletes the
// guest it was decided for and its disk, records the box asleep for
// reconstruction and closes its usage. It reports false, with the reason
// logged, when the head is unverified, and errAgentBoxLost when another
// replica took the box over.
func (s *WorkspaceService) retireAgentBoxLeased(ctx context.Context, guard agentBoxGuard, store agentBoxIdleCapStore, row db.Workspace, reason string, attempts int) (bool, error) {
	lease := guard.lease
	logger := slog.With("workspace_id", row.ID, "reason", reason)
	var verifyErr error
	for attempt := 0; attempt < max(attempts, 1); attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return false, ctx.Err()
			case <-time.After(agentBoxHeadVerifyWait):
			}
			if current, err := s.q.GetWorkspace(ctx, row.ID); err == nil && current.ProvisioningStage == *lease {
				row.HeadCommitID, row.HeadChangeID = current.HeadCommitID, current.HeadChangeID
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
	kept, err := s.stopAgentWorkspaceHosts(operationCtx, row, guard)
	if err != nil {
		return false, err
	}
	// The guest is deleted only while the lease still holds a running box that
	// names no head token and still has this guest: no turn joined since, so
	// no turn loses its disk.
	renewed, err := guard.fence.RenewAgentBoxLease(context.WithoutCancel(ctx), row.ID, *lease, true)
	if err != nil {
		return false, err
	}
	if renewed == "" {
		logger.Warn("agent box kept: its release no longer holds it", "outcome", "kept_lease_lost", "head_token_revoked", revoked)
		return false, errAgentBoxLost
	}
	*lease = renewed
	s.agentBoxReleasePoint(agentBoxBeforeDelete, row.ID)
	ran, err := guard.run(ctx, func(ctx context.Context) error { return s.deleteRuntimeWorkspaceLocked(ctx, row, row.UserID) })
	if err != nil {
		logger.Warn("agent box retirement failed; the next pass retries it", "outcome", "release_failed", "head_token_revoked", revoked, "error", err)
		return false, err
	}
	if !ran {
		logger.Warn("agent box kept: its release no longer holds it", "outcome", "kept_lease_lost", "head_token_revoked", revoked)
		return false, errAgentBoxLost
	}
	retired, err := store.RetireAgentBox(context.WithoutCancel(ctx), row.ID, *lease)
	if err != nil {
		return false, err
	}
	if !retired {
		logger.Error("agent box guest deleted but its retirement was not recorded", "outcome", "release_failed")
		return false, nil
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

// errAgentBoxCleaning refuses a turn on a box still being cleaned after its
// last turn, retryably.
func errAgentBoxCleaning() error {
	return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "the box is still being cleaned after its last turn; try again in a moment")
}

// cleanUnreapedAgentBoxLocked clears a box whose state is unknown (its last
// run's processes were not confirmed ended, or a release died holding it)
// before its next turn mints anything, holding the box's lease. A reap never
// makes such a box clean (Security d-am9s3m): it is retired and the turn
// rebuilds it from the recorded head. A box that cannot be retired refuses the
// turn, retryably. busy is true when another replica holds the box; the
// caller waits for it.
func (s *WorkspaceService) cleanUnreapedAgentBoxLocked(ctx context.Context, fence agentWorkspaceReleaseStore, row db.Workspace) (cleaned db.Workspace, busy bool, err error) {
	store, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return row, false, errAgentBoxCleaning()
	}
	claim, err := fence.ClaimAgentBoxRelease(ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: row.ID})
	if err != nil {
		return row, false, err
	}
	if claim.Busy {
		return row, true, nil
	}
	if claim.Lease == "" || claim.Stage != db.AgentBoxUnreapedStage {
		// Another replica cleaned it, or it changed since: read it again.
		if claim.Lease != "" {
			_ = fence.EndAgentBoxLease(context.WithoutCancel(ctx), row.ID, claim.Lease, claim.Stage)
		}
		current, err := s.q.GetWorkspace(ctx, row.ID)
		return current, false, err
	}
	lease := claim.Lease
	defer func() {
		if err := fence.EndAgentBoxLease(context.WithoutCancel(ctx), row.ID, lease, db.AgentBoxUnreapedStage); err != nil {
			slog.Warn("end agent box lease failed; it lapses on its own", "workspace_id", row.ID, "error", err)
		}
	}()
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID = claim.HeadPushTokenID, claim.Lease, claim.VmID
	guard := agentBoxGuard{fence: fence, workspaceID: row.ID, guest: claim.VmID, lease: &lease}
	retired, err := s.retireAgentBoxLeased(ctx, guard, store, row, "unreaped", 1)
	if errors.Is(err, errAgentBoxLost) {
		return row, true, nil
	}
	if err != nil {
		return row, false, err
	}
	if !retired {
		return row, false, errAgentBoxCleaning()
	}
	current, err := s.q.GetWorkspace(ctx, row.ID)
	return current, false, err
}

// retiredAgentBox reports a box the idle cap retired: asleep with no guest,
// waiting to be rebuilt from its recorded head. Its next start creates a new
// guest rather than waking one, so it needs no machine admission.
func retiredAgentBox(row db.Workspace) bool {
	return row.Status == "suspended" && strings.TrimSpace(row.VmID) == "" && row.DiskReclaimedAt.Valid
}
