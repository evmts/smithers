package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/productstore"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A RELEASE ON ONE REPLICA NEVER TEARS DOWN A TURN ANOTHER REPLICA ADMITTED
// (guardian-review s-m0pyar, f-fg7apu; Security s-0aiuc0). Each API replica
// serializes a box's lifecycle with its own in-process lock only, so replica
// A's release could read that nothing uses the box, replica B could admit a
// new turn and mint its credentials, and A would then revoke B's head token,
// stop B's coding host and delete B's guest. A finished run's finalizer can
// also run late (it snapshots for up to two minutes first), after the same
// session's next turn started.
//
// Two WorkspaceServices share one PostgreSQL database and one hosted runtime,
// each with its own in-process locks, as two replicas do. Replica A is paused
// at a point of its release while replica B admits a turn and starts its
// coding host.

const replicaBHost = "coding-host-b"

// replicaB is a second API replica over the same database and runtime.
func (f *agentBoxRelease) replicaB(t *testing.T) *WorkspaceService {
	t.Helper()
	b := newWorkspaceServiceForTests(hostedProductStore{Product: productstore.New(f.pool)},
		WithWorkspaceRuntime(f.boxes.runtime), WithWorkspaceTransactions(f.pool), WithWorkspaceSandboxMetrics(newCorePoolDutyRecorder()))
	b.gitBaseURL = f.boxes.gitBaseURL
	b.branchMachineProviders = f.boxes.branchMachineProviders
	b.branchHeads = f.boxes.branchHeads
	b.agentBoxIdleCap = f.boxes.agentBoxIdleCap
	require.NotSame(t, f.boxes.runtimeLocks, b.runtimeLocks, "replicas share no in-process lock")
	return b
}

// pause stops replica A at one point of its next release until resumed.
type pause struct {
	reached chan struct{}
	resume  chan struct{}
	once    sync.Once
}

func (f *agentBoxRelease) pauseAt(point string) *pause {
	p := &pause{reached: make(chan struct{}), resume: make(chan struct{})}
	f.boxes.agentBoxReleaseHook = func(at, workspaceID string) {
		if at != point || workspaceID != f.workspace {
			return
		}
		p.once.Do(func() {
			close(p.reached)
			<-p.resume
		})
	}
	return p
}

// turnResult is what replica B's turn got: its run and its host's landing
// token, or the error that refused it.
type turnResult struct {
	run, landing int64
	err          error
}

// race pauses replica A's release at point, runs whilePaused (when given),
// runs a new turn in sessionID on replica B while A is paused, then resumes A
// and waits for both.
func (f *agentBoxRelease) race(t *testing.T, b *WorkspaceService, sessionID, point string, release func() error, whilePaused func()) turnResult {
	t.Helper()
	paused := f.pauseAt(point)
	released := make(chan error, 1)
	go func() { released <- release() }()
	select {
	case <-paused.reached:
	case err := <-released:
		t.Fatalf("replica A's release never reached %s: %v", point, err)
	case <-time.After(time.Minute):
		t.Fatalf("replica A's release never reached %s", point)
	}
	if whilePaused != nil {
		whilePaused()
	}
	admitted := make(chan turnResult, 1)
	go func() {
		run, landing, err := f.turnOnB(b, sessionID)
		admitted <- turnResult{run, landing, err}
	}()
	// Give replica B every chance to act while replica A is paused.
	select {
	case got := <-admitted:
		t.Logf("replica B's turn finished while replica A was paused at %s", point)
		admitted <- got
	case <-time.After(3 * time.Second):
		t.Logf("replica B's turn waited while replica A was paused at %s", point)
	}
	close(paused.resume)
	select {
	case err := <-released:
		require.NoError(t, err, "replica A's release")
	case <-time.After(time.Minute):
		t.Fatal("replica A's release never finished")
	}
	select {
	case got := <-admitted:
		return got
	case <-time.After(2 * time.Minute):
		t.Fatal("replica B's turn never finished")
		return turnResult{}
	}
}

