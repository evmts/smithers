package services

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A turn's side of the agent box fence (db.ClaimAgentBoxRelease). Releases,
// retirements and turn joins on different replicas meet in the database: a
// join waits while a release holds the box's lease and binds its agent session
// to the box before it mints anything.

// agentBoxJoinWait bounds how long a join waits for a release that holds the
// box, including every pool acquisition; agentBoxJoinPoll is how often it
// looks again. agentBoxReleaseBudget bounds a whole release and
// agentBoxSweepBudget a whole cleanup sweep, both set before their first pool
// acquisition (Security G4 finding 5).
var (
	agentBoxJoinWait      = 2 * time.Minute
	agentBoxJoinPoll      = 250 * time.Millisecond
	agentBoxReleaseBudget = 10 * time.Minute
	agentBoxSweepBudget   = 4 * time.Minute
)

// admitAgentBoxJoin passes an agent turn's join of workspaceID through the
// box's fence before the join opens its authorization transaction, so it
// never needs a second connection while that transaction is held (Security
// G4 finding 4). It waits while a release on any replica holds the box, ends
// a dead release's lease and binds sessionID to the box. The turn retired its
// box's dirty guest before it got here (retireAgentSessionBoxForTurn). Its
// whole wait, including every pool acquisition, is bounded by
// agentBoxJoinWait (finding 5).
func (s *WorkspaceService) admitAgentBoxJoin(ctx context.Context, workspaceID, sessionID string, userID int64) error {
	fence, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok || s.machineAdmission != nil || !s.hasWorkspaceRuntime() || workspaceID == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, agentBoxJoinWait)
	defer cancel()
	refused := errAgentBoxHeld
	unlock := s.lockRuntimeWorkspace(workspaceID)
	defer unlock()
	for {
		admission, err := fence.AdmitAgentBoxJoin(ctx, workspaceID, sessionID, userID)
		if err != nil {
			if ctx.Err() != nil {
				return refused(ctx.Err())
			}
			return err
		}
		if admission.TookOver {
			slog.WarnContext(ctx, "agent box lease of a release that died was ended", "workspace_id", workspaceID)
		}
		if !admission.Busy {
			return nil
		}
		select {
		case <-ctx.Done():
			return refused(ctx.Err())
		case <-time.After(agentBoxJoinPoll):
		}
	}
}

// refuseHeldAgentBoxLocked refuses, retryably and without a database call, a
// start of a box a release holds. An agent turn's join passes the fence
// before its authorization transaction (admitAgentBoxJoin); any other start
// waits for the release to end. A start outside its session's turn is also
// refused while the box's guest is dirty (refuseDirtySessionBoxStart).
func (s *WorkspaceService) refuseHeldAgentBoxLocked(row db.Workspace) error {
	if s.machineAdmission != nil || !s.hasWorkspaceRuntime() || row.Status != "running" {
		return nil
	}
	if db.IsAgentBoxLease(row.ProvisioningStage) {
		return errAgentBoxBusy()
	}
	return nil
}

// errAgentBoxBusy refuses a turn while a release still holds its box,
// retryably.
func errAgentBoxBusy() error {
	return errAgentBoxHeld(nil)
}

// errAgentBoxHeld refuses a start or a join whose box a release, or another
// transaction's lock, held past its wait: the typed retryable box_busy
// refusal a full mutation slot gets (errWorkspaceMutationBusy), so a turn
// retries it within its budget.
func errAgentBoxHeld(cause error) error {
	refused := pkgerrors.New(pkgerrors.CodeServiceUnavailable, "the box is still being released after its last turn; try again in a moment").
		WithCause(errors.Join(errWorkspaceStartsBusy, cause))
	refused.RetryAfter = workspaceMutationBusyRetryAfter
	refused.Details = map[string]any{"reason_code": agentSessionBoxBusy.Code, "retryable": agentSessionBoxBusy.Retryable}
	return refused
}

// errAgentBoxLost is a release that no longer holds its box: its lease
// lapsed and another replica took the box over, or the box's guest changed.
var errAgentBoxLost = errors.New("another replica took the box over")

