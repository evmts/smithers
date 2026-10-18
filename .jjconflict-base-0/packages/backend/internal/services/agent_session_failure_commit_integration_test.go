package services

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// sessionCommit is the state one committed transaction left an agent session
// row in: what any other connection read once that transaction committed.
type sessionCommit struct {
	txid     int64
	status   string
	metadata json.RawMessage
}

// watchSessionCommits records every committed state of agent_sessions rows.
// A trigger copies each row version into an audit table inside the writing
// transaction, so a rolled-back write leaves nothing, and a transaction's last
// version is the state the session read could return between that commit and
// the next one.
func watchSessionCommits(t *testing.T, pool *pgxpool.Pool) func(sessionID string) []sessionCommit {
	t.Helper()
	ctx := context.Background()
	for _, statement := range []string{
		`CREATE TABLE agent_session_commits (seq bigserial PRIMARY KEY, txid bigint NOT NULL, session_id text NOT NULL, status text NOT NULL, metadata jsonb)`,
		`CREATE FUNCTION record_agent_session_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO agent_session_commits (txid, session_id, status, metadata) VALUES (txid_current(), NEW.id, NEW.status, NEW.metadata);
	RETURN NEW;
END $$`,
		`CREATE TRIGGER record_agent_session_commit AFTER UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION record_agent_session_commit()`,
	} {
		_, err := pool.Exec(ctx, statement)
		require.NoError(t, err)
	}
	return func(sessionID string) []sessionCommit {
		t.Helper()
		rows, err := pool.Query(ctx, `
SELECT DISTINCT ON (txid) txid, status, COALESCE(metadata, '{}'::jsonb)
FROM agent_session_commits WHERE session_id = $1
ORDER BY txid, seq DESC`, sessionID)
		require.NoError(t, err)
		defer rows.Close()
		var commits []sessionCommit
		for rows.Next() {
			var commit sessionCommit
			require.NoError(t, rows.Scan(&commit.txid, &commit.status, &commit.metadata))
			commits = append(commits, commit)
		}
		require.NoError(t, rows.Err())
		return commits
	}
}

// requireEveryFailedCommitSaysWhy fails when any committed state of a session
// says failed without its own typed reason: a read in that window answers a
// bare failure (reason_code null, reason null, retryable false).
func requireEveryFailedCommitSaysWhy(t *testing.T, commits []sessionCommit, code string) {
	t.Helper()
	failed := 0
	for _, commit := range commits {
		if commit.status != "failed" && commit.status != "timed_out" {
			continue
		}
		failed++
		var keys map[string]any
		require.NoError(t, json.Unmarshal(commit.metadata, &keys))
		recordedCode, _ := keys[agentSessionFailureCodeKey].(string)
		reason, _ := keys[agentSessionFailureReasonKey].(string)
		require.Equal(t, code, recordedCode,
			"transaction %d committed status %q with metadata %s: the failed status became visible without its reason_code", commit.txid, commit.status, commit.metadata)
		require.NotEmpty(t, strings.TrimSpace(reason),
			"transaction %d committed status %q with metadata %s: the failed status became visible without its reason", commit.txid, commit.status, commit.metadata)
		require.Contains(t, keys, agentSessionFailureRetryableKey,
			"transaction %d committed status %q without retryable", commit.txid, commit.status)
	}
	require.Equal(t, 1, failed, "one transaction fails the session")
}

