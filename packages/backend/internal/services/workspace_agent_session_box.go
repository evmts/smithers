package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// THE DIRTY MARK (Security d-am9s3m, plue#869). Each agent session has its
// own box, and a guest one turn minted tokens on is never handed warm to the
// next. workspaces.agent_box_dirty_vm_id names the guest that holds a turn's
// credentials:
//
//   - It is set to the live vm_id in the write that records the box's head
//     token, before any coding host starts, and on a turn's join of a box that
//     already has a guest.
//   - Every turn's join of a box whose mark names its live guest retires the
//     guest first, under the box's lease, whatever a reap reported.
//   - Only the write that records a retired box's new guest clears it
//     (RecordAgentBoxGuest). A reap, a lease takeover or a failed release
//     never does.

// agentSessionBoxStore is the store surface a turn's join retires its box
// through.
type agentSessionBoxStore interface {
	GetAgentSessionBox(ctx context.Context, agentSessionID string) (db.Workspace, error)
	MarkAgentBoxGuestDirty(ctx context.Context, arg db.MarkAgentBoxGuestDirtyParams) error
}

// agentBoxGuestRecorder records a new guest on an agent session's box.
type agentBoxGuestRecorder interface {
	RecordAgentBoxGuest(ctx context.Context, arg db.RecordAgentBoxGuestParams) (db.Workspace, error)
}

// errAgentBoxHeadUnverified marks a turn refused because its box's guest
// must be retired first and the head the box recorded is not published yet,
// so retiring it now would lose the last turn's work. A retry can succeed
// once the head publishes.
var errAgentBoxHeadUnverified = errors.New("agent box head unverified")

func agentBoxHeadUnverified() error {
	return fmt.Errorf("%w: %w", errAgentBoxHeadUnverified, pkgerrors.New(pkgerrors.CodeServiceUnavailable,
		"the box is still saving its last turn's work; try again in a moment"))
}

// agentSessionBoxNeedsRetire reports a box a turn must not join as it is: one
// with a live guest (dirty, or marked dirty by this join), or one whose
// provision failed, that was stopped, or that needs a rebuild. Only the
// canonical branch machine keeps the retain rule for these.
func agentSessionBoxNeedsRetire(row db.Workspace) bool {
	return strings.TrimSpace(row.VmID) != "" || row.Status == "failed" || row.Status == "stopped" || row.RebuildRequiredAt.Valid
}

