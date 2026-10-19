package services

import (
	"context"
	"errors"
	"fmt"
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
//     token, before any coding host starts, and on a turn's join of a box
//     that already has a guest.
//   - Every turn's join of a box whose mark names its live guest retires the
//     guest first, under the box's lease (ClaimAgentBoxRelease,
//     RenewAgentBoxLease, RetireAgentBox), through QuiesceAgentBox's
//     revocations, whatever a reap could report.
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
// must be retired first and the head the box recorded is not published yet:
// retiring it now would lose the last turn's work. A retry succeeds once the
// head publishes.
var errAgentBoxHeadUnverified = errors.New("agent box head unverified")

func agentBoxHeadUnverified() error {
	return fmt.Errorf("%w: %w", errAgentBoxHeadUnverified, pkgerrors.New(pkgerrors.CodeServiceUnavailable,
		"the box is still saving its last turn's work; try again in a moment"))
}

// retireAgentSessionBoxForTurn retires the session's own box before the turn
// joins it: a live guest is marked dirty and retired, and a failed, stopped
// or rebuild-required box is retired too, so the turn builds a fresh guest
// (retireDirtyAgentBoxLocked). It waits while a release on any replica holds
// the box, and takes over a lease that release let lapse. It refuses the
// turn, retryably, when the box's recorded head is not published. An install
// leaves its boxes to its machine lifecycle.
func (s *WorkspaceService) retireAgentSessionBoxForTurn(ctx context.Context, sessionID string) error {
	boxes, ok := s.q.(agentSessionBoxStore)
	fence, fenced := s.q.(agentWorkspaceReleaseStore)
	if !ok || !fenced || s.machineAdmission != nil || !s.hasWorkspaceRuntime() {
		return nil
	}
	row, err := boxes.GetAgentSessionBox(ctx, sessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if guest := strings.TrimSpace(row.VmID); guest != "" && row.AgentBoxDirtyVmID != guest {
		// A join of a box that already has a guest marks it, so a retirement
		// that cannot finish now still leaves the guest dirty.
		step, cancel := agentBoxStep(ctx)
		err := boxes.MarkAgentBoxGuestDirty(step, db.MarkAgentBoxGuestDirtyParams{ID: row.ID, VmID: guest})
		cancel()
		if err != nil {
			return err
		}
	}
	unlock := s.lockRuntimeWorkspace(row.ID)
	defer unlock()
	deadline := time.Now().Add(agentBoxJoinWait)
	for {
		retired, busy, err := s.retireDirtyAgentBoxLocked(ctx, fence, row.ID, false)
		switch {
		case err != nil:
			return err
		case retired:
			return nil
		case !busy:
			return agentBoxHeadUnverified()
		case time.Now().After(deadline):
			return errAgentBoxBusy()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(agentBoxJoinPoll):
		}
	}
}
