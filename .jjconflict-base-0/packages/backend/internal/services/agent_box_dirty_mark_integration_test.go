package services

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/productstore"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A GUEST ONE TURN MINTED ON IS NEVER HANDED WARM TO THE NEXT (Security
// d-am9s3m, plue#866, plue#869). Recording a turn's head token marks the
// box's guest dirty; every later turn's join of a box whose mark names its
// live guest retires that guest first and builds a fresh one. Nothing but
// recording the new guest clears the mark: not a reap that reports success,
// not a lease a dead release left, not a release that failed early. A process
// a prompt-injected run left behind goes with its guest.

// nextTurn admits a second change request on the box through the session
// path, as the dispatch does, and answers the join's error.
func (f *agentBoxRelease) nextTurn(t *testing.T) error {
	t.Helper()
	box := f.box(t)
	definition, err := f.q.UpsertAgentWorkflowDefinition(f.ctx, box.RepositoryID)
	require.NoError(t, err)
	run, err := f.q.CreateWorkflowRun(f.ctx, db.CreateWorkflowRunParams{RepositoryID: box.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "queued",
		TriggerEvent: "agent_message", DispatchInputs: json.RawMessage(`{}`), ExecutionPlane: "agent"})
	require.NoError(t, err)
	claimed, err := f.q.ClaimAgentSessionForDispatch(f.ctx, f.session, run.ID)
	require.NoError(t, err)
	require.True(t, claimed)
	slug, err := f.q.GetRepoOwnerSlugAndNameByID(f.ctx, box.RepositoryID)
	require.NoError(t, err)
	_, err = f.boxes.CreateAgentWorkspace(f.ctx, CreateAgentWorkspaceInput{RepositoryID: box.RepositoryID, UserID: f.person,
		SessionID: f.session, RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName})
	return err
}

// requireDirty checks that the fixture box still has its guest, marked
// dirty, and that no release holds it: its next turn or the sweep retires it.
func (f *agentBoxRelease) requireDirty(t *testing.T, msg string) {
	t.Helper()
	box := f.box(t)
	require.Equal(t, "running", box.Status, msg)
	require.Equal(t, "vm-agent-box", box.VmID, msg)
	require.Equal(t, box.VmID, box.AgentBoxDirtyVmID, msg)
	require.False(t, db.IsAgentBoxLease(box.ProvisioningStage), msg)
}

// dirtyTurn is one session's turn on its own box and what it left there.
type dirtyTurn struct {
	box     AgentWorkspaceResult
	head    int64
	run     sessionBoxRun
	session string
}

// firstTurn runs a session's first turn: it builds the box's guest, records
// its head token (marking the guest dirty), and plants ~/.profile and a
// process holding the run's token.
func (f *sessionBoxes) firstTurn(t *testing.T) dirtyTurn {
	t.Helper()
	session := f.session(t, f.alice)
	result, err := f.turn(f.alice, session)
	require.NoError(t, err)
	box := f.box(t, result.WorkspaceID)
	require.True(t, box.HeadPushTokenID.Valid, "the turn minted its head token")
	require.Equal(t, result.VMID, box.AgentBoxDirtyVmID, "recording it marked the guest dirty")
	return dirtyTurn{box: result, head: box.HeadPushTokenID.Int64, run: f.run(t, f.alice, result), session: session}
}