// retireAgentSessionBoxForTurn retires the session's own box before the turn
// joins it, under the box's lease (ClaimAgentBoxRelease, RenewAgentBoxLease,
// RetireAgentBox): a live guest is marked dirty and retired, and a failed,
// stopped or rebuild-required box is retired too, so the turn builds a fresh
// guest. It waits while a release on any replica holds the box and takes over
// a lease that release let lapse. It refuses the turn, retryably, when the
// box's recorded head is not published. An install leaves its boxes to its
// machine lifecycle.
func (s *WorkspaceService) retireAgentSessionBoxForTurn(ctx context.Context, sessionID string) error {
	boxes, ok := s.q.(agentSessionBoxStore)
	fence, fenced := s.q.(agentWorkspaceReleaseStore)
	retire, retirable := s.q.(agentBoxIdleCapStore)
	if !ok || !fenced || !retirable || s.machineAdmission != nil || !s.hasWorkspaceRuntime() {
		return nil
	}
	row, err := boxes.GetAgentSessionBox(ctx, sessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !agentSessionBoxNeedsRetire(row) {
		return nil
	}
	unlock := s.lockRuntimeWorkspace(row.ID)
	defer unlock()
	deadline := time.Now().Add(agentBoxJoinWait)
	for {
		retired, busy, err := s.retireAgentSessionBoxOnce(ctx, boxes, fence, retire, row.ID)
		if err != nil || !busy {
			if err == nil && !retired {
				return agentBoxHeadUnverified()
			}
			return err
		}
		if time.Now().After(deadline) {
			return errAgentBoxBusy()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(agentBoxJoinPoll):
		}
	}
}

// retireAgentSessionBoxOnce makes one attempt. retired is true when the box
// no longer needs retiring; busy is true when another release holds it.
func (s *WorkspaceService) retireAgentSessionBoxOnce(ctx context.Context, boxes agentSessionBoxStore, fence agentWorkspaceReleaseStore, retire agentBoxIdleCapStore, id string) (retired, busy bool, err error) {
	row, err := s.q.GetWorkspace(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return true, false, nil
	}
	if err != nil {
		return false, false, err
	}
	if !agentSessionBoxNeedsRetire(row) {
		return true, false, nil
	}
	reason := agentBoxRetireFailed
	if guest := strings.TrimSpace(row.VmID); guest != "" && row.Status != "failed" && row.Status != "stopped" && !row.RebuildRequiredAt.Valid {
		reason = agentBoxRetireDirty
		if row.AgentBoxDirtyVmID == "" {
			// A join of a box that already has a guest marks it, so a retire
			// that cannot finish now still leaves the guest dirty.
			if err := boxes.MarkAgentBoxGuestDirty(ctx, db.MarkAgentBoxGuestDirtyParams{ID: row.ID, VmID: guest}); err != nil {
				return false, false, err
			}
		}
	}
	claim, err := fence.ClaimAgentBoxRelease(ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: row.ID, AnyStatus: true})
	if err != nil {
		return false, false, err
	}
	if claim.Busy {
		return false, true, nil
	}
	if claim.Lease == "" {
		// It changed since it was read: read it again.
		return false, true, nil
	}
	if db.IsAgentBoxLease(claim.Stage) {
		slog.WarnContext(ctx, "agent box lease of a release that died was ended", "workspace_id", row.ID)
	}
	lease := claim.Lease
	defer endAgentBoxLease(ctx, fence, row.ID, &lease)
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID = claim.HeadPushTokenID, claim.Lease, claim.VmID
	guard := agentBoxGuard{fence: fence, workspaceID: row.ID, guest: claim.VmID, lease: &lease}
	done, err := s.retireAgentBoxLeased(ctx, guard, retire, row, reason, 1)
	if errors.Is(err, errAgentBoxLost) {
		return false, true, nil
	}
	return done, false, err
}

// retireAgentBoxHostCredentials retires the landing and cache credentials of
// every coding host bound to a box that has no guest to stop them on.
func (s *WorkspaceService) retireAgentBoxHostCredentials(ctx context.Context, row db.Workspace) {
	store, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return
	}
	detached, cancel := agentBoxCleanupContext()
	defer cancel()
	holders, err := store.ListFlowHostBindingHolders(detached, row.ID)
	if err != nil {
		slog.WarnContext(ctx, "list coding hosts of a retired agent box failed", "workspace_id", row.ID, "error", err)
		return
	}
	for _, holder := range holders {
		s.RetireBoxHostCredential(detached, holder.ID, holder.UserID)
	}
}

// agentBoxCleanupTimeout bounds one cleanup write a box's release or retire
// makes after its caller's context may have ended (guardian b-k7umb5).
const agentBoxCleanupTimeout = 5 * time.Second

func agentBoxCleanupContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), agentBoxCleanupTimeout)
}

// endAgentBoxLease ends *lease, leaving the box at no stage. A retirement
// already replaced the lease with its own stage, and then this changes
// nothing; a box left dirty keeps its mark either way.
func endAgentBoxLease(ctx context.Context, fence agentWorkspaceReleaseStore, workspaceID string, lease *string) {
	cleanup, cancel := agentBoxCleanupContext()
	defer cancel()
	if err := fence.EndAgentBoxLease(cleanup, workspaceID, *lease, ""); err != nil {
		slog.WarnContext(ctx, "end agent box lease failed; it lapses on its own", "workspace_id", workspaceID, "error", err)
	}
}
