package services

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// A turn's side of the agent box fence (db.ClaimAgentBoxRelease). Releases,
// retirements and turn joins on different replicas meet in the database: a
// join waits while a release holds the box's lease and binds its agent session
// to the box before it mints anything.

// agentBoxJoinWait bounds how long a join waits for a release that holds the
// box; agentBoxJoinPoll is how often it looks again.
var (
	agentBoxJoinWait = 2 * time.Minute
	agentBoxJoinPoll = 250 * time.Millisecond
)

type agentBoxJoinKey struct{}

// agentBoxJoin is the agent session a start joins a box for.
type agentBoxJoin struct {
	sessionID string
	userID    int64
}

// withAgentBoxJoin marks ctx as an agent turn's join of a box for sessionID.
func withAgentBoxJoin(ctx context.Context, sessionID string, userID int64) context.Context {
	return context.WithValue(ctx, agentBoxJoinKey{}, agentBoxJoin{sessionID: sessionID, userID: userID})
}

// admitAgentBoxJoinLocked passes a start through the box's fence before it
// mints anything. An agent turn's join waits while a release on any replica
// holds the box, then binds its session to the box in the same transaction,
// so a release that reads the box's use afterwards sees the turn. Any other
// start waits only while a release holds the box. The turn retired its box's
// dirty guest before it got here (retireAgentSessionBoxForTurn). It answers
// the box as it now is.
func (s *WorkspaceService) admitAgentBoxJoinLocked(ctx context.Context, row db.Workspace) (db.Workspace, error) {
	fence, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok || s.machineAdmission != nil || !s.hasWorkspaceRuntime() {
		return row, nil
	}
	join, joining := ctx.Value(agentBoxJoinKey{}).(agentBoxJoin)
	if !joining && !db.IsAgentBoxLease(row.ProvisioningStage) {
		return row, nil
	}
	deadline := time.Now().Add(agentBoxJoinWait)
	for {
		admission, err := fence.AdmitAgentBoxJoin(ctx, row.ID, join.sessionID, join.userID)
		if err != nil {
			return row, err
		}
		if admission.TookOver {
			slog.WarnContext(ctx, "agent box lease of a release that died was ended", "workspace_id", row.ID)
		}
		if !admission.Busy {
			return s.q.GetWorkspace(ctx, row.ID)
		}
		if time.Now().After(deadline) {
			return row, errAgentBoxBusy()
		}
		select {
		case <-ctx.Done():
			return row, ctx.Err()
		case <-time.After(agentBoxJoinPoll):
		}
	}
}

// errAgentBoxBusy refuses a turn while a release still holds its box,
// retryably.
func errAgentBoxBusy() error {
	return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "the box is still being released after its last turn; try again in a moment")
}

// errAgentBoxLost is a release that no longer holds its box: its lease
// lapsed and another replica took the box over, or the box's guest changed.
var errAgentBoxLost = errors.New("another replica took the box over")

// agentBoxGuestActTimeout bounds one runtime side effect run under the box's
// lock (agentBoxGuard.run).
var agentBoxGuestActTimeout = 2 * time.Minute

// agentBoxGuard runs a release's runtime side effects on the guest the
// release was decided for. The runtime addresses a guest by the reusable
// workspace id, so each act runs under the box's lock and only while the
// release still holds *lease and the box still has guest
// (db.WithAgentBoxGuest): a late call never reaches a guest another replica
// built since.
type agentBoxGuard struct {
	fence       agentWorkspaceReleaseStore
	workspaceID string
	guest       string
	lease       *string
}

// run performs act under the guard. It answers false, without running act,
// when the release lost the box.
func (g agentBoxGuard) run(ctx context.Context, act func(context.Context) error) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, agentBoxGuestActTimeout)
	defer cancel()
	return g.fence.WithAgentBoxGuest(ctx, g.workspaceID, *g.lease, g.guest, act)
}

// The points of a release a test can pause one replica at.
const (
	// Before the release reads what still uses the box.
	agentBoxBeforeClaim = "before_claim"
	// Inside the claim, right after it read that nothing does.
	agentBoxAfterEmptyUse = "after_empty_use"
	// After the release revoked the run's head token, before any runtime side
	// effect.
	agentBoxBeforeRuntime = "before_runtime"
	// After a retirement renewed its lease, before it deletes the guest.
	agentBoxBeforeDelete = "before_delete"
)

func (s *WorkspaceService) agentBoxReleasePoint(point, workspaceID string) {
	if s.agentBoxReleaseHook != nil {
		s.agentBoxReleaseHook(point, workspaceID)
	}
}