func (f *sessionBoxes) tokenLive(t *testing.T, id int64) bool {
	t.Helper()
	var live bool
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT EXISTS (SELECT 1 FROM access_tokens WHERE id=$1)`, id).Scan(&live))
	return live
}

// requireFreshGuest checks that the second turn got a new guest on the same
// box row, with a new head token, and that nothing of the first survived.
func (f *sessionBoxes) requireFreshGuest(t *testing.T, first dirtyTurn, second AgentWorkspaceResult) {
	t.Helper()
	require.Equal(t, first.box.WorkspaceID, second.WorkspaceID, "the session keeps its box row")
	require.NotEqual(t, first.box.VMID, second.VMID, "on a new guest")
	require.Equal(t, 2, f.runtime.creates, "the runtime created exactly two guests: no warm join")
	require.Contains(t, f.runtime.deleted, first.box.VMID, "the first guest was deleted")
	box := f.box(t, second.WorkspaceID)
	require.True(t, box.HeadPushTokenID.Valid)
	require.NotEqual(t, first.head, box.HeadPushTokenID.Int64, "a new head token")
	require.False(t, f.tokenLive(t, first.head), "the first turn's head token is revoked")
	require.Equal(t, second.VMID, box.AgentBoxDirtyVmID, "the new guest is marked dirty by its own token")
	f.requireHoldsNothingOf(t, second.WorkspaceID, first.run)
	_, planted := f.runtime.guest(second.WorkspaceID).files["/home/developer/.profile"]
	require.False(t, planted, "~/.profile is absent")
}

// (a) The first turn's release never ran (its API pod crashed). The next
// turn still gets a new guest.
func TestAgentBoxSkippedReleaseNextTurnGetsNewGuest(t *testing.T) {
	f := newSessionBoxes(t)
	first := f.firstTurn(t)

	second, err := f.turn(f.alice, first.session)

	require.NoError(t, err)
	f.requireFreshGuest(t, first, second)
}

// reapingSessionBoxRuntime is a runtime that could confirm every run process
// ended. A reap proves nothing about files or tokens a run left, so no
// release asks for one and no box is kept warm.
type reapingSessionBoxRuntime struct {
	*sessionBoxRuntime
	reaped int
}

func (r *reapingSessionBoxRuntime) ReapRunProcesses(context.Context, string) error {
	r.reaped++
	return nil
}

// (b) A runtime that could confirm the run's processes ended changes
// nothing: the release retires the box, its dirty mark is untouched, and the
// next turn gets a new guest.
func TestAgentBoxReapSuccessStillRetires(t *testing.T) {
	f := newSessionBoxes(t)
	reaper := &reapingSessionBoxRuntime{sessionBoxRuntime: f.runtime}
	f.boxes.runtime = reaper
	first := f.firstTurn(t)

	release, err := f.boxes.ReleaseAgentWorkspace(f.ctx, first.box.WorkspaceID, first.session, 0)

	require.NoError(t, err)
	require.Equal(t, agentWorkspaceRetired, release.Outcome)
	require.True(t, release.HeadTokenRevoked)
	require.Zero(t, reaper.reaped, "no reap decides a box's fate")
	box := f.box(t, first.box.WorkspaceID)
	require.Equal(t, first.box.VMID, box.AgentBoxDirtyVmID, "the release leaves the dirty mark as it was")
	require.Empty(t, box.VmID, "the guest is gone")
	require.Equal(t, "suspended", box.Status, "a retired box reads suspended")
	require.False(t, box.DiskReclaimedAt.Valid, "a box that recorded no head is built afresh")
	require.False(t, f.tokenLive(t, first.head))

	second, err := f.turn(f.alice, first.session)
	require.NoError(t, err)
	f.requireFreshGuest(t, first, second)
}

// Guardian f-giktpr (1): the first turn's release took the box's lease and
// died before it revoked or retired anything. Its lease expires; taking it
// over proves nothing about what the release finished.
func TestAgentBoxExpiredReleaseLeaseStillRetires(t *testing.T) {
	f := newSessionBoxes(t)
	first := f.firstTurn(t)
	_, err := f.pool.Exec(f.ctx, `UPDATE agent_sessions SET status='completed', finished_at=NOW() WHERE id=$1`, first.session)
	require.NoError(t, err)
	claim, err := f.q.ClaimAgentBoxRelease(f.ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: first.box.WorkspaceID, FinishedSessionID: first.session, CheckUse: true})
	require.NoError(t, err)
	require.NotEmpty(t, claim.Lease)
	_, err = f.pool.Exec(f.ctx, `UPDATE workspaces SET provisioning_stage = $2 || (floor(extract(epoch FROM now()))::bigint - $3::bigint)::text || ':dead' WHERE id = $1`,
		first.box.WorkspaceID, db.AgentBoxLeasePrefix, 2*db.AgentBoxLeaseSeconds)
	require.NoError(t, err)
	_, err = f.pool.Exec(f.ctx, `UPDATE agent_sessions SET status='active', finished_at=NULL WHERE id=$1`, first.session)
	require.NoError(t, err)

	second, err := f.turn(f.alice, first.session)

	require.NoError(t, err)
	f.requireFreshGuest(t, first, second)
}

// Guardian f-giktpr (2): the release failed in workspaceRuntimeContext,
// before it reached the guest. The box keeps its dirty mark.
func TestAgentBoxReleaseFailingEarlyStillRetires(t *testing.T) {
	f := newSessionBoxes(t)
	first := f.firstTurn(t)
	f.boxes.runtimeIdentity = func(context.Context, db.Workspace, int64) (workspaceapi.Operation, error) {
		return workspaceapi.Operation{}, errors.New("runtime identity unavailable")
	}

	release, err := f.boxes.ReleaseAgentWorkspace(f.ctx, first.box.WorkspaceID, first.session, 0)

	require.Error(t, err)
	require.Equal(t, agentWorkspaceReleaseFailed, release.Outcome)
	box := f.box(t, first.box.WorkspaceID)
	require.Equal(t, first.box.VMID, box.VmID, "the release never reached the guest")
	require.Equal(t, first.box.VMID, box.AgentBoxDirtyVmID, "and left the dirty mark as it was")
	require.False(t, db.IsAgentBoxLease(box.ProvisioningStage), "the release ended its lease")

	f.boxes.runtimeIdentity = nil
	second, err := f.turn(f.alice, first.session)
	require.NoError(t, err)
	f.requireFreshGuest(t, first, second)
}

// A box whose recorded head is not published yet is not retired: that would
// lose the last turn's work. The turn is refused, retryably, with the guest
// left as it is but its credentials revoked; once the head publishes the
// turn gets a new guest built from it.
func TestAgentBoxUnverifiedHeadRefusesTheTurnRetryably(t *testing.T) {
	f := newSessionBoxes(t)
	first := f.firstTurn(t)
	_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET head_commit_id=$2 WHERE id=$1`, first.box.WorkspaceID, idleCapTestHead)
	require.NoError(t, err)

	_, err = f.turn(f.alice, first.session)

	require.ErrorIs(t, err, errAgentBoxHeadUnverified)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeServiceUnavailable, api.Code, "a retry can succeed")
	require.Equal(t, 1, f.runtime.creates, "no new guest")
	require.Empty(t, f.runtime.deleted, "and the guest holding the unpublished work is kept")
	require.False(t, f.tokenLive(t, first.head), "its head token is revoked all the same")
	box := f.box(t, first.box.WorkspaceID)
	require.Equal(t, first.box.VMID, box.AgentBoxDirtyVmID, "still dirty")
	require.False(t, db.IsAgentBoxLease(box.ProvisioningStage))

	f.boxes.branchHeads = publishedHeads{heads: map[string]string{first.box.WorkspaceID: idleCapTestHead}}
	f.runtime.head = idleCapTestHead
	second, err := f.turn(f.alice, first.session)
	require.NoError(t, err)
	f.requireFreshGuest(t, first, second)
	require.Equal(t, idleCapTestHead, f.box(t, second.WorkspaceID).HeadCommitID, "the new guest starts from the recorded head")
}

