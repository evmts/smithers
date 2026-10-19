package services

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/sandbox/sandboxfake"
)

// machineLimitReached is a billing policy whose account already runs its one
// machine: the refusal QA hit with two concurrent changes (b-4vf5ge).
type machineLimitReached struct{}

func (machineLimitReached) AuthorizeSandboxStart(context.Context, int64) error {
	return authorizeSandboxEntitlement(SandboxEntitlement{PlanKey: BillingPlanFree, ConcurrentSandboxes: 1, ConcurrentInUse: 1, HoursPerDay: -1})
}
func (machineLimitReached) SandboxEntitlement(context.Context, int64) (SandboxEntitlement, error) {
	return SandboxEntitlement{}, errors.New("unexpected entitlement read")
}
func (machineLimitReached) AuthorizePrivateRepo(context.Context, string, int64) error { return nil }
func (machineLimitReached) AuthorizeWorkflowDispatchCommitted(context.Context, int64, func(context.Context, pgx.Tx) error) error {
	return errors.New("unexpected workflow dispatch")
}
func (machineLimitReached) AuthorizeAgentRunCommitted(context.Context, int64, func(context.Context, db.DBTX) error) error {
	return errors.New("unexpected agent run")
}
func (machineLimitReached) AuthorizeStorageIncrease(context.Context, int64, int64) error { return nil }

type refusedTurn struct {
	status, code, reason string
	retryable            bool
	lastReply            string
}

// dispatchUntilSettled appends one user message and runs a worker until its
// dispatch op settles, then reads what the session's owner sees.
func dispatchUntilSettled(t *testing.T, pool *pgxpool.Pool, worker *AgentService, sessionID string, repositoryID, userID int64, before func()) (jobs.Operation, refusedTurn) {
	t.Helper()
	ctx := context.Background()
	appender := NewAgentServiceWithPool(db.New(pool), pool)
	var owner, name string
	require.NoError(t, pool.QueryRow(ctx, `SELECT u.username, r.name FROM repositories r JOIN users u ON u.id=r.user_id WHERE r.id=$1`, repositoryID).Scan(&owner, &name))
	message, err := appender.AppendMessageAndDispatch(ctx, DispatchAgentRunInput{SessionID: sessionID, RepositoryID: repositoryID, UserID: userID, RepoOwner: owner, RepoName: name},
		[]db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"make a change"}`)}})
	require.NoError(t, err)
	if before != nil {
		before()
	}
	workerCtx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() {
		done <- worker.RunMessageDispatchWorker(workerCtx, jobs.WorkerConfig{
			WorkerID: "refusal-" + sessionID, Capacity: 1, Lease: time.Second,
			PollInterval: 5 * time.Millisecond, RetryDelay: 5 * time.Millisecond,
		})
	}()
	defer func() {
		cancel()
		select {
		case workerErr := <-done:
			require.NoError(t, workerErr)
		case <-time.After(5 * time.Second):
			t.Error("dispatch worker did not stop")
		}
	}()
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	var settled jobs.Operation
	require.Eventually(t, func() bool {
		var getErr error
		settled, getErr = store.GetByRequest(ctx, repositoryJobFlowScope(repositoryID, userID), "agent-run-dispatch", "agent-message:"+strconv.FormatInt(message.ID, 10))
		return getErr == nil && settled.State.Terminal()
	}, 5*time.Second, 10*time.Millisecond)
	var turn refusedTurn
	var retryable *string
	require.NoError(t, pool.QueryRow(ctx, `SELECT status, coalesce(metadata->>'failure_reason_code',''), coalesce(metadata->>'failure_reason',''), metadata->>'failure_retryable' FROM agent_sessions WHERE id=$1`, sessionID).
		Scan(&turn.status, &turn.code, &turn.reason, &retryable))
	turn.retryable = retryable != nil && *retryable == "true"
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce((SELECT p.content->>'value' FROM agent_messages m JOIN agent_parts p ON p.message_id=m.id WHERE m.session_id=$1 AND m.role='assistant' ORDER BY m.sequence DESC, p.part_index DESC LIMIT 1),'')`, sessionID).
		Scan(&turn.lastReply))
	return settled, turn
}

