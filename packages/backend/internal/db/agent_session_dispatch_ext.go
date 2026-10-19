package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// ClaimAgentSessionForDispatch atomically re-points an agent session at a new
// workflow run — but only when the session has no live (queued/running) run.
//
// This is the serialized replacement for the old check-then-act pair
// (GetAgentSessionWorkflowRunID + unconditional UpdateAgentSessionWorkflowRun):
// two concurrent dispatches for one session could both pass the unlocked check,
// both provision a VM, and race on the final re-point, 401-locking the losing
// run's session-event callbacks. The FOR UPDATE row lock serializes claimers;
// the loser re-reads the winner's freshly committed run (a new statement under
// READ COMMITTED sees it) and backs off.
//
// A successful claim also resets the session to a dispatchable state
// (status='active', started_at/finished_at cleared) so that a re-dispatched
// terminal session can transition terminal again when its new run finishes —
// otherwise the 'done' finalize path is skipped for every run after the first
// (UpdateAgentSessionTerminalStatus only matches status='active' rows), leaking
// the VM gauge and the run's scoped tokens.
//
// The reset drops the recorded failure with it (failure_reason,
// failure_reason_code and failure_retryable; see RecordAgentSessionFailure):
// the session read and its status event repeat those keys, so a retry that
// succeeds would otherwise keep showing its owner the previous attempt's
// refusal. It drops metadata.waiting_reason for the same reason: the wait this
// dispatch was parked behind is over the moment it claims the session (#3888),
// and metadata.model, which the new turn writes for itself when it is admitted.
//
// Returns false when the session is missing/tombstoned or another run is live.
func (q *Queries) ClaimAgentSessionForDispatch(ctx context.Context, sessionID string, workflowRunID int64) (bool, error) {
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return false, fmt.Errorf("claim agent session for dispatch: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentRunID *int64
	err = tx.QueryRow(ctx, `
SELECT workflow_run_id FROM agent_sessions
WHERE id = $1 AND deleted_at IS NULL
FOR UPDATE
`, sessionID).Scan(&currentRunID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	if currentRunID != nil {
		var status string
		err = tx.QueryRow(ctx, `SELECT status FROM workflow_runs WHERE id = $1`, *currentRunID).Scan(&status)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return false, err
		}
		if err == nil && (status == "queued" || status == "running") {
			return false, nil
		}
	}

	if _, err := tx.Exec(ctx, `
UPDATE agent_sessions
SET workflow_run_id = $2,
    status = 'active',
    started_at = NULL,
    finished_at = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) - 'failure_reason' - 'failure_reason_code' - 'failure_retryable' - 'waiting_reason' - 'model',
    updated_at = NOW()
WHERE id = $1 AND deleted_at IS NULL
`, sessionID, workflowRunID); err != nil {
		return false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// ReserveAgentSessionVMSlot atomically checks the fleet-wide active-agent-VM
// count against the cap and, if below it, stamps the session's started_at so
// the session is counted immediately — BEFORE the slow Microsandbox CreateSandbox call.
// startedAt is when the turn's message was accepted: the turn's wall clock,
// which the session reaper bounds, starts there; the count reads only that
// started_at is set.
//
// The count + stamp are serialized across the whole fleet with a transaction-
// scoped advisory lock: concurrent reservers queue on the lock, and each
// subsequent COUNT (a new statement under READ COMMITTED) sees every previously
// committed reservation, so a burst of simultaneous dispatches cannot overshoot
// the cap the way the old standalone count (which ignored provisioning VMs)
// could.
//
// The count predicate must stay in lockstep with CountActiveAgentSessionVMs and
// the reaper's ListStaleActiveSessions. A reserved slot is released when the
// session leaves status='active' (terminal transition, infra-failure cleanup,
// or the session reaper).
//
// Returns false when the fleet is at capacity; an error when the session is not
// in a reservable state (missing, tombstoned, or not active).
func (q *Queries) ReserveAgentSessionVMSlot(ctx context.Context, sessionID string, maxActive int, startedAt time.Time) (bool, error) {
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return false, fmt.Errorf("reserve agent session vm slot: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('agent_session_vm_fleet_cap'))`); err != nil {
		return false, err
	}

	var count int
	if err := tx.QueryRow(ctx, `
SELECT COUNT(*)
FROM agent_sessions
WHERE status = 'active'
  AND started_at IS NOT NULL
  AND deleted_at IS NULL
`).Scan(&count); err != nil {
		return false, err
	}
	if count >= maxActive {
		return false, nil
	}

	tag, err := tx.Exec(ctx, `
UPDATE agent_sessions
SET started_at = $2, updated_at = NOW()
WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
`, sessionID, startedAt)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, fmt.Errorf("agent session %s is not active", sessionID)
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// FailNeverStartedAgentSession preserves the session result while the generated
// statement atomically fails an abandoned run and its unfinished work.
func (q *Queries) FailNeverStartedAgentSession(ctx context.Context, arg FailNeverStartedAgentSessionParams) (AgentSession, error) {
	row, err := q.FailNeverStartedAgentSessionRaw(ctx, arg)
	return AgentSession(row), err
}

type FailNeverStartedAgentSessionParams = FailNeverStartedAgentSessionRawParams

// AgentSessionFailure is the typed reason a failed session carries: a code
// from a closed vocabulary, one sentence in product words, and whether trying
// again can succeed without a code or configuration change.
type AgentSessionFailure struct {
	Code      string
	Reason    string
	Retryable bool
}

// AgentSessionFailureRecord is what RecordAgentSessionFailure wrote: the
// terminal session with its reason, and the final assistant reply that carries
// the same sentence.
type AgentSessionFailureRecord struct {
	Session AgentSession
	Reply   AgentMessage
	Part    AgentPart
}

// RecordAgentSessionFailure stores a failed session's typed reason and ends its
// turn with that sentence, in one transaction.
//
// A session that cannot start, or whose turn fails in the box, goes terminal
// with no reply of its own, and the API returns metadata verbatim, so this is
// the only place the owner of the session can learn why. The specific causes
// otherwise reach slog and the workflow task's last_error only, neither of
// which the session's own routes expose.
//
// metadata gains failure_reason, failure_reason_code and failure_retryable;
// the transcript gains one assistant message whose text part is the sentence,
// so the turn ends with it rather than silence. The caller passes product
// vocabulary, never a provider's error chain: both values are handed straight
// back to the browser.
//
// Only a terminal row (status <> 'active') that carries no recorded failure is
// written, so a re-dispatched session cannot keep a stale reason and a
// repeated call never appends a second reply. Returns false when nothing was
// written.
func (q *Queries) RecordAgentSessionFailure(ctx context.Context, sessionID string, failure AgentSessionFailure) (AgentSessionFailureRecord, bool, error) {
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return AgentSessionFailureRecord{}, false, fmt.Errorf("record agent session failure: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	row := tx.QueryRow(ctx, `
UPDATE agent_sessions
SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'waiting_reason') || jsonb_build_object(
        'failure_reason', $2::text,
        'failure_reason_code', $3::text,
        'failure_retryable', $4::boolean),
    updated_at = NOW()
WHERE id = $1 AND status <> 'active' AND deleted_at IS NULL
  AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'failure_reason_code')
RETURNING id, repository_id, user_id, workflow_run_id, title, status, metadata, workspace_id,
          started_at, finished_at, created_at, updated_at, deleted_at
`, sessionID, failure.Reason, failure.Code, failure.Retryable)
	var record AgentSessionFailureRecord
	i := &record.Session
	err = row.Scan(
		&i.ID,
		&i.RepositoryID,
		&i.UserID,
		&i.WorkflowRunID,
		&i.Title,
		&i.Status,
		&i.Metadata,
		&i.WorkspaceID,
		&i.StartedAt,
		&i.FinishedAt,
		&i.CreatedAt,
		&i.UpdatedAt,
		&i.DeletedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return AgentSessionFailureRecord{}, false, nil
	}
	if err != nil {
		return AgentSessionFailureRecord{}, false, err
	}
	inTx := New(tx)
	record.Reply, err = inTx.CreateAgentMessageWithNextSequence(ctx, CreateAgentMessageWithNextSequenceParams{SessionID: sessionID, Role: "assistant"})
	if err != nil {
		return AgentSessionFailureRecord{}, false, err
	}
	content, err := json.Marshal(map[string]string{"value": failure.Reason})
	if err != nil {
		return AgentSessionFailureRecord{}, false, err
	}
	record.Part, err = inTx.CreateAgentPart(ctx, CreateAgentPartParams{
		MessageID: record.Reply.ID, RepositoryID: record.Session.RepositoryID, SessionID: sessionID,
		PartIndex: 0, PartType: "text", Content: content,
	})
	if err != nil {
		return AgentSessionFailureRecord{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AgentSessionFailureRecord{}, false, err
	}
	return record, true, nil
}

// RecordAgentSessionModel stores the provider:model a dispatched turn runs on
// as metadata.model, beside the failure keys, so the session read names the
// model the turn actually used. Returns false when the session is missing or
// tombstoned.
func (q *Queries) RecordAgentSessionModel(ctx context.Context, sessionID, model string) (bool, error) {
	tag, err := q.db.Exec(ctx, `
UPDATE agent_sessions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('model', $2::text),
    updated_at = NOW()
WHERE id = $1 AND deleted_at IS NULL
`, sessionID, model)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// RecordAgentSessionWaitingReason merges one bounded, user-facing sentence into
// an ACTIVE session's metadata under "waiting_reason".
//
// A dispatch the account's sandbox quota refuses is parked, not failed: the
// durable job stays retryable on purpose. Until this, nothing recorded the
// wait, so the session sat active with {} metadata and an unmoving updated_at,
// which is indistinguishable from a wedged turn — production 2026-10-14 13:34Z,
// sessions 3b6f589e and 82776348, four minutes silent. The key is cleared by
// ClaimAgentSessionForDispatch when the turn finally starts and by
// RecordAgentSessionFailure if it ends instead, so it never outlives the
// wait it describes.
//
// Product vocabulary only: the value is handed straight back to the browser.
// Returns false when the session is missing, tombstoned or no longer active.
func (q *Queries) RecordAgentSessionWaitingReason(ctx context.Context, sessionID, reason string) (bool, error) {
	tag, err := q.db.Exec(ctx, `
UPDATE agent_sessions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('waiting_reason', $2::text),
    updated_at = NOW()
WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
`, sessionID, reason)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