// A session's box whose provision failed is retained no longer: the session's
// next turn retires it and builds a fresh guest, and any credential left on
// the failed row is revoked. The branch's own machine keeps its retain rule
// (TestBranchMachineProvisioningPaths).
func TestAgentSessionBoxFailedProvisionRetriesOnFreshGuest(t *testing.T) {
	f := newSessionBoxes(t)
	session := f.session(t, f.alice)
	f.runtime.failCheckouts = 1

	_, err := f.turn(f.alice, session)

	require.Error(t, err, "the first provision fails")
	failed, err := f.q.GetAgentSessionBox(f.ctx, session)
	require.NoError(t, err)
	require.Equal(t, "failed", failed.Status)
	left, err := issueTemporaryRepoTokenWithTTL(f.ctx, f.q, f.machines, "sandbox-workspace-"+failed.ID,
		workspaceHeadTokenScopes(f.repo, failed.ID), time.Hour)
	require.NoError(t, err)
	_, err = f.pool.Exec(f.ctx, `UPDATE workspaces SET head_push_token_id=$2 WHERE id=$1`, failed.ID, left.ID)
	require.NoError(t, err)

	second, err := f.turn(f.alice, session)

	require.NoError(t, err, "the next turn in the same session succeeds")
	require.Equal(t, failed.ID, second.WorkspaceID, "on the session's own box row")
	require.NotEmpty(t, second.VMID)
	require.NotEqual(t, failed.VmID, second.VMID, "with a fresh guest")
	box := f.box(t, second.WorkspaceID)
	require.Equal(t, "running", box.Status)
	require.False(t, f.tokenLive(t, left.ID), "the failed row's token is revoked")
	require.True(t, box.HeadPushTokenID.Valid)
	require.NotEqual(t, left.ID, box.HeadPushTokenID.Int64)
}