// turnOnB is a new turn in sessionID admitted through replica B: the dispatch
// claims the session for a new run, joins the branch's box, and the turn's
// flow host resolver starts its coding host with a fresh landing credential.
// It answers the new run and the host's landing token.
func (f *agentBoxRelease) turnOnB(b *WorkspaceService, sessionID string) (run int64, landing int64, err error) {
	ctx := f.ctx
	box, err := f.q.GetWorkspace(ctx, f.workspace)
	if err != nil {
		return 0, 0, err
	}
	definition, err := f.q.UpsertAgentWorkflowDefinition(ctx, box.RepositoryID)
	if err != nil {
		return 0, 0, err
	}
	created, err := f.q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: box.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "queued",
		TriggerEvent: "agent_message", DispatchInputs: json.RawMessage(`{}`), ExecutionPlane: "agent"})
	if err != nil {
		return 0, 0, err
	}
	claimed, err := f.q.ClaimAgentSessionForDispatch(ctx, sessionID, created.ID)
	if err != nil || !claimed {
		return created.ID, 0, fmt.Errorf("claim session for the new turn: claimed=%v: %w", claimed, err)
	}
	slug, err := f.q.GetRepoOwnerSlugAndNameByID(ctx, box.RepositoryID)
	if err != nil {
		return created.ID, 0, err
	}
	joined, err := b.CreateAgentWorkspace(ctx, CreateAgentWorkspaceInput{RepositoryID: box.RepositoryID, UserID: f.person,
		SessionID: sessionID, RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName})
	if err != nil {
		return created.ID, 0, fmt.Errorf("join the box: %w", err)
	}
	if joined.WorkspaceID != f.workspace {
		return created.ID, 0, fmt.Errorf("joined %s, not the branch's box %s", joined.WorkspaceID, f.workspace)
	}
	// The resolver starts the host on the box's one coding binding at a new
	// owner generation, retiring the previous start's credentials first.
	var binding string
	if err := f.pool.QueryRow(ctx, `UPDATE flow_runtime_host_bindings
		SET owner_generation = owner_generation + 1, service_name = $2, state = 'running', last_error_code = '', updated_at = NOW()
		WHERE workspace_id = $1 AND catalog_key = 'coding' RETURNING id::text`, f.workspace, replicaBHost).Scan(&binding); err != nil {
		return created.ID, 0, err
	}
	b.RetireBoxHostCredential(ctx, binding, f.person)
	if _, err := f.hosted.StartService(ctx, f.workspace, workspaceapi.ServiceSpec{Name: replicaBHost}); err != nil {
		return created.ID, 0, err
	}
	f.hosted.processes[replicaBHost] = true
	token, err := issueTemporaryRepoTokenWithTTL(ctx, f.q, f.person, boxHostLandingTokenName(binding), "read:repository", time.Hour)
	if err != nil {
		return created.ID, 0, err
	}
	return created.ID, token.ID, nil
}

// requireTurnSurvived checks that replica B's turn kept everything it was
// given: its guest and disk, its coding host and that host's credential, its
// head token, and its session's hold on the box. The only live head token is
// the one the box names: nothing minted for the box is left live and
// unreferenced.
func (f *agentBoxRelease) requireTurnSurvived(t *testing.T, sessionID string, run, landing int64) {
	t.Helper()
	box := f.box(t)
	require.Equal(t, "running", box.Status, "the new turn's box is running")
	require.NotEmpty(t, box.VmID, "it has a guest")
	require.False(t, f.hosted.deleted, "the new turn's guest and disk were not deleted")
	require.True(t, f.hosted.processes[replicaBHost], "the new turn's coding host was not reaped")
	require.NotContains(t, f.hosted.stopped, replicaBHost, "nor stopped")
	var live bool
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT EXISTS (SELECT 1 FROM access_tokens WHERE id=$1)`, landing).Scan(&live))
	require.True(t, live, "the new turn's host credential is live")

	require.True(t, box.HeadPushTokenID.Valid, "the box names the new turn's head token")
	var heads []int64
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT COALESCE(array_agg(id ORDER BY id), '{}') FROM access_tokens WHERE name = $1`,
		"sandbox-workspace-"+f.workspace).Scan(&heads))
	require.Equal(t, []int64{box.HeadPushTokenID.Int64}, heads, "the only live head token is the one the box names")
	require.False(t, f.tokenLive(t, "head"), "the finished run's head token is dead")
	require.False(t, f.tokenLive(t, "cache"), "and its host's cache token")

	session, err := f.q.GetAgentSession(f.ctx, sessionID)
	require.NoError(t, err)
	require.Equal(t, f.workspace, UUIDString(session.WorkspaceID), "the new turn's session holds the box")
	require.Equal(t, run, session.WorkflowRunID.Int64)
	require.Equal(t, "active", session.Status)
}