// agentBoxStepTimeout bounds each database step of a release, and
// agentBoxGuestActTimeout each runtime side effect, well inside the lease
// (db.AgentBoxLeaseSeconds): a release that keeps its deadlines never acts
// after its lease lapses.
var (
	agentBoxStepTimeout     = 10 * time.Second
	agentBoxGuestActTimeout = 2 * time.Minute
)

// agentBoxStep bounds one database step of a release. It keeps running when
// the caller's request ends, as cleanup must, but never past its deadline.
func agentBoxStep(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), agentBoxStepTimeout)
}

// agentBoxGuard runs a release's runtime side effects on the guest the
// release was decided for. The runtime addresses a guest by the reusable
// workspace id, so before each act the guard renews the lease, which proves
// the release still holds a running box with that guest, and the act names
// the guest to the runtime (workspaceapi.WithGuest). No transaction is held
// across an act.
type agentBoxGuard struct {
	fence       agentWorkspaceReleaseStore
	runtime     workspaceapi.WorkspaceRuntime
	workspaceID string
	guest       string
	lease       *string
	// point is called after the renewal, before the act (tests pause there).
	point func(point, workspaceID string)
}

// errRuntimeUnfenced refuses a release's runtime side effect on a runtime
// that does not declare workspaceapi.WorkspaceGuestFence: it could reach a
// guest built since the release was decided.
var errRuntimeUnfenced = errors.New("the workspace runtime cannot scope a call to one guest (workspace.WorkspaceGuestFence)")

// run renews the lease and performs act under a deadline, scoped to the
// guest. noHeadToken also requires that the box names no head token. It
// answers false, without running act or after act found its guest gone
// (workspaceapi.ErrGuestGone), when the release lost the box. It refuses a
// runtime that does not fence guests (errRuntimeUnfenced).
func (g agentBoxGuard) run(ctx context.Context, point string, noHeadToken bool, act func(context.Context) error) (bool, error) {
	if fenced, ok := g.runtime.(workspaceapi.WorkspaceGuestFence); !ok || !fenced.FencesGuests() {
		return false, errRuntimeUnfenced
	}
	step, cancel := agentBoxStep(ctx)
	renewed, err := g.fence.RenewAgentBoxLease(step, g.workspaceID, *g.lease, g.guest, noHeadToken)
	cancel()
	if err != nil {
		return false, err
	}
	if renewed == "" {
		return false, nil
	}
	*g.lease = renewed
	if g.point != nil {
		g.point(point, g.workspaceID)
	}
	actCtx, cancel := context.WithTimeout(workspaceapi.WithGuest(ctx, g.guest), agentBoxGuestActTimeout)
	defer cancel()
	if err := act(actCtx); errors.Is(err, workspaceapi.ErrGuestGone) {
		return false, nil
	} else if err != nil {
		return true, err
	}
	return true, nil
}

// The points of a release a test can pause one replica at.
const (
	// Before the release reads what still uses the box.
	agentBoxBeforeClaim = "before_claim"
	// Inside the claim, right after it read that nothing does.
	agentBoxAfterEmptyUse = "after_empty_use"
	// After a release renewed its lease, before it stops the coding hosts.
	agentBoxBeforeStop = "before_stop"
	// After a release renewed its lease, before it ends the guest's git
	// credential cache.
	agentBoxBeforeCredentialCache = "before_credential_cache"
	// After a retirement renewed its lease, before it deletes the guest.
	agentBoxBeforeDelete = "before_delete"
	// Inside a start's authorization transaction, before it reads whether the
	// box's guest is dirty outside its session's turn.
	agentBoxBeforeStartCheck = "before_start_check"
	// Right after that read, before the start mints anything.
	agentBoxAfterStartCheck = "after_start_check"
)

func (s *WorkspaceService) agentBoxReleasePoint(point, workspaceID string) {
	if s.agentBoxReleaseHook != nil {
		s.agentBoxReleaseHook(point, workspaceID)
	}
}
