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
// start waits only while a release holds the box. A box whose last run's
// processes were not confirmed ended is cleaned first (plue#866). It answers
// the box as it now is.
func (s *WorkspaceService) admitAgentBoxJoinLocked(ctx context.Context, row db.Workspace) (db.Workspace, error) {
	fence, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok || s.machineAdmission != nil || !s.hasWorkspaceRuntime() {
		return row, nil
	}
	join, joining := ctx.Value(agentBoxJoinKey{}).(agentBoxJoin)
	if !joining && !db.IsAgentBoxLease(row.ProvisioningStage) && row.ProvisioningStage != db.AgentBoxUnreapedStage {
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
			current, err := s.q.GetWorkspace(ctx, row.ID)
			if err != nil {
				return row, err
			}
			if current.Status != "running" || current.ProvisioningStage != db.AgentBoxUnreapedStage {
				return current, nil
			}
			cleaned, busy, err := s.cleanUnreapedAgentBoxLocked(ctx, fence, current)
			if err != nil {
				return current, err
			}
			if !busy {
				return cleaned, nil
			}
		}
		if time.Now().After(deadline) {
			return row, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "the box is still being released after its last turn; try again in a moment")
		}
		select {
		case <-ctx.Done():
			return row, ctx.Err()
		case <-time.After(agentBoxJoinPoll):
		}
	}
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
	// After a release renewed its lease, before it reaps the run's processes.
	agentBoxBeforeReap = "before_reap"
	// After a retirement renewed its lease, before it deletes the guest.
	agentBoxBeforeDelete = "before_delete"
)

func (s *WorkspaceService) agentBoxReleasePoint(point, workspaceID string) {
	if s.agentBoxReleaseHook != nil {
		s.agentBoxReleaseHook(point, workspaceID)
	}
}