func TestAReleaseNeverTearsDownATurnAnotherReplicaAdmitted(t *testing.T) {
	finalize := func(f *agentBoxRelease) func() error {
		return func() error { return f.agent.ProjectFlowRuntime(f.ctx, f.update) }
	}

	// The finished run's finalizer is late (it snapshots first). The same
	// session's next turn, a different run, starts on replica B before the
	// finalizer reads what uses the box; the late release must back off.
	t.Run("a late finalizer backs off from the same session's next turn", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		b := f.replicaB(t)

		got := f.race(t, b, f.session, agentBoxBeforeClaim, finalize(f), nil)

		require.NoError(t, got.err, "the same session's next turn is admitted")
		require.NotEqual(t, f.run, got.run)
		require.Contains(t, f.releaseLog(t), "outcome=kept_in_use", "the late release backs off")
		f.requireTurnSurvived(t, f.session, got.run, got.landing)
	})

	// Replica A has read that nothing uses the box when replica B's turn
	// arrives: B's turn waits for A's release, then gets the box afresh.
	for _, tc := range []struct {
		name    string
		reaper  bool
		outcome string
	}{
		{name: "a turn arriving during a quiesce waits for it", reaper: true, outcome: "outcome=quiesced"},
		{name: "a turn arriving during a retirement after an unconfirmed reap waits and rebuilds", outcome: "outcome=retired"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newAgentBoxReleaseWith(t, "running", tc.reaper)
			if !tc.reaper {
				_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET head_commit_id=$2 WHERE id=$1`, f.workspace, idleCapTestHead)
				require.NoError(t, err)
				f.boxes.branchHeads = publishedHeads{heads: map[string]string{f.workspace: idleCapTestHead}}
				f.hosted.head = idleCapTestHead
			}
			b := f.replicaB(t)
			session, err := f.agent.CreateSession(f.ctx, CreateAgentSessionInput{RepositoryID: f.box(t).RepositoryID, UserID: f.person, Title: "replica b"})
			require.NoError(t, err)

			got := f.race(t, b, session.ID, agentBoxAfterEmptyUse, finalize(f), nil)

			require.NoError(t, got.err, "replica B's turn gets a working box, never a refusal")
			require.Contains(t, f.releaseLog(t), tc.outcome)
			f.requireTurnSurvived(t, session.ID, got.run, got.landing)
		})
	}

	// Replica A renews its lease, then stalls before a runtime call until the
	// lease lapses. Replica B takes the box over, retires its guest, builds a
	// new one under the same workspace id and mints its turn's credentials.
	// When A resumes, its call names a guest that is gone and reaches nothing
	// of B's (guardian-review f-o2p2xb).
	for _, tc := range []struct {
		name   string
		reaper bool
		point  string
	}{
		{name: "a release whose lease lapsed between its renewal and its host stop", reaper: true, point: agentBoxBeforeStop},
		{name: "a retirement whose lease lapsed between its renewal and its delete", point: agentBoxBeforeDelete},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newAgentBoxReleaseWith(t, "running", tc.reaper)
			f.publishHead(t)
			b := f.replicaB(t)
			session, err := f.agent.CreateSession(f.ctx, CreateAgentSessionInput{RepositoryID: f.box(t).RepositoryID, UserID: f.person, Title: "replica b"})
			require.NoError(t, err)
			lapse := func() {
				tag, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET provisioning_stage = $2 || (floor(extract(epoch FROM now()))::bigint - $3::bigint)::text || ':' || split_part(provisioning_stage, ':', 3)
					WHERE id = $1 AND provisioning_stage LIKE $2 || '%'`, f.workspace, db.AgentBoxLeasePrefix, 2*db.AgentBoxLeaseSeconds)
				require.NoError(t, err)
				require.EqualValues(t, 1, tag.RowsAffected(), "replica A holds the box when its lease lapses")
			}

			got := f.race(t, b, session.ID, tc.point, finalize(f), lapse)

			require.NoError(t, got.err, "replica B's turn gets a working box, never a refusal")
			require.Contains(t, f.releaseLog(t), "another replica took the box over", "replica A backs off")
			require.Equal(t, int32(1), f.runtime.deletes.Load(), "only replica B deleted the old guest")
			require.Equal(t, 1, f.hosted.creates)
			f.requireTurnSurvived(t, session.ID, got.run, got.landing)
		})
	}

	// The idle cap's sweep has read that nothing uses an idle box when a new
	// turn arrives on replica B.
	t.Run("a turn arriving during an idle cap retirement waits and rebuilds", func(t *testing.T) {
		f := idleBox(t, true)
		b := f.replicaB(t)
		session, err := f.agent.CreateSession(f.ctx, CreateAgentSessionInput{RepositoryID: f.box(t).RepositoryID, UserID: f.person, Title: "replica b"})
		require.NoError(t, err)

		got := f.race(t, b, session.ID, agentBoxAfterEmptyUse, func() error { return f.boxes.RetireIdleAgentBoxes(context.Background()) }, nil)

		require.NoError(t, got.err, "replica B's turn gets a working box, never a refusal")
		require.Contains(t, f.logs.String(), `msg="agent box retired after its idle cap"`)
		f.requireTurnSurvived(t, session.ID, got.run, got.landing)
	})
}

