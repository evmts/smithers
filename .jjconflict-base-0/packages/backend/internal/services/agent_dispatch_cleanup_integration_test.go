package services

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// claimBarrierDispatchQuerier keeps all database operations real. The barrier
// ensures both dispatches pass the unlocked precheck before either claims.
type claimBarrierDispatchQuerier struct {
	AgentDispatchQuerier
	mu          sync.Mutex
	arrivals    int
	bothArrived chan struct{}
	claimIDs    chan int64
}

func (q *claimBarrierDispatchQuerier) ClaimAgentSessionForDispatch(ctx context.Context, sessionID string, runID int64) (bool, error) {
	q.claimIDs <- runID
	q.mu.Lock()
	q.arrivals++
	if q.arrivals == 2 {
		close(q.bothArrived)
	}
	q.mu.Unlock()
	select {
	case <-q.bothArrived:
	case <-ctx.Done():
		return false, ctx.Err()
	}
	return q.AgentDispatchQuerier.ClaimAgentSessionForDispatch(ctx, sessionID, runID)
}

type heldAgentFlowAdmission struct {
	admitted chan int64
	release  chan struct{}
}

func (f *heldAgentFlowAdmission) Admit(ctx context.Context, request flowdispatch.LaunchRequest) (jobs.RequestReceipt, error) {
	runID, err := strconv.ParseInt(request.RequestID[len("agent-run:"):], 10, 64)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	f.admitted <- runID
	select {
	case <-f.release:
		return jobs.RequestReceipt{}, errors.New("release held admission")
	case <-ctx.Done():
		return jobs.RequestReceipt{}, ctx.Err()
	}
}

func (*heldAgentFlowAdmission) CancelRequest(context.Context, jobs.Scope, string) (jobs.Operation, error) {
	return jobs.Operation{}, nil
}