// QA f-qjwko8, production 2026-10-19 19:24:57Z, session f10afca7 (run 18069):
// the session reaper failed the turn at its bound, and a session read half a
// second later answered status failed with reason_code null, reason null and
// retryable false, while the row soon carried turn_timed_out. The status and
// its reason committed in two writes. Every path that fails a session now
// commits the status, the typed reason and the final reply in one transaction:
// no committed state of the row says failed without its reason.
func TestAFailedStatusCommitsWithItsReason(t *testing.T) {
	ctx := context.Background()
	projectionOf := func(t *testing.T, update flowdispatch.ProjectionUpdate) agentFlowProjection {
		t.Helper()
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		return projection
	}

	t.Run("the turn ran past its bound", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		commits := watchSessionCommits(t, pool)
		projection := projectionOf(t, update)
		q := db.New(pool)
		_, err := q.UpdateAgentSessionStartedAt(ctx, db.UpdateAgentSessionStartedAtParams{ID: projection.SessionID,
			StartedAt: pgtype.Timestamptz{Time: time.Now().UTC().Add(-HostedAgentTurnTimeout - 30*time.Second), Valid: true}})
		require.NoError(t, err)

		require.NoError(t, service.reapExpiredSessions(ctx, HostedAgentTurnTimeout))

		requireEveryFailedCommitSaysWhy(t, commits(projection.SessionID), agentFailureTurnTimedOut)
		read := readSessionFailure(t, service, projection.SessionID)
		require.Equal(t, "failed", read.Status)
		require.Equal(t, agentFailureTurnTimedOut, *read.ReasonCode)
		require.Equal(t, "This turn stopped after 15 minutes without finishing.", *read.Reason)
		_, text, count := lastReplyText(t, service, projection.SessionID)
		require.Equal(t, *read.Reason, text)
		require.Equal(t, 2, count, "the request and exactly one timeout reply")
	})

	t.Run("a reason that cannot be written leaves the turn running", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		commits := watchSessionCommits(t, pool)
		projection := projectionOf(t, update)
		q := db.New(pool)
		_, err := q.UpdateAgentSessionStartedAt(ctx, db.UpdateAgentSessionStartedAtParams{ID: projection.SessionID,
			StartedAt: pgtype.Timestamptz{Time: time.Now().UTC().Add(-HostedAgentTurnTimeout - 30*time.Second), Valid: true}})
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `CREATE FUNCTION refuse_failure_reply() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test refused the failure reply'; END $$`)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `CREATE TRIGGER refuse_failure_reply BEFORE INSERT ON agent_parts FOR EACH ROW EXECUTE FUNCTION refuse_failure_reply()`)
		require.NoError(t, err)

		session, err := q.GetAgentSession(ctx, projection.SessionID)
		require.NoError(t, err)
		require.ErrorContains(t, service.reapExpiredSession(ctx, session), "test refused the failure reply")
		session, err = q.GetAgentSession(ctx, projection.SessionID)
		require.NoError(t, err)
		require.Equal(t, "active", session.Status, "the status rolls back with its reason")
		for _, commit := range commits(projection.SessionID) {
			require.Equal(t, "active", commit.status, "no failed status committed without its reason")
		}

		_, err = pool.Exec(ctx, `DROP TRIGGER refuse_failure_reply ON agent_parts`)
		require.NoError(t, err)
		require.NoError(t, service.reapExpiredSessions(ctx, HostedAgentTurnTimeout))
		requireEveryFailedCommitSaysWhy(t, commits(projection.SessionID), agentFailureTurnTimedOut)
	})

	t.Run("the turn waited past the queue bound", func(t *testing.T) {
		turn := queuedTurnFixture(t)
		commits := watchSessionCommits(t, turn.pool)
		turn.age(t, HostedAgentQueueTimeout+time.Second)

		turn.reap(t)

		requireEveryFailedCommitSaysWhy(t, commits(turn.sessionID), agentFailureBoxBusy)
		requireQueueBoundFailed(t, turn)
	})

	t.Run("the turn never started", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		commits := watchSessionCommits(t, pool)
		projection := projectionOf(t, update)
		_, err := pool.Exec(ctx, `UPDATE workflow_runs SET created_at = created_at - interval '2 hours' WHERE id = $1`, projection.WorkflowRunID)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `UPDATE agent_messages SET created_at = created_at - interval '2 hours' WHERE session_id = $1`, projection.SessionID)
		require.NoError(t, err)

		require.NoError(t, service.reapNeverStartedSessions(ctx))

		requireEveryFailedCommitSaysWhy(t, commits(projection.SessionID), agentSessionNeverStarted.Code)
		read := readSessionFailure(t, service, projection.SessionID)
		require.Equal(t, "failed", read.Status)
		require.Equal(t, agentSessionNeverStarted.Reason, *read.Reason)
	})

	t.Run("the dispatch failed", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		commits := watchSessionCommits(t, pool)
		projection := projectionOf(t, update)
		q := db.New(pool)
		run, err := q.GetWorkflowRunByRunID(ctx, projection.WorkflowRunID)
		require.NoError(t, err)
		task, err := q.GetWorkflowTaskByRunID(ctx, projection.WorkflowRunID)
		require.NoError(t, err)
		session, err := q.GetAgentSession(ctx, projection.SessionID)
		require.NoError(t, err)
		d := &agentDispatch{svc: service, ctx: ctx, run: run, task: task, step: db.WorkflowStep{ID: task.WorkflowStepID},
			input: DispatchAgentRunInput{SessionID: session.ID, RepositoryID: session.RepositoryID, UserID: session.UserID}}

		require.Error(t, d.markInfraFailedFromError("create agent workspace",
			&pkgerrors.APIError{Status: http.StatusServiceUnavailable, Code: pkgerrors.CodeNoCapacity, Message: "no healthy worker"}))

		requireEveryFailedCommitSaysWhy(t, commits(projection.SessionID), agentSessionNoCapacity.Code)
		require.Equal(t, agentSessionNoCapacityMessage, *readSessionFailure(t, service, projection.SessionID).Reason)
	})

	t.Run("the Flow run failed", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		commits := watchSessionCommits(t, pool)
		projection := projectionOf(t, update)
		update.State = jobs.StateFailed
		update.Checkpoint.Run = nil
		update.Checkpoint.FailureCode = "runtime_start_exhausted"

		require.NoError(t, service.ProjectFlowRuntime(ctx, update))

		requireEveryFailedCommitSaysWhy(t, commits(projection.SessionID), agentSessionFlowHostUnavailable.Code)
		require.Equal(t, agentSessionFlowHostUnavailable.Reason, *readSessionFailure(t, service, projection.SessionID).Reason)
	})
}