// publishHead records the box's head and publishes it, so the box can be
// retired and rebuilt from it.
func (f *agentBoxRelease) publishHead(t *testing.T) {
	t.Helper()
	_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET head_commit_id=$2 WHERE id=$1`, f.workspace, idleCapTestHead)
	require.NoError(t, err)
	f.boxes.branchHeads = publishedHeads{heads: map[string]string{f.workspace: idleCapTestHead}}
	f.hosted.head = idleCapTestHead
}

// requireRetiredAndRebuilt checks that the turn got a new guest from the
// recorded head instead of the box of unknown state, and that a process the
// last run left saw no credential.
func (f *agentBoxRelease) requireRetiredAndRebuilt(t *testing.T) {
	t.Helper()
	require.Equal(t, int32(1), f.runtime.deletes.Load(), "the box of unknown state is retired, not reused")
	require.Equal(t, 1, f.hosted.creates, "the turn gets a new guest")
	require.False(t, f.hosted.processes["reader"], "a process the last run left went with the box")
	require.Empty(t, f.hosted.captured, "it captured nothing")
	box := f.box(t)
	require.Equal(t, "running", box.Status)
	require.NotEqual(t, db.AgentBoxUnreapedStage, box.ProvisioningStage, "the new guest is clean")
	require.False(t, db.IsAgentBoxLease(box.ProvisioningStage), "and no release holds it")
	require.True(t, box.HeadPushTokenID.Valid, "the new guest publishes with a fresh head token")
}

// A join waits while a live release holds the box and refuses, retryably,
// once its wait is spent. A lease older than db.AgentBoxLeaseSeconds belongs
// to a release that died. It proves nothing about what that release finished,
// so the join retires the box and the turn gets a new guest: a box of unknown
// state is never reused.
func TestAJoinWaitsForALiveReleaseAndRetiresTheBoxOfADeadOne(t *testing.T) {
	waited, poll := agentBoxJoinWait, agentBoxJoinPoll
	agentBoxJoinWait, agentBoxJoinPoll = time.Second, 50*time.Millisecond
	t.Cleanup(func() { agentBoxJoinWait, agentBoxJoinPoll = waited, poll })

	t.Run("a live release", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		f.finish(t)
		claim, err := f.q.ClaimAgentBoxRelease(f.ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: f.workspace, CheckUse: true})
		require.NoError(t, err)
		require.NotEmpty(t, claim.Lease, "nothing uses the finished box")

		err = f.nextTurn(t)
		require.Error(t, err)
		require.Contains(t, err.Error(), "still being released")
		require.False(t, f.box(t).HeadPushTokenID.Valid, "the waiting join minted nothing")

		require.NoError(t, f.q.EndAgentBoxLease(f.ctx, f.workspace, claim.Lease, ""))
		_, err = f.pool.Exec(f.ctx, `UPDATE workflow_runs SET status='failure' WHERE repository_id=$1 AND status IN ('queued','running')`, f.box(t).RepositoryID)
		require.NoError(t, err)
		require.NoError(t, f.nextTurn(t), "the turn joins once the release ends")
		require.True(t, f.box(t).HeadPushTokenID.Valid)
		require.Zero(t, f.runtime.deletes.Load(), "a release that ended cleanly leaves its box to reuse")
	})

	for _, tc := range []struct {
		name   string
		reaped bool
	}{
		{name: "a release that died after its reap", reaped: true},
		{name: "a release that died before its reap", reaped: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newAgentBoxRelease(t, "running")
			f.publishHead(t)
			if tc.reaped {
				f.finish(t)
			} else {
				// The run ended, its release took the lease and died: no
				// reap, and the run's reader still runs.
				_, err := f.pool.Exec(f.ctx, `UPDATE workflow_runs SET status='failure' WHERE id=$1`, f.run)
				require.NoError(t, err)
				_, err = f.pool.Exec(f.ctx, `UPDATE agent_sessions SET status='failed', finished_at=NOW() WHERE id=$1`, f.session)
				require.NoError(t, err)
				f.hosted.processes["reader"] = true
			}
			dead := fmt.Sprintf("%s%d:dead", db.AgentBoxLeasePrefix, time.Now().Add(-2*db.AgentBoxLeaseSeconds*time.Second).Unix())
			_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET provisioning_stage=$2 WHERE id=$1`, f.workspace, dead)
			require.NoError(t, err)

			require.NoError(t, f.nextTurn(t), "the turn gets a working box, never a refusal")
			require.Contains(t, f.logs.String(), "lease of a release that died was ended")
			f.requireRetiredAndRebuilt(t)
		})
	}
}