// A refused dispatch used to leave its session 'active' with no run, so the
// reaper never fired and the card waited forever (QA b-4vf5ge). Every refusal
// now ends the turn with its typed reason and the same sentence as a reply.
func TestAgentMessageDispatchRefusalEndsTheTurn(t *testing.T) {
	t.Run("a second concurrent change: sandbox_limit, retryable, no plan named", func(t *testing.T) {
		pool := newProductTestPool(t)
		userID, repositoryID := setupTestUserAndRepo(t, pool)
		// A sandbox provider is wired, so the dispatch reaches the account's machine
		// limit, which refuses before any row or machine exists.
		worker := NewAgentServiceWithPool(db.New(pool), pool, WithAgentDispatchQuerier(db.New(pool)), WithAgentSandboxClient(sandboxfake.New()), WithAgentBillingPolicy(machineLimitReached{}))
		session, err := worker.CreateSession(context.Background(), CreateAgentSessionInput{RepositoryID: repositoryID, UserID: userID, Title: "second change"})
		require.NoError(t, err)
		op, turn := dispatchUntilSettled(t, pool, worker, session.ID, repositoryID, userID, nil)
		require.Equal(t, jobs.StateFailed, op.State)
		const sentence = "You can run one machine at a time. Wait for your other change to finish, then try again."
		require.Equal(t, refusedTurn{status: "failed", code: "sandbox_limit", reason: sentence, retryable: true, lastReply: sentence}, turn)
	})

	t.Run("no machine provider: dispatch_failed, retryable", func(t *testing.T) {
		pool := newProductTestPool(t)
		userID, repositoryID := setupTestUserAndRepo(t, pool)
		worker := NewAgentServiceWithPool(db.New(pool), pool, WithAgentDispatchQuerier(db.New(pool)))
		session, err := worker.CreateSession(context.Background(), CreateAgentSessionInput{RepositoryID: repositoryID, UserID: userID, Title: "no provider"})
		require.NoError(t, err)
		op, turn := dispatchUntilSettled(t, pool, worker, session.ID, repositoryID, userID, nil)
		require.Equal(t, jobs.StateFailed, op.State)
		require.Equal(t, refusedTurn{status: "failed", code: "dispatch_failed", reason: agentSessionStartFailure.Reason, retryable: true, lastReply: agentSessionStartFailure.Reason}, turn)
	})

	t.Run("an archived repository: dispatch_failed, not retryable", func(t *testing.T) {
		pool := newProductTestPool(t)
		userID, repositoryID := setupTestUserAndRepo(t, pool)
		worker := NewAgentServiceWithPool(db.New(pool), pool, WithAgentDispatchQuerier(db.New(pool)))
		session, err := worker.CreateSession(context.Background(), CreateAgentSessionInput{RepositoryID: repositoryID, UserID: userID, Title: "archived"})
		require.NoError(t, err)
		op, turn := dispatchUntilSettled(t, pool, worker, session.ID, repositoryID, userID, func() {
			_, err := pool.Exec(context.Background(), `UPDATE repositories SET is_archived=true WHERE id=$1`, repositoryID)
			require.NoError(t, err)
		})
		require.Equal(t, jobs.StateFailed, op.State)
		require.JSONEq(t, `{"code":"repository_unavailable","messageId":`+string(mustMessageID(t, op))+`}`, string(op.TerminalReceipt))
		require.Equal(t, refusedTurn{status: "failed", code: "dispatch_failed", reason: agentSessionRepositoryGone.Reason, lastReply: agentSessionRepositoryGone.Reason}, turn)
	})

	t.Run("a run that attached since the dispatch read the session keeps it", func(t *testing.T) {
		pool := newProductTestPool(t)
		ctx := context.Background()
		q := db.New(pool)
		userID, repositoryID := setupTestUserAndRepo(t, pool)
		service := NewAgentServiceWithPool(q, pool, WithAgentDispatchQuerier(q))
		session, err := service.CreateSession(ctx, CreateAgentSessionInput{RepositoryID: repositoryID, UserID: userID, Title: "raced"})
		require.NoError(t, err)
		stale, err := q.GetAgentSession(ctx, session.ID)
		require.NoError(t, err)
		def, err := q.UpsertAgentWorkflowDefinition(ctx, repositoryID)
		require.NoError(t, err)
		run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repositoryID, WorkflowDefinitionID: def.ID, Status: "running", TriggerEvent: "agent", TriggerRef: "main", TriggerCommitSha: "test", DispatchInputs: json.RawMessage(`{}`)})
		require.NoError(t, err)
		_, err = q.UpdateAgentSessionWorkflowRun(ctx, db.UpdateAgentSessionWorkflowRunParams{ID: session.ID, WorkflowRunID: pgtype.Int8{Int64: run.ID, Valid: true}})
		require.NoError(t, err)
		service.endUndispatchedTurn(ctx, stale, agentSessionNeverStarted)
		current, err := q.GetAgentSession(ctx, session.ID)
		require.NoError(t, err)
		require.Equal(t, "active", current.Status, "the run that attached owns the session")
	})
}

func mustMessageID(t *testing.T, op jobs.Operation) []byte {
	t.Helper()
	var receipt struct {
		MessageID json.RawMessage `json:"messageId"`
	}
	require.NoError(t, json.Unmarshal(op.TerminalReceipt, &receipt))
	return receipt.MessageID
}