func TestDispatchAgentRun_LostClaimPreservesWinner(t *testing.T) {
	if testing.Short() {
		t.Skip("requires PostgreSQL")
	}
	pool := setupTestPool(t)
	q := db.New(pool)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	userID, repoID := setupTestUserAndRepo(t, pool)
	sessionID := uuid.NewString()
	_, err := q.CreateAgentSession(ctx, db.CreateAgentSessionParams{
		ID: sessionID, RepositoryID: repoID, UserID: userID, Title: "claim race", Status: "active",
	})
	require.NoError(t, err)
	barrier := &claimBarrierDispatchQuerier{
		AgentDispatchQuerier: q, bothArrived: make(chan struct{}), claimIDs: make(chan int64, 2),
	}
	admission := &heldAgentFlowAdmission{admitted: make(chan int64, 1), release: make(chan struct{})}
	var releaseOnce sync.Once
	var dispatches sync.WaitGroup
	t.Cleanup(func() {
		releaseOnce.Do(func() { close(admission.release) })
		dispatches.Wait()
	})
	svc := NewAgentServiceWithPool(q, pool, WithAgentDispatchQuerier(barrier), WithAgentFlowDispatcher(admission))
	svc.SetWorkspaceBackend(stubAgentWorkspaceBackend{})
	_, err = svc.AppendMessage(ctx, sessionID, "user", []db.CreateAgentPartParams{
		{PartType: "text", Content: json.RawMessage(`{"value":"please inspect this repository"}`)},
	})
	require.NoError(t, err)

	type dispatchResult struct {
		result DispatchAgentRunResult
		err    error
	}
	results := make(chan dispatchResult, 2)
	input := DispatchAgentRunInput{
		SessionID: sessionID, RepositoryID: repoID, UserID: userID, RepoOwner: "owner", RepoName: "repo",
	}
	dispatches.Add(2)
	for i := 0; i < 2; i++ {
		go func() {
			defer dispatches.Done()
			result, err := svc.DispatchAgentRun(ctx, input)
			results <- dispatchResult{result, err}
		}()
	}
	var winnerRunID int64
	select {
	case winnerRunID = <-admission.admitted:
	case <-ctx.Done():
		t.Fatal("winner did not reach flow admission after both real claims", ctx.Err())
	}
	firstRunID, secondRunID := <-barrier.claimIDs, <-barrier.claimIDs
	loserRunID := firstRunID
	if loserRunID == winnerRunID {
		loserRunID = secondRunID
	}
	require.NotEqual(t, winnerRunID, loserRunID)

	var loser dispatchResult
	select {
	case loser = <-results:
	case <-ctx.Done():
		t.Fatal("losing dispatch did not return while winner was held", ctx.Err())
	}
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, loser.err, &apiErr)
	require.Equal(t, http.StatusConflict, apiErr.Status)

	var sessionStatus string
	var linkedRunID int64
	err = pool.QueryRow(ctx, `SELECT status, workflow_run_id FROM agent_sessions WHERE id = $1`, sessionID).Scan(&sessionStatus, &linkedRunID)
	require.NoError(t, err)
	assert.Equal(t, "active", sessionStatus)
	assert.Equal(t, winnerRunID, linkedRunID)

	winnerRun, err := q.GetWorkflowRunByRunID(ctx, winnerRunID)
	require.NoError(t, err)
	assert.Equal(t, "queued", winnerRun.Status)
	assert.True(t, winnerRun.AgentTokenHash.Valid, "winner callback token must survive loser cleanup")
	assert.True(t, winnerRun.AgentTokenExpiresAt.Valid)
	if winnerRun.AgentTokenHash.Valid && winnerRun.AgentTokenExpiresAt.Valid {
		assert.True(t, winnerRun.AgentTokenExpiresAt.Time.After(time.Now()))
		matchedWinner, lookupErr := q.GetWorkflowRunByAgentToken(ctx, pgtype.Text{String: winnerRun.AgentTokenHash.String, Valid: true})
		if assert.NoError(t, lookupErr) {
			assert.Equal(t, winnerRunID, matchedWinner.ID)
		}
	}

	loserRun, err := q.GetWorkflowRunByRunID(ctx, loserRunID)
	require.NoError(t, err)
	require.Equal(t, "failure", loserRun.Status)
	require.False(t, loserRun.AgentTokenHash.Valid, "the loser must stop before minting a callback token")
	var taskCount, stepCount int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM workflow_tasks WHERE workflow_run_id = $1`, loserRunID).Scan(&taskCount)
	require.NoError(t, err)
	err = pool.QueryRow(ctx, `SELECT count(*) FROM workflow_steps WHERE workflow_run_id = $1`, loserRunID).Scan(&stepCount)
	require.NoError(t, err)
	require.Zero(t, taskCount, "the loser must stop before creating a task")
	require.Zero(t, stepCount, "the loser must stop before creating a step")

	releaseOnce.Do(func() { close(admission.release) })
	select {
	case winner := <-results:
		require.Error(t, winner.err, "held winner should exit after test releases admission")
	case <-ctx.Done():
		t.Fatal("held winner did not exit", ctx.Err())
	}
	// The winner owns the claim, so its later admission failure must terminate
	// the session and revoke its own callback token.
	err = pool.QueryRow(ctx, `SELECT status, workflow_run_id FROM agent_sessions WHERE id = $1`, sessionID).Scan(&sessionStatus, &linkedRunID)
	require.NoError(t, err)
	require.Equal(t, "failed", sessionStatus)
	require.Equal(t, winnerRunID, linkedRunID)
	winnerRun, err = q.GetWorkflowRunByRunID(ctx, winnerRunID)
	require.NoError(t, err)
	require.Equal(t, "failure", winnerRun.Status)
	require.False(t, winnerRun.AgentTokenHash.Valid)
	var taskStatus, stepStatus string
	err = pool.QueryRow(ctx, `SELECT status FROM workflow_tasks WHERE workflow_run_id = $1`, winnerRunID).Scan(&taskStatus)
	require.NoError(t, err)
	err = pool.QueryRow(ctx, `SELECT status FROM workflow_steps WHERE workflow_run_id = $1`, winnerRunID).Scan(&stepStatus)
	require.NoError(t, err)
	require.Equal(t, "failed", taskStatus)
	require.Equal(t, "failure", stepStatus)
}

// A delayed failure report for a taskless predecessor must only clean up that
// predecessor, even after the session has been claimed by a newer run.
func TestMarkAgentDispatchInfrastructureFailed_TasklessPredecessorPreservesNewClaim(t *testing.T) {
	if testing.Short() {
		t.Skip("requires PostgreSQL")
	}
	pool := setupTestPool(t)
	q := db.New(pool)
	ctx := context.Background()
	userID, repoID := setupTestUserAndRepo(t, pool)
	sessionID := uuid.NewString()
	_, err := q.CreateAgentSession(ctx, db.CreateAgentSessionParams{
		ID: sessionID, RepositoryID: repoID, UserID: userID, Title: "delayed cleanup", Status: "active",
	})
	require.NoError(t, err)
	definition, err := q.UpsertAgentWorkflowDefinition(ctx, repoID)
	require.NoError(t, err)
	makeRun := func(tokenHash string) db.WorkflowRun {
		t.Helper()
		run, createErr := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{
			RepositoryID: repoID, WorkflowDefinitionID: definition.ID, Status: "queued",
			TriggerEvent: "agent_message", DispatchInputs: []byte(`{}`), ExecutionPlane: "agent",
		})
		require.NoError(t, createErr)
		_, tokenErr := q.UpdateWorkflowRunAgentToken(ctx, db.UpdateWorkflowRunAgentTokenParams{
			ID: run.ID, AgentTokenHash: pgtype.Text{String: tokenHash, Valid: true},
			AgentTokenExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
		})
		require.NoError(t, tokenErr)
		return run
	}
	oldRun := makeRun("old-" + sessionID)
	claimed, err := q.ClaimAgentSessionForDispatch(ctx, sessionID, oldRun.ID)
	require.NoError(t, err)
	require.True(t, claimed)
	// No task was created for this run. The scheduler later records it as
	// terminal, allowing a new dispatch to claim the same session.
	require.NoError(t, q.FailWorkflowRun(ctx, oldRun.ID))
	newRun := makeRun("new-" + sessionID)
	claimed, err = q.ClaimAgentSessionForDispatch(ctx, sessionID, newRun.ID)
	require.NoError(t, err)
	require.True(t, claimed)

	svc := NewAgentServiceWithPool(q, pool, WithAgentDispatchQuerier(q))
	svc.markAgentDispatchInfrastructureFailed(ctx, 0, 0, oldRun.ID, sessionID, "late task creation failure")

	var status string
	var linkedRunID int64
	err = pool.QueryRow(ctx, `SELECT status, workflow_run_id FROM agent_sessions WHERE id = $1`, sessionID).Scan(&status, &linkedRunID)
	require.NoError(t, err)
	require.Equal(t, "active", status)
	require.Equal(t, newRun.ID, linkedRunID)
	persistedOld, err := q.GetWorkflowRunByRunID(ctx, oldRun.ID)
	require.NoError(t, err)
	require.Equal(t, "failure", persistedOld.Status)
	require.False(t, persistedOld.AgentTokenHash.Valid, "delayed cleanup revokes only the old token")
	persistedNew, err := q.GetWorkflowRunByRunID(ctx, newRun.ID)
	require.NoError(t, err)
	require.Equal(t, "queued", persistedNew.Status)
	require.Equal(t, "new-"+sessionID, persistedNew.AgentTokenHash.String)
	_, err = q.GetWorkflowRunByAgentToken(ctx, pgtype.Text{String: persistedNew.AgentTokenHash.String, Valid: true})
	require.NoError(t, err)
}

// A retry that succeeds must not keep showing its owner the previous attempt's
// refusal. markAgentDispatchInfrastructureFailed records the sentence on
// agent_sessions.metadata, which the API returns verbatim and the session
// status event repeats, so the re-dispatch that reactivates the row has to drop
// it with started_at and finished_at.
func TestClaimAgentSessionForDispatch_ClearsThePreviousAttemptsFailureReason(t *testing.T) {
	if testing.Short() {
		t.Skip("requires PostgreSQL")
	}
	pool := setupTestPool(t)
	q := db.New(pool)
	ctx := context.Background()
	userID, repoID := setupTestUserAndRepo(t, pool)
	sessionID := uuid.NewString()
	_, err := q.CreateAgentSession(ctx, db.CreateAgentSessionParams{
		ID: sessionID, RepositoryID: repoID, UserID: userID, Title: "retry after a refusal", Status: "active",
	})
	require.NoError(t, err)
	definition, err := q.UpsertAgentWorkflowDefinition(ctx, repoID)
	require.NoError(t, err)
	makeRun := func() db.WorkflowRun {
		t.Helper()
		run, createErr := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{
			RepositoryID: repoID, WorkflowDefinitionID: definition.ID, Status: "queued",
			TriggerEvent: "agent_message", DispatchInputs: []byte(`{}`), ExecutionPlane: "agent",
		})
		require.NoError(t, createErr)
		return run
	}

	refusedRun := makeRun()
	claimed, err := q.ClaimAgentSessionForDispatch(ctx, sessionID, refusedRun.ID)
	require.NoError(t, err)
	require.True(t, claimed)
	_, err = q.UpdateAgentSessionTerminalStatus(ctx, db.UpdateAgentSessionTerminalStatusParams{
		ID: sessionID, Status: "failed",
		ExpectedWorkflowRunID: pgtype.Int8{Int64: refusedRun.ID, Valid: true},
	})
	require.NoError(t, err)
	failed, recorded, err := q.RecordAgentSessionFailureReason(ctx, sessionID, agentSessionNoCapacityMessage)
	require.NoError(t, err)
	require.True(t, recorded)
	require.Contains(t, string(failed.Metadata), "failure_reason")
	require.NoError(t, q.FailWorkflowRun(ctx, refusedRun.ID))

	retryRun := makeRun()
	claimed, err = q.ClaimAgentSessionForDispatch(ctx, sessionID, retryRun.ID)
	require.NoError(t, err)
	require.True(t, claimed)

	var status string
	var metadata []byte
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, metadata FROM agent_sessions WHERE id = $1`, sessionID).Scan(&status, &metadata))
	assert.Equal(t, "active", status)
	assert.JSONEq(t, `{}`, string(metadata),
		"a reactivated session must not carry the refusal its retry replaced")
	assert.Empty(t, agentSessionFailureReasonFromMetadata(metadata))
}