// A release that fails after it took the box's lease and before a confirmed
// reap leaves the box unreaped, never clean: its next turn retires it.
func TestAReleaseThatFailsBeforeItsReapLeavesTheBoxToBeRetired(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	f.publishHead(t)
	f.hosted.processes["reader"] = true
	f.boxes.runtimeIdentity = func(context.Context, db.Workspace, int64) (workspaceapi.Operation, error) {
		return workspaceapi.Operation{}, errors.New("runtime identity unavailable")
	}

	f.finish(t)

	require.Contains(t, f.releaseLog(t), "outcome=release_failed")
	require.Zero(t, f.reaper.reaped, "the release failed before its reap")
	box := f.box(t)
	require.Equal(t, db.AgentBoxUnreapedStage, box.ProvisioningStage, "the box's state is unknown, not clean")
	require.False(t, box.HeadPushTokenID.Valid, "the run's head token is revoked all the same")

	f.boxes.runtimeIdentity = nil
	require.NoError(t, f.nextTurn(t), "the turn gets a working box, never a refusal")
	f.requireRetiredAndRebuilt(t)
}

// A retirement is recorded only while its release holds the box and the box
// names no head token: a token named since belongs to a turn, and nulling it
// would leave it live and unreferenced (Security s-0aiuc0).
func TestRetiringABoxNeverLeavesAHeadTokenLive(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	claim, err := f.q.ClaimAgentBoxRelease(f.ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: f.workspace})
	require.NoError(t, err)
	require.True(t, f.box(t).HeadPushTokenID.Valid, "the box names a live head token")

	renewed, err := f.q.RenewAgentBoxLease(f.ctx, f.workspace, claim.Lease, claim.VmID, true)
	require.NoError(t, err)
	require.Empty(t, renewed, "no guest is deleted while the box names a head token")
	retired, err := f.q.RetireAgentBox(f.ctx, f.workspace, claim.Lease)
	require.NoError(t, err)
	require.False(t, retired)
	box := f.box(t)
	require.Equal(t, "running", box.Status)
	require.Equal(t, f.tokens["head"], box.HeadPushTokenID.Int64, "the token stays named")
	require.True(t, f.tokenLive(t, "head"))

	require.NoError(t, f.q.SetWorkspaceHeadPushTokenID(f.ctx, db.SetWorkspaceHeadPushTokenIDParams{ID: f.workspace}))
	retired, err = f.q.RetireAgentBox(f.ctx, f.workspace, "agent_box_releasing:0:another")
	require.NoError(t, err)
	require.False(t, retired, "a release that lost the box records nothing")
	retired, err = f.q.RetireAgentBox(f.ctx, f.workspace, claim.Lease)
	require.NoError(t, err)
	require.True(t, retired)
}

