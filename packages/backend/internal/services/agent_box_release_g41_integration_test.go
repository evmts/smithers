package services

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/productstore"
)

// SECURITY G4 FINDINGS 2, 4 AND 5 (d-6g6nq7). A release of a box that is not
// running revokes every credential class under the run fence; no join holds
// its authorization transaction while it acquires another connection; and a
// release, a join's admission and the cleanup sweep each set a real deadline
// before their first pool acquisition.

// mintChildrenToken gives the box its children credential.
func (f *agentBoxRelease) mintChildrenToken(t *testing.T) int64 {
	t.Helper()
	token, err := issueTemporaryRepoTokenWithTTL(f.ctx, f.q, f.machines, workspaceChildrenTokenName(f.workspace), "read:repository", time.Hour)
	require.NoError(t, err)
	return token.ID
}

func (f *agentBoxRelease) tokenIDLive(t *testing.T, id int64) bool {
	t.Helper()
	var live bool
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT EXISTS (SELECT 1 FROM access_tokens WHERE id=$1)`, id).Scan(&live))
	return live
}

// requireEveryCredentialGone checks every credential class a box holds:
// head, children, landing, cache, and the coding host's control and model
// credentials through the real verifiers.
func (f *agentBoxRelease) requireEveryCredentialGone(t *testing.T, children int64, binding, control string) {
	t.Helper()
	require.False(t, f.box(t).HeadPushTokenID.Valid, "the box names no head token")
	require.False(t, f.tokenLive(t, "head"), "the head token is revoked")
	require.False(t, f.tokenIDLive(t, children), "the children credential is revoked")
	require.False(t, f.tokenLive(t, "landing"), "the landing token is revoked")
	require.False(t, f.tokenLive(t, "cache"), "the cache token is revoked")
	_, err := flowhost.VerifyHostCredential(f.ctx, f.pool, binding, control)
	require.ErrorIs(t, err, flowhost.ErrHostCredentialInvalid, "the control credential is refused")
	_, err = flowhost.VerifyModelCredential(f.ctx, f.pool, sealedCodec{}, flowhost.ModelCredential(binding, control))
	require.ErrorIs(t, err, flowhost.ErrModelCredentialInvalid, "the model credential is refused")
}

func TestAReleaseOfABoxThatIsNotRunningRevokesEveryCredentialClass(t *testing.T) {
	for _, status := range []string{"suspended", "stopped", "failed"} {
		t.Run(status, func(t *testing.T) {
			f := newAgentBoxRelease(t, status)
			binding, control := f.sealHostCredential(t)
			children := f.mintChildrenToken(t)
			_, err := flowhost.VerifyHostCredential(f.ctx, f.pool, binding, control)
			require.NoError(t, err, "a stopped box's control credential verifies before the release")
			_, err = flowhost.VerifyModelCredential(f.ctx, f.pool, sealedCodec{}, flowhost.ModelCredential(binding, control))
			require.NoError(t, err, "and its model credential")

			got, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, f.session, f.run)

			require.NoError(t, err)
			require.Equal(t, agentWorkspaceAlreadyReleased, got.Outcome)
			require.True(t, got.Quiesced)
			require.True(t, got.HeadTokenRevoked)
			f.requireEveryCredentialGone(t, children, binding, control)
		})
	}
}

// A late release of the run that stopped the box never touches what the same
// session's next run holds.
func TestALateReleaseOfAStoppedBoxNeverTouchesTheSameSessionsNextRun(t *testing.T) {
	f := newAgentBoxRelease(t, "suspended")
	_, err := f.pool.Exec(f.ctx, `UPDATE workflow_runs SET status='failure' WHERE id=$1`, f.run)
	require.NoError(t, err)
	box := f.box(t)
	definition, err := f.q.UpsertAgentWorkflowDefinition(f.ctx, box.RepositoryID)
	require.NoError(t, err)
	next, err := f.q.CreateWorkflowRun(f.ctx, db.CreateWorkflowRunParams{RepositoryID: box.RepositoryID, WorkflowDefinitionID: definition.ID,
		Status: "queued", TriggerEvent: "agent_message", DispatchInputs: []byte(`{}`), ExecutionPlane: "agent"})
	require.NoError(t, err)
	claimed, err := f.q.ClaimAgentSessionForDispatch(f.ctx, f.session, next.ID)
	require.NoError(t, err)
	require.True(t, claimed, "the same session's next run started")
	head, err := issueTemporaryRepoTokenWithTTL(f.ctx, f.q, f.machines, "sandbox-workspace-"+f.workspace, workspaceHeadTokenScopes(box.RepositoryID, f.workspace), time.Hour)
	require.NoError(t, err)
	require.NoError(t, f.q.SetWorkspaceHeadPushTokenID(f.ctx, db.SetWorkspaceHeadPushTokenIDParams{ID: f.workspace, HeadPushTokenID: pgtype.Int8{Int64: head.ID, Valid: true}}))
	binding, control := f.sealHostCredential(t)

	got, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, f.session, f.run)

	require.NoError(t, err)
	require.Equal(t, agentWorkspaceKeptInUse, got.Outcome, "the late release backs off")
	require.True(t, f.tokenIDLive(t, head.ID), "the next run's head token is live")
	require.True(t, f.tokenLive(t, "landing"), "its host's landing token is live")
	_, err = flowhost.VerifyHostCredential(f.ctx, f.pool, binding, control)
	require.NoError(t, err, "its control credential verifies")
	_, err = flowhost.VerifyModelCredential(f.ctx, f.pool, sealedCodec{}, flowhost.ModelCredential(binding, control))
	require.NoError(t, err, "and its model credential")
}

// A revocation that fails on a box that is not running is retried by the
// sweep until every credential is gone.
func TestAFailedRevocationOfAStoppedBoxIsRetriedByTheSweep(t *testing.T) {
	f := newAgentBoxRelease(t, "stopped")
	store := &faultyReleaseStore{hostedProductStore: hostedProductStore{Product: productstore.New(f.pool)},
		faults: map[string]string{"RevokeStoppedAgentBoxCredentials": "error"}}
	f.useStore(store)
	binding, control := f.sealHostCredential(t)
	children := f.mintChildrenToken(t)

	got, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, f.session, f.run)

	require.Error(t, err)
	require.Equal(t, agentWorkspaceReleaseFailed, got.Outcome)
	require.False(t, got.Quiesced)
	require.True(t, f.tokenLive(t, "landing"), "the failure leaves the credentials live")

	// The run is over; the sweep retries while the failure lasts, then
	// revokes everything.
	_, err = f.pool.Exec(f.ctx, `UPDATE agent_sessions SET status='completed', finished_at=NOW() WHERE id=$1`, f.session)
	require.NoError(t, err)
	require.Error(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
	require.True(t, f.tokenLive(t, "landing"))
	store.clear()
	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
	f.requireEveryCredentialGone(t, children, binding, control)
}

// smallPoolService is the box's service over a pool of conns connections.
func (f *agentBoxRelease) smallPoolService(t *testing.T, conns int32) (*WorkspaceService, *pgxpool.Pool) {
	t.Helper()
	cfg := f.pool.Config().Copy()
	cfg.MaxConns, cfg.MinConns = conns, 0
	small, err := pgxpool.NewWithConfig(f.ctx, cfg)
	require.NoError(t, err)
	t.Cleanup(small.Close)
	svc := newWorkspaceServiceForTests(hostedProductStore{Product: productstore.New(small)},
		WithWorkspaceRuntime(&lockedReaper{reapingBoxRuntime: f.reaper}), WithWorkspaceTransactions(small),
		WithWorkspaceSandboxMetrics(newCorePoolDutyRecorder()))
	svc.gitBaseURL = f.boxes.gitBaseURL
	svc.branchMachineProviders = f.boxes.branchMachineProviders
	return svc, small
}

// Concurrent releases (running and stopped boxes) and a join's admission on a
// pool of one connection all finish within their deadline: nothing holds the
// connection while it waits for another (Security G4 finding 4).
func TestReleasesAndAJoinsAdmissionProgressOnAOneConnectionPool(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	svc, _ := f.smallPoolService(t, 1)
	running := []string{f.addBox(t, 1), f.addBox(t, 2)}
	stopped := f.addBox(t, 3)
	_, err := f.pool.Exec(f.ctx, `UPDATE workspaces SET status='stopped' WHERE id=$1`, stopped)
	require.NoError(t, err)

	type result struct {
		name string
		err  error
		got  AgentWorkspaceRelease
	}
	results := make(chan result, 4)
	var wg sync.WaitGroup
	for _, id := range append(running, stopped) {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			got, err := svc.ReleaseAgentWorkspace(context.Background(), id, "", 0)
			results <- result{"release " + id, err, got}
		}(id)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		results <- result{"admission", svc.admitAgentBoxJoin(context.Background(), f.workspace, f.session, f.person), AgentWorkspaceRelease{}}
	}()
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(45 * time.Second):
		t.Fatal("an operation hung on a pool of one connection")
	}
	close(results)
	for got := range results {
		require.NoError(t, got.err, got.name)
		if got.name != "admission" {
			require.Contains(t, []string{agentWorkspaceQuiesced, agentWorkspaceAlreadyReleased}, got.got.Outcome, got.name)
		}
	}
}

// With context.Background() and a pool whose only connection is held, a
// release, a quiesce, a join's admission and the cleanup sweep each fail
// typed within their own deadline instead of waiting forever (Security G4
// finding 5).
func TestReleaseAdmissionAndSweepAreBoundedWithABackgroundContext(t *testing.T) {
	budgets := []*time.Duration{&agentBoxReleaseBudget, &agentBoxJoinWait, &agentBoxSweepBudget}
	saved := make([]time.Duration, len(budgets))
	for i, budget := range budgets {
		saved[i], *budget = *budget, time.Second
	}
	t.Cleanup(func() {
		for i, budget := range budgets {
			*budget = saved[i]
		}
	})
	f := newAgentBoxRelease(t, "running")
	svc, small := f.smallPoolService(t, 1)
	held, err := small.Acquire(f.ctx)
	require.NoError(t, err)
	defer held.Release()

	for _, op := range []struct {
		name string
		run  func() error
	}{
		{"release", func() error {
			_, err := svc.ReleaseAgentWorkspace(context.Background(), f.workspace, f.session, f.run)
			return err
		}},
		{"quiesce", func() error {
			_, err := svc.QuiesceAgentBox(context.Background(), f.workspace, f.session, f.run)
			return err
		}},
		{"admission", func() error { return svc.admitAgentBoxJoin(context.Background(), f.workspace, f.session, f.person) }},
		{"sweep", func() error { return svc.RetireIdleAgentBoxes(context.Background()) }},
	} {
		t.Run(op.name, func(t *testing.T) {
			start := time.Now()
			err := op.run()
			require.Less(t, time.Since(start), 5*time.Second, "bounded by its own deadline")
			require.Error(t, err)
			var apiErr *pkgerrors.APIError
			if errors.As(err, &apiErr) {
				err = apiErr.Cause()
			}
			require.ErrorIs(t, err, context.DeadlineExceeded, fmt.Sprintf("%s fails typed", op.name))
		})
	}
}