// Guardian b-k7umb5: the join's retirement holds no pool transaction across a
// runtime call or a nested query, so two joins retiring dirty boxes on a
// one-connection pool both finish within their deadline, or fail saying why.
func TestAgentBoxDirtyJoinsOnAOneConnectionPool(t *testing.T) {
	f := newSessionBoxes(t)
	first, second := f.firstTurn(t), f.firstTurn(t)
	cfg := f.pool.Config().Copy()
	cfg.MaxConns, cfg.MinConns = 1, 0
	single, err := pgxpool.NewWithConfig(f.ctx, cfg)
	require.NoError(t, err)
	t.Cleanup(single.Close)
	boxes := newWorkspaceServiceForTests(hostedProductStore{Product: productstore.New(single)},
		WithWorkspaceRuntime(f.runtime), WithWorkspaceTransactions(single), WithBranchMachineProviders(branchMachineTestProviders()))
	boxes.gitBaseURL = testWorkspaceGitBaseURL

	const deadline = 30 * time.Second
	ctx, cancel := context.WithTimeout(f.ctx, deadline)
	defer cancel()
	started := time.Now()
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i, turn := range []dirtyTurn{first, second} {
		wg.Add(1)
		go func(i int, turn dirtyTurn) {
			defer wg.Done()
			errs[i] = boxes.retireAgentSessionBoxForTurn(ctx, turn.session)
		}(i, turn)
	}
	wg.Wait()
	require.Less(t, time.Since(started), deadline+5*time.Second, "both joins finished within their deadline")
	for i, err := range errs {
		if err == nil {
			continue
		}
		var api *pkgerrors.APIError
		require.True(t, errors.As(err, &api) || errors.Is(err, context.DeadlineExceeded), "join %d fails saying why: %v", i, err)
	}
	require.NoError(t, errors.Join(errs...), "a pool of one connection is enough to retire both")
	for _, turn := range []dirtyTurn{first, second} {
		require.Contains(t, f.runtime.deleted, turn.box.VMID, "the dirty guest is retired")
		require.False(t, f.tokenLive(t, turn.head), "and its head token revoked")
	}
}

// A runtime that cannot confirm a run's processes ended never has its box
// reused, and the reader a run left goes with its guest (plue#866).
func TestABoxWhoseRunProcessesCannotBeReapedIsRetiredBeforeTheNextTurn(t *testing.T) {
	for _, name := range []string{"no reaper", "a reaper"} {
		t.Run(name, func(t *testing.T) {
			f := newAgentBoxReleaseWith(t, "running", name == "a reaper")
			f.publishHead(t)
			f.hosted.processes["reader"] = true

			f.finish(t)

			require.Equal(t, int32(1), f.runtime.deletes.Load(), "the box is not reused")
			require.False(t, f.hosted.processes["reader"], "the reader went with the box")
			if f.reaper != nil {
				require.Zero(t, f.reaper.reaped, "no reap decides a box's fate")
			}
			box := f.box(t)
			require.Equal(t, "suspended", box.Status)
			require.Equal(t, db.AgentBoxRetiredStage, box.ProvisioningStage)
			require.Contains(t, f.releaseLog(t), "outcome=retired")

			require.NoError(t, f.nextTurn(t), "turn 2 gets a new box, never a refusal")
			require.Equal(t, 1, f.hosted.creates)
			require.True(t, f.hosted.processes["relay"])
			require.True(t, f.hosted.processes["supervisor"])
			require.True(t, f.box(t).HeadPushTokenID.Valid)
			require.Empty(t, f.hosted.captured, "the reader captured nothing")
		})
	}
}