// lockedReaper serializes the hosted double for concurrent releases.
type lockedReaper struct {
	*reapingBoxRuntime
	mu sync.Mutex
}

func (r *lockedReaper) StopService(ctx context.Context, id, name string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.reapingBoxRuntime.StopService(ctx, id, name)
}

func (r *lockedReaper) ReapRunProcesses(ctx context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.reapingBoxRuntime.ReapRunProcesses(ctx, id)
}

// addBox adds another running agent box on its own branch of the box's
// repository, with its own guest and head token.
func (f *agentBoxRelease) addBox(t *testing.T, i int) string {
	t.Helper()
	id := uuid.NewString()
	repo := f.box(t).RepositoryID
	_, err := f.pool.Exec(f.ctx, `INSERT INTO workspaces
		(id, repository_id, user_id, name, kind, vm_id, provisioning_generation, status, provisioning_stage, target_bookmark)
		VALUES ($1,$2,$3,$4,'container',$5,3,'running','',$6)`,
		id, repo, f.machines, "agent-box-"+id[:8], fmt.Sprintf("vm-agent-box-%d", i), fmt.Sprintf("branch-%d", i))
	require.NoError(t, err)
	head, err := issueTemporaryRepoTokenWithTTL(f.ctx, f.q, f.machines, "sandbox-workspace-"+id, workspaceHeadTokenScopes(repo, id), workspaceHeadTokenTTL)
	require.NoError(t, err)
	require.NoError(t, f.q.SetWorkspaceHeadPushTokenID(f.ctx, db.SetWorkspaceHeadPushTokenIDParams{ID: id, HeadPushTokenID: pgtype.Int8{Int64: head.ID, Valid: true}}))
	return id
}

// RELEASES PROGRESS ON A SMALL POOL (guardian-review b-k7umb5, plue#839). A
// release never holds a pooled connection while it waits for another, so one
// release on a pool of one connection, and more concurrent releases than the
// pool has connections, all finish within their deadline. None hangs.
func TestAgentBoxReleasesProgressOnASmallPool(t *testing.T) {
	for _, tc := range []struct {
		name  string
		conns int32
		boxes int
	}{
		{name: "one release on one connection", conns: 1, boxes: 1},
		{name: "three concurrent releases on two connections", conns: 2, boxes: 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newAgentBoxRelease(t, "running")
			cfg := f.pool.Config().Copy()
			cfg.MaxConns, cfg.MinConns = tc.conns, 0
			small, err := pgxpool.NewWithConfig(f.ctx, cfg)
			require.NoError(t, err)
			t.Cleanup(small.Close)
			svc := newWorkspaceServiceForTests(hostedProductStore{Product: productstore.New(small)},
				WithWorkspaceRuntime(&lockedReaper{reapingBoxRuntime: f.reaper}), WithWorkspaceTransactions(small),
				WithWorkspaceSandboxMetrics(newCorePoolDutyRecorder()))
			svc.gitBaseURL = f.boxes.gitBaseURL
			svc.branchMachineProviders = f.boxes.branchMachineProviders
			boxes := []string{f.workspace}
			for i := 1; i < tc.boxes; i++ {
				boxes = append(boxes, f.addBox(t, i))
			}

			ctx, cancel := context.WithTimeout(f.ctx, 30*time.Second)
			defer cancel()
			type result struct {
				id      string
				release AgentWorkspaceRelease
				err     error
			}
			results := make(chan result, len(boxes))
			for _, id := range boxes {
				go func(id string) {
					session, run := "", int64(0)
					if id == f.workspace {
						session, run = f.session, f.run
					}
					release, err := svc.ReleaseAgentWorkspace(ctx, id, session, run)
					results <- result{id, release, err}
				}(id)
			}
			for range boxes {
				select {
				case got := <-results:
					require.NoError(t, got.err, "release of %s", got.id)
					require.Equal(t, agentWorkspaceQuiesced, got.release.Outcome, "release of %s: %s", got.id, got.release.Detail)
				case <-time.After(45 * time.Second):
					t.Fatalf("a release hung on a pool of %d connections", tc.conns)
				}
			}
			for _, id := range boxes {
				var heads int
				require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT count(*) FROM access_tokens WHERE name = $1`, "sandbox-workspace-"+id).Scan(&heads))
				require.Zero(t, heads, "box %s holds no live head token", id)
			}
		})
	}
}
