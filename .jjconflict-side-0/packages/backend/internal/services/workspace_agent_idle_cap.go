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
	ListDirtyAgentBoxes(ctx context.Context, limit int32) ([]string, error)
	ListStoppedAgentBoxesWithLiveCredentials(ctx context.Context, childrenTokenPrefix string, limit int32) ([]string, error)
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
// The same sweep first retries every box of unknown state no turn uses (a
// guest its dirty mark names, or a box held by a release that died): it
// revokes and reads back the box's credentials and retires it, until that
// succeeds. A failed release leaves its box for this
// retry (Security s-50rmyl); it runs whether or not the idle cap is set.
func (s *WorkspaceService) RetireIdleAgentBoxes(ctx context.Context) error {
	if s == nil || s.machineAdmission != nil || !s.hasWorkspaceRuntime() || s.requireBranchMachineProviders() != nil {
		return nil
	}
	store, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return nil
	}
	// A real deadline before the first pool acquisition (Security G4
	// finding 5).
	ctx, cancel := context.WithTimeout(ctx, agentBoxSweepBudget)
	defer cancel()
	dirty := errors.Join(s.cleanDirtyAgentBoxes(ctx, store), s.revokeStoppedAgentBoxes(ctx, store))
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
	if _, _, err = s.retireAgentBoxLeased(ctx, guard, store, row, agentBoxRetireIdleCap, 1); errors.Is(err, errAgentBoxLost) {
		logger.Warn("agent box kept past its idle cap", "outcome", "kept_in_use", "kept_for", err.Error())
		return nil
	}
	return err
}

// revokeStoppedAgentBoxes retries the revocation of every credential a box
// that is not running still holds: the durable retry of a release that
// failed on such a box (Security G4 finding 2).
func (s *WorkspaceService) revokeStoppedAgentBoxes(ctx context.Context, store agentBoxIdleCapStore) error {
	fence, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return nil
	}
	ids, err := store.ListStoppedAgentBoxesWithLiveCredentials(ctx, workspaceChildrenTokenName(""), agentBoxIdleRetireBatch)
	if err != nil {
		return err
	}
	var failures []error
	for _, id := range ids {
		got, err := fence.RevokeStoppedAgentBoxCredentials(ctx, db.RevokeStoppedAgentBoxCredentialsParams{WorkspaceID: id, CheckUse: true,
			ChildrenTokenName: workspaceChildrenTokenName(id)})
		if err != nil {
			slog.Warn("credentials of an agent box that is not running are still live; the next sweep retries", "workspace_id", id, "error", err)
			failures = append(failures, err)
			continue
		}
		if got.Revoked {
			slog.Info("credentials of an agent box that is not running revoked", "workspace_id", id)
		}
	}
	return errors.Join(failures...)
}

// cleanDirtyAgentBoxes retries the retirement of every box of unknown state
// no turn uses (retireDirtyAgentBoxLocked). A box another replica holds, or
// whose head is not yet published, stays for the next sweep; only an error
// the sweep cannot expect is returned.
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
	// A box a turn uses, one another replica holds, or one whose head is not
	// yet published (its credentials are revoked by now) waits for the next
	// sweep.
	_, _, err := s.retireDirtyAgentBoxLocked(ctx, fence, id, true)
	return err
}

// agentBoxHeadVerifyAttempts and agentBoxHeadVerifyWait bound how long a
// retirement at turn end waits for the head reporter's last publish.
var (
	agentBoxHeadVerifyAttempts = 4
	agentBoxHeadVerifyWait     = 500 * time.Millisecond
)