// A dispatch the account's sandbox quota refuses is parked, not failed — the
// durable worker answers it with a retryable outcome on purpose. Nothing
// recorded that wait, and a session's only public surface is its metadata, so
// the turn sat `active` with `{}` and an unmoving updated_at. Production
// 2026-10-14 13:34Z, repository 112554: of eight turns dispatched together, six
// failed in 7 s and two were still silent four minutes later, their only trace
// an operator line
//
//	durable message dispatch failed agent_session_id=3b6f589e-…
//	  error="Your Pro plan allows 3 running sandboxes. Suspend one to continue."
//
// smithers#3888.
func TestAParkedDispatchRecordsItsWaitAndNeverOutlivesIt(t *testing.T) {
	if testing.Short() {
		t.Skip("requires PostgreSQL")
	}
	pool := setupTestPool(t)
	q := db.New(pool)
	ctx := context.Background()
	userID, repoID := setupTestUserAndRepo(t, pool)
	sessionID := uuid.NewString()
	_, err := q.CreateAgentSession(ctx, db.CreateAgentSessionParams{
		ID: sessionID, RepositoryID: repoID, UserID: userID, Title: "parked by the quota", Status: "active",
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE agent_sessions SET metadata='{"kept":"by the session"}'::jsonb WHERE id=$1`, sessionID)
	require.NoError(t, err)

	t.Run("the wait is recorded on the active session", func(t *testing.T) {
		recorded, recordErr := q.RecordAgentSessionWaitingReason(ctx, sessionID, agentSessionWaitingForSandboxMessage)
		require.NoError(t, recordErr)
		require.True(t, recorded, "a waiting turn that records nothing is indistinguishable from a wedged one")
		session, getErr := q.GetAgentSession(ctx, sessionID)
		require.NoError(t, getErr)
		require.Contains(t, string(session.Metadata), "waiting_reason")
		require.Contains(t, string(session.Metadata), "by the session", "the merge keeps the session's own keys")
	})

	t.Run("the dispatch that finally starts drops it", func(t *testing.T) {
		definition, defErr := q.UpsertAgentWorkflowDefinition(ctx, repoID)
		require.NoError(t, defErr)
		run, runErr := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{
			RepositoryID: repoID, WorkflowDefinitionID: definition.ID, Status: "queued",
			TriggerEvent: "agent_message", DispatchInputs: []byte(`{}`), ExecutionPlane: "agent",
		})
		require.NoError(t, runErr)
		claimed, claimErr := q.ClaimAgentSessionForDispatch(ctx, sessionID, run.ID)
		require.NoError(t, claimErr)
		require.True(t, claimed)
		session, getErr := q.GetAgentSession(ctx, sessionID)
		require.NoError(t, getErr)
		require.NotContains(t, string(session.Metadata), "waiting_reason", "the wait is over the moment the turn starts")
		require.Contains(t, string(session.Metadata), "by the session")
	})

	t.Run("a turn that ends instead shows one sentence, not two", func(t *testing.T) {
		recorded, recordErr := q.RecordAgentSessionWaitingReason(ctx, sessionID, agentSessionWaitingForSandboxMessage)
		require.NoError(t, recordErr)
		require.True(t, recorded)
		_, err := pool.Exec(ctx, `UPDATE agent_sessions SET status='failed' WHERE id=$1`, sessionID)
		require.NoError(t, err)
		failed, ok, failErr := q.RecordAgentSessionFailureReason(ctx, sessionID, agentSessionNoCapacityMessage)
		require.NoError(t, failErr)
		require.True(t, ok)
		require.Contains(t, string(failed.Metadata), "failure_reason")
		require.NotContains(t, string(failed.Metadata), "waiting_reason")

		parked, parkErr := q.RecordAgentSessionWaitingReason(ctx, sessionID, agentSessionWaitingForSandboxMessage)
		require.NoError(t, parkErr)
		require.False(t, parked, "a terminal session is not waiting for anything")
	})

	t.Run("only a quota refusal is a wait", func(t *testing.T) {
		require.Equal(t, agentSessionWaitingForSandboxMessage, agentDispatchWaitingReason(
			&pkgerrors.APIError{Status: http.StatusTooManyRequests, Code: pkgerrors.CodeQuotaExceeded, Message: "no free sandbox"}))
		require.Empty(t, agentDispatchWaitingReason(pkgerrors.Internal("create sandbox: connection refused")))
		require.Empty(t, agentDispatchWaitingReason(nil))
	})
}
