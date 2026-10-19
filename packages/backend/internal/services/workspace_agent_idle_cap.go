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
	ListDirtyAgentBoxes(ctx context.Context, limit int32) ([]string, error)
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
//
// The same sweep first retries every box of unknown state (unreaped, or held
// by a release that died): it revokes and reads back the box's credentials and
// retires it, until that succeeds. A failed release leaves its box for this
// retry (Security s-50rmyl); it runs whether or not the idle cap is set.
func (s *WorkspaceService) RetireIdleAgentBoxes(ctx context.Context) error {
	if s == nil || s.machineAdmission != nil || !s.hasWorkspaceRuntime() || s.requireBranchMachineProviders() != nil {
		return nil
	}
	store, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return nil
	}
	dirty := s.cleanDirtyAgentBoxes(ctx, store)
	if s.agentBoxIdleCap <= 0 {
		return dirty
	}
	idleSeconds := int64(s.agentBoxIdleCap / time.Second)
	ids, err := store.ListIdleAgentBoxes(ctx, idleSeconds, agentBoxIdleRetireBatch)
	if err != nil {
		return errors.Join(dirty, err)
	}
	failures := []error{dirty}
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
		step, cancel := agentBoxStep(ctx)
		defer cancel()
		if err := fence.EndAgentBoxLease(step, id, lease, claim.Stage); err != nil {
			logger.Warn("end agent box lease failed; it lapses on its own", "error", err)
		}
	}()
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID = claim.HeadPushTokenID, claim.Lease, claim.VmID
	guard := agentBoxGuard{fence: fence, runtime: s.runtime, workspaceID: id, guest: claim.VmID, lease: &lease, point: s.agentBoxReleasePoint}
	if _, err = s.retireAgentBoxLeased(ctx, guard, store, row, "idle_cap", 1); errors.Is(err, errAgentBoxLost) {
		logger.Warn("agent box kept past its idle cap", "outcome", "kept_in_use", "kept_for", err.Error())
		return nil
	}
	return err
}