// retireAgentBoxLeased retires an agent box while the caller holds its lease
// (*guard.lease, renewed in place): the next box restores the recorded head,
// so it retires only when that head is the published branch head and nothing
// the turn recorded is lost. A box that recorded no head has nothing to lose
// and is built afresh from its branch. It quiesces the box (every credential
// revoked and read back), renews the lease to prove no turn joined since,
// deletes the guest it was decided for and its disk, records the box retired
// and closes its usage. It reports false, with the reason logged, when the
// head is unverified, and errAgentBoxLost when another replica took the box
// over. kept names any coding host the quiesce left running: a box is clean
// only when it is retired, or quiesced with nothing kept.
func (s *WorkspaceService) retireAgentBoxLeased(ctx context.Context, guard agentBoxGuard, store agentBoxIdleCapStore, row db.Workspace, reason string, attempts int) (retired bool, kept string, err error) {
	lease := guard.lease
	logger := slog.With("workspace_id", row.ID, "reason", reason)
	// Credentials first, whether or not the box can be retired: a credential
	// the run may have copied is revoked and read back before anything else.
	revoked, kept, err := s.quiesceAgentBoxLeased(ctx, row, guard)
	if err != nil {
		logger.Warn("agent box credentials not confirmed revoked; the sweep retries", "outcome", "release_failed", "head_token_revoked", revoked, "error", err)
		return false, kept, err
	}
	var verifyErr error
	for attempt := 0; row.HeadCommitID != "" && attempt < max(attempts, 1); attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return false, kept, ctx.Err()
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
		return false, kept, nil
	}
	// The guest is deleted only while the lease still holds a box that names
	// no head token and still has this guest: no turn joined since, so no
	// turn loses its disk. A box with no guest has nothing to delete.
	if strings.TrimSpace(guard.guest) != "" {
		ran, err := guard.run(ctx, agentBoxBeforeDelete, true, func(ctx context.Context) error { return s.deleteRuntimeWorkspaceLocked(ctx, row, row.UserID) })
		if err != nil {
			logger.Warn("agent box retirement failed; the next pass retries it", "outcome", "release_failed", "head_token_revoked", revoked, "error", err)
			return false, kept, err
		}
		if !ran {
			logger.Warn("agent box kept: its release no longer holds it", "outcome", "kept_lease_lost", "head_token_revoked", revoked)
			return false, kept, errAgentBoxLost
		}
	}
	step, cancel := agentBoxStep(ctx)
	retired, err = store.RetireAgentBox(step, row.ID, *lease)
	cancel()
	if err != nil {
		return false, kept, err
	}
	if !retired {
		logger.Warn("agent box kept: its release no longer holds it", "outcome", "kept_lease_lost", "head_token_revoked", revoked)
		return false, kept, errAgentBoxLost
	}
	s.meterWorkspaceUsage(ctx, row, "suspended")
	s.notifyWorkspace(ctx, row.ID, "suspended")
	attrs := []any{"outcome", "retired", "vm_id", row.VmID, "head_commit_id", row.HeadCommitID, "head_token_revoked", revoked}
	if kept = strings.TrimSpace(kept); kept != "" {
		attrs = append(attrs, "kept_for", kept)
	}
	logger.Info(map[string]string{
		agentBoxRetireIdleCap: "agent box retired after its idle cap",
		agentBoxRetireTurnEnd: "agent box retired at its turn's end",
		agentBoxRetireDirty:   "agent box retired before its next turn: its guest is dirty",
		agentBoxRetireFailed:  "agent box retired before its next turn: its guest failed",
	}[reason], attrs...)
	return true, kept, nil
}

// Why an agent box is retired.
const (
	agentBoxRetireIdleCap = "idle_cap"
	// Its turn ended: every hosted turn retires its box (Security d-am9s3m).
	agentBoxRetireTurnEnd = "turn_end"
	// A join or the sweep found the guest its dirty mark names still live.
	agentBoxRetireDirty = "dirty"
	// A join found its box failed, stopped or needing a rebuild.
	agentBoxRetireFailed = "failed"
)

