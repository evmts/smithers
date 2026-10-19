package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
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
	AgentBoxTurnActive(ctx context.Context, id string) (bool, error)
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

// refuseDirtySessionBoxStart keeps a start that is not its session's turn (a
// resume, a terminal, SSH, a command run) from handing a fresh credential to a
// dirty guest, where a process a turn left could read it (Security d-nhn9cy
// finding 1). While the session's turn is in progress the start is part of
// that turn and goes ahead. Otherwise the start is refused, retryably, and the
// box is retired in the background through the boundary a turn's join uses
// (retireDirtyAgentBoxLocked): the start may hold its authorization
// transaction, so it neither waits on a runtime call nor takes another
// connection (b-k7umb5). Once the box is retired, a retried start builds a new
// guest.
func (s *WorkspaceService) refuseDirtySessionBoxStart(ctx context.Context, row db.Workspace) error {
	guest := strings.TrimSpace(row.VmID)
	if !row.AgentSessionID.Valid || guest == "" || row.AgentBoxDirtyVmID != guest {
		return nil
	}
	var boxes agentSessionBoxStore
	if tx := heldWorkspaceTransaction(ctx, row.ID); tx != nil {
		boxes = db.New(tx)
	} else if store, ok := s.q.(agentSessionBoxStore); ok {
		boxes = store
	} else {
		return nil
	}
	step, cancel := agentBoxStep(ctx)
	active, err := boxes.AgentBoxTurnActive(step, row.ID)
	cancel()
	if err != nil || active {
		return err
	}
	slog.WarnContext(ctx, "start refused: a dirty agent box is retired before it starts outside its turn", "workspace_id", row.ID, "vm_id", guest)
	s.retireDirtySessionBoxLater(row.ID)
	return errAgentBoxDirtyStart()
}

// errAgentBoxDirtyStart refuses a start outside its session's turn while the
// box's dirty guest is retired, retryably.
func errAgentBoxDirtyStart() error {
	return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "the box is being rebuilt after its last turn; try again in a moment")
}

// dirtyStartRetirements are the dirty session boxes a start outside their
// turn is retiring in the background, by workspace id; dirtyStartWait counts
// them. A WorkspaceService is copied by value, so they are not its fields.
var (
	dirtyStartRetirements sync.Map
	dirtyStartWait        sync.WaitGroup
)

// retireDirtySessionBoxLater retires a dirty session box in the background,
// once per box at a time, after the start that found it releases the box. A
// turn or a terminal that uses the box by then keeps it: the turn's join
// retires the guest itself.
func (s *WorkspaceService) retireDirtySessionBoxLater(id string) {
	fence, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return
	}
	if _, running := dirtyStartRetirements.LoadOrStore(id, struct{}{}); running {
		return
	}
	dirtyStartWait.Add(1)
	go func() {
		defer dirtyStartWait.Done()
		defer dirtyStartRetirements.Delete(id)
		ctx, cancel := context.WithTimeout(context.Background(), agentBoxJoinWait+agentBoxGuestActTimeout)
		defer cancel()
		unlock := s.lockRuntimeWorkspace(id)
		defer unlock()
		retired, busy, err := s.retireDirtyAgentBoxLocked(ctx, fence, id, true)
		if err != nil || !retired {
			slog.Warn("dirty agent box not retired; its next turn or the sweep retires it", "workspace_id", id, "busy", busy, "error", err)
		}
	}()
}