// cleanDirtyAgentBoxes retries the cleaning of every box of unknown state
// (cleanUnreapedAgentBoxLocked). A box another replica holds, or whose head is
// not yet published, stays for the next sweep; only an error the sweep cannot
// expect is returned.
func (s *WorkspaceService) cleanDirtyAgentBoxes(ctx context.Context, store agentBoxIdleCapStore) error {
	fence, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return nil
	}
	ids, err := store.ListDirtyAgentBoxes(ctx, agentBoxIdleRetireBatch)
	if err != nil {
		return err
	}
	var failures []error
	for _, id := range ids {
		if err := ctx.Err(); err != nil {
			return errors.Join(append(failures, err)...)
		}
		if err := s.cleanDirtyAgentBox(ctx, fence, id); err != nil {
			slog.Warn("agent box of unknown state not yet clean; the next sweep retries it", "workspace_id", id, "error", err)
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}

func (s *WorkspaceService) cleanDirtyAgentBox(ctx context.Context, fence agentWorkspaceReleaseStore, id string) error {
	unlock := s.lockRuntimeWorkspace(id)
	defer unlock()
	row, err := s.q.GetWorkspace(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	// A box another replica holds, or one whose head is not yet published (its
	// credentials are revoked by now), waits for the next sweep.
	_, _, _, err = s.retireDirtyAgentBoxLocked(ctx, fence, row)
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
	// Credentials first, whether or not the box can be retired: a credential
	// the run may have copied is revoked and read back before anything else.
	revoked, kept, err := s.quiesceAgentBoxLeased(ctx, row, guard)
	if err != nil {
		logger.Warn("agent box credentials not confirmed revoked; the sweep retries", "outcome", "release_failed", "head_token_revoked", revoked, "error", err)
		return false, err
	}
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
	// The guest is deleted only while the lease still holds a running box that
	// names no head token and still has this guest: no turn joined since, so
	// no turn loses its disk.
	ran, err := guard.run(ctx, agentBoxBeforeDelete, true, func(ctx context.Context) error { return s.deleteRuntimeWorkspaceLocked(ctx, row, row.UserID) })
	if err != nil {
		logger.Warn("agent box retirement failed; the next pass retries it", "outcome", "release_failed", "head_token_revoked", revoked, "error", err)
		return false, err
	}
	if !ran {
		logger.Warn("agent box kept: its release no longer holds it", "outcome", "kept_lease_lost", "head_token_revoked", revoked)
		return false, errAgentBoxLost
	}
	step, cancel := agentBoxStep(ctx)
	retired, err := store.RetireAgentBox(step, row.ID, *lease)
	cancel()
	if err != nil {
		return false, err
	}
	if !retired {
		logger.Warn("agent box kept: its release no longer holds it", "outcome", "kept_lease_lost", "head_token_revoked", revoked)
		return false, errAgentBoxLost
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
	cleaned, busy, retired, err := s.retireDirtyAgentBoxLocked(ctx, fence, row)
	if err != nil || busy {
		return cleaned, busy, err
	}
	if !retired && cleaned.Status == "running" && (cleaned.ProvisioningStage == db.AgentBoxUnreapedStage || db.IsAgentBoxLease(cleaned.ProvisioningStage)) {
		return cleaned, false, errAgentBoxCleaning()
	}
	return cleaned, false, nil
}

// retireDirtyAgentBoxLocked holds the lease of a box of unknown state,
// revokes and reads back its credentials, and retires it when its head is
// published. retired is false when the box was not dirty (another replica
// cleaned it; cleaned is the box as it now is) or when its head is not
// published, in which case it stays unreaped. busy is true when another
// replica holds the box.
func (s *WorkspaceService) retireDirtyAgentBoxLocked(ctx context.Context, fence agentWorkspaceReleaseStore, row db.Workspace) (cleaned db.Workspace, busy, retired bool, err error) {
	store, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return row, false, false, errAgentBoxCleaning()
	}
	claim, err := fence.ClaimAgentBoxRelease(ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: row.ID})
	if err != nil {
		return row, false, false, err
	}
	if claim.Busy {
		return row, true, false, nil
	}
	if claim.Lease == "" || claim.Stage != db.AgentBoxUnreapedStage && !db.IsAgentBoxLease(claim.Stage) {
		// Another replica cleaned it, or it changed since: read it again.
		if claim.Lease != "" {
			step, cancel := agentBoxStep(ctx)
			_ = fence.EndAgentBoxLease(step, row.ID, claim.Lease, claim.Stage)
			cancel()
		}
		current, err := s.q.GetWorkspace(ctx, row.ID)
		return current, false, false, err
	}
	lease := claim.Lease
	defer func() {
		step, cancel := agentBoxStep(ctx)
		defer cancel()
		if err := fence.EndAgentBoxLease(step, row.ID, lease, db.AgentBoxUnreapedStage); err != nil {
			slog.Warn("end agent box lease failed; it lapses on its own", "workspace_id", row.ID, "error", err)
		}
	}()
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID = claim.HeadPushTokenID, claim.Lease, claim.VmID
	guard := agentBoxGuard{fence: fence, runtime: s.runtime, workspaceID: row.ID, guest: claim.VmID, lease: &lease, point: s.agentBoxReleasePoint}
	retired, err = s.retireAgentBoxLeased(ctx, guard, store, row, "unreaped", 1)
	if errors.Is(err, errAgentBoxLost) {
		return row, true, false, nil
	}
	if err != nil {
		return row, false, false, err
	}
	if !retired {
		row.ProvisioningStage = db.AgentBoxUnreapedStage
		return row, false, false, nil
	}
	current, err := s.q.GetWorkspace(ctx, row.ID)
	return current, false, true, err
}

// retiredAgentBox reports a box the idle cap retired: asleep with no guest,
// waiting to be rebuilt from its recorded head. Its next start creates a new
// guest rather than waking one, so it needs no machine admission.
func retiredAgentBox(row db.Workspace) bool {
	return row.Status == "suspended" && strings.TrimSpace(row.VmID) == "" && row.DiskReclaimedAt.Valid
}