// agentSessionBoxNeedsRetire reports a box a turn must not join as it is and
// the sweep must clean: a live guest its dirty mark names, a box held by a
// release that died, or a session's box whose provision failed, that was
// stopped, or that needs a rebuild. Only the canonical branch machine keeps
// the retain rule for those.
func agentSessionBoxNeedsRetire(row db.Workspace) (reason string, needed bool) {
	guest := strings.TrimSpace(row.VmID)
	switch {
	case row.AgentSessionID.Valid && (row.Status == "failed" || row.Status == "stopped" || row.RebuildRequiredAt.Valid):
		return agentBoxRetireFailed, true
	case guest != "" && row.AgentBoxDirtyVmID == guest, guest != "" && db.IsAgentBoxLease(row.ProvisioningStage):
		return agentBoxRetireDirty, true
	}
	return "", false
}

// retireDirtyAgentBoxLocked holds the lease of a box that needs retiring
// (agentSessionBoxNeedsRetire), revokes and reads back its credentials, and
// retires it when its head is published or it recorded none. retired is true
// when the box no longer needs retiring. busy is true when another replica
// holds the box, or, for the sweep (checkUse), when a turn or a terminal uses
// it. A box whose recorded head is not published stays dirty, retired false.
func (s *WorkspaceService) retireDirtyAgentBoxLocked(ctx context.Context, fence agentWorkspaceReleaseStore, id string, checkUse bool) (retired, busy bool, err error) {
	store, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return false, false, errors.New("the workspace store cannot retire agent boxes")
	}
	row, err := s.q.GetWorkspace(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return true, false, nil
	}
	if err != nil {
		return false, false, err
	}
	if _, needed := agentSessionBoxNeedsRetire(row); !needed {
		return true, false, nil
	}
	claim, err := fence.ClaimAgentBoxRelease(ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: id, AnyStatus: true, CheckUse: checkUse})
	if err != nil {
		return false, false, err
	}
	if claim.Busy || claim.Use.InUse() {
		return false, true, nil
	}
	if claim.Lease == "" {
		// It changed since it was read: the caller reads it again.
		return false, true, nil
	}
	if db.IsAgentBoxLease(claim.Stage) {
		slog.WarnContext(ctx, "agent box lease of a release that died was ended", "workspace_id", id)
	}
	lease := claim.Lease
	defer func() {
		step, cancel := agentBoxStep(ctx)
		defer cancel()
		if err := fence.EndAgentBoxLease(step, id, lease, ""); err != nil {
			slog.Warn("end agent box lease failed; it lapses on its own", "workspace_id", id, "error", err)
		}
	}()
	// Decide on the box as the lease holds it.
	if current, err := s.q.GetWorkspace(ctx, id); err == nil {
		row = current
	}
	reason, needed := agentSessionBoxNeedsRetire(db.Workspace{ID: row.ID, VmID: claim.VmID, Status: claim.Status,
		AgentSessionID: row.AgentSessionID, AgentBoxDirtyVmID: row.AgentBoxDirtyVmID, RebuildRequiredAt: row.RebuildRequiredAt,
		ProvisioningStage: claim.Stage})
	if !needed {
		return true, false, nil
	}
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID, row.Status = claim.HeadPushTokenID, claim.Lease, claim.VmID, claim.Status
	guard := agentBoxGuard{fence: fence, runtime: s.runtime, workspaceID: id, guest: claim.VmID, lease: &lease, point: s.agentBoxReleasePoint}
	retired, _, err = s.retireAgentBoxLeased(ctx, guard, store, row, reason, 1)
	if errors.Is(err, errAgentBoxLost) {
		return false, true, nil
	}
	return retired, false, err
}

// retiredAgentBox reports a retired agent box: asleep with no guest, waiting
// to be rebuilt from its recorded head, or built afresh from its branch when
// it recorded none (db.RetireAgentBox). Its next start creates a new guest
// rather than waking one, so it needs no machine admission.
func retiredAgentBox(row db.Workspace) bool {
	return row.Status == "suspended" && strings.TrimSpace(row.VmID) == "" &&
		(row.DiskReclaimedAt.Valid || row.ProvisioningStage == db.AgentBoxRetiredStage)
}