// A failed idle retirement never makes a box clean (Security d-6g6nq7
// finding 3): whatever stage the idle path restores when its lease ends, the
// guest stays marked dirty, and the box's next turn retires it and gets a new
// guest.
func TestAFailedIdleRetirementKeepsTheGuestDirtyUntilTheNextTurnReplacesIt(t *testing.T) {
	for _, tc := range []struct {
		name  string
		fault func(f *agentBoxRelease) (clear func())
	}{
		{name: "a runtime context failure", fault: func(f *agentBoxRelease) func() {
			f.boxes.runtimeIdentity = func(context.Context, db.Workspace, int64) (workspaceapi.Operation, error) {
				return workspaceapi.Operation{}, errors.New("runtime identity unavailable")
			}
			return func() { f.boxes.runtimeIdentity = nil }
		}},
		{name: "a credential revocation failure", fault: func(f *agentBoxRelease) func() {
			// The guest's git credential cache socket is open and will not end.
			f.hosted.credentialCache, f.hosted.credentialCacheStuck = true, true
			return func() { f.hosted.credentialCacheStuck = false }
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := idleBox(t, true)
			// A real idle box is dirty: its turn's head token marked its guest.
			_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET agent_box_dirty_vm_id = vm_id WHERE id = $1`, f.workspace)
			require.NoError(t, err)
			// Its last run left a credential reader behind.
			f.hosted.processes["reader"] = true
			clear := tc.fault(f)
			store, ok := f.boxes.q.(agentBoxIdleCapStore)
			require.True(t, ok)

			require.Error(t, f.boxes.retireIdleAgentBox(f.ctx, store, f.workspace, int64(f.boxes.agentBoxIdleCap/time.Second)))
			f.requireDirty(t, "a failed idle retirement leaves the guest dirty")
			require.Zero(t, f.runtime.deletes.Load(), "nothing was retired")

			// The whole sweep fails the same way and still leaves it dirty.
			require.Error(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
			f.requireDirty(t, "a failed sweep leaves the guest dirty")

			require.True(t, f.hosted.processes["reader"], "the failed retirement left the guest as it was")

			clear()
			require.NoError(t, f.nextTurn(t))
			// A new guest, the reader gone with the old one and nothing
			// captured, and every token of the old run revoked.
			f.requireRetiredAndRebuilt(t)
			f.requireRunTokensRevoked(t, "head", "landing", "cache", "api")
		})
	}
}

// A takeover of a lease a dead release left never clears the dirty mark
// (Security d-6g6nq7 finding 1): the box stays dirty after the takeover ends
// and the next turn still gets a new guest.
func TestAgentBoxLeaseTakeoverKeepsTheDirtyMark(t *testing.T) {
	f := newSessionBoxes(t)
	first := f.firstTurn(t)
	_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET provisioning_stage = $2 || (floor(extract(epoch FROM now()))::bigint - $3::bigint)::text || ':dead' WHERE id = $1`,
		first.box.WorkspaceID, db.AgentBoxLeasePrefix, 2*db.AgentBoxLeaseSeconds)
	require.NoError(t, err)

	takeover, err := f.q.ClaimAgentBoxRelease(f.ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: first.box.WorkspaceID, AnyStatus: true})
	require.NoError(t, err)
	require.NotEmpty(t, takeover.Lease, "the dead release's lease is taken over")
	require.Equal(t, first.box.VMID, f.box(t, first.box.WorkspaceID).AgentBoxDirtyVmID, "the takeover keeps the mark")
	require.NoError(t, f.q.EndAgentBoxLease(f.ctx, first.box.WorkspaceID, takeover.Lease, ""))
	box := f.box(t, first.box.WorkspaceID)
	require.Equal(t, first.box.VMID, box.AgentBoxDirtyVmID, "and so does ending it")
	require.Empty(t, box.ProvisioningStage, "the mark is not the stage")

	second, err := f.turn(f.alice, first.session)
	require.NoError(t, err)
	f.requireFreshGuest(t, first, second)
}

// A turn's retirement of its dirty box is bounded like the join's admission
// (Security G4 finding 5): with context.Background() and a pool whose only
// connection is held, it fails typed within agentBoxJoinWait instead of
// waiting forever.
func TestATurnsRetirementIsBoundedOnAnExhaustedPool(t *testing.T) {
	saved := agentBoxJoinWait
	agentBoxJoinWait = time.Second
	t.Cleanup(func() { agentBoxJoinWait = saved })
	f := newAgentBoxRelease(t, "running")
	svc, small := f.smallPoolService(t, 1)
	held, err := small.Acquire(f.ctx)
	require.NoError(t, err)
	defer held.Release()

	start := time.Now()
	err = svc.retireAgentSessionBoxForTurn(context.Background(), f.session)

	require.Less(t, time.Since(start), 5*time.Second, "bounded by agentBoxJoinWait")
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, 503, api.Status, "refused retryably")
	require.ErrorIs(t, api.Cause(), context.DeadlineExceeded)
}
