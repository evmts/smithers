package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// A session that could not start must say why. Before this, the dispatch
// failure reached slog and the workflow task's last_error only, so the
// session's own routes returned status "failed" with metadata {} and no error
// field — a full pool looked exactly like a broken model or a bad token.
func TestAgentDispatchFailureRecordsUserFacingReason(t *testing.T) {
	const (
		sessionID = "b1f2c133-0000-4000-8000-000000000000"
		runID     = int64(77)
	)

	for _, tc := range []struct {
		name       string
		message    string
		reason     string
		wantReason string
	}{
		{
			name:       "a full pool names the pool",
			message:    "create sandbox: microsandbox api returned status 503 (no_capacity)",
			reason:     agentSessionNoCapacityMessage,
			wantReason: agentSessionNoCapacityMessage,
		},
		{
			name:       "anything else gets one true sentence",
			message:    "create repo api token: database unavailable",
			reason:     agentSessionStartFailureMessage,
			wantReason: agentSessionStartFailureMessage,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var recordedReason string
			var events []AgentSessionEvent
			dq := &mockAgentDispatchQuerier{
				updateAgentSessionTerminalStatusFn: func(_ context.Context, arg db.UpdateAgentSessionTerminalStatusParams) (db.AgentSession, error) {
					session := sampleDBAgentSession(arg.ID, 101, 9, "agent")
					session.WorkflowRunID = pgtype.Int8{Int64: runID, Valid: true}
					session.Status = arg.Status
					session.Metadata = json.RawMessage(`{}`)
					return session, nil
				},
				recordAgentSessionFailureReasonFn: func(_ context.Context, id, reason string) (db.AgentSession, bool, error) {
					require.Equal(t, sessionID, id)
					recordedReason = reason
					session := sampleDBAgentSession(id, 101, 9, "agent")
					session.Status = "failed"
					session.Metadata = json.RawMessage(`{"failure_reason":` + mustJSONString(reason) + `}`)
					return session, true, nil
				},
			}
			svc := &AgentService{
				dispatchQ: dq,
				q: &mockAgentQuerier{
					listAgentMessagesFn: func(context.Context, db.ListAgentMessagesParams) ([]db.AgentMessage, error) {
						return nil, nil
					},
					notifyAgentSessionFn: func(_ context.Context, arg db.NotifyAgentSessionParams) error {
						var event AgentSessionEvent
						require.NoError(t, json.Unmarshal([]byte(arg.Payload), &event))
						events = append(events, event)
						return nil
					},
				},
				logStore:       &mockAgentLogStore{},
				sessionMetrics: &mockAgentSessionMetricsObserver{},
			}

			svc.markAgentDispatchInfrastructureFailedWithReason(
				context.Background(), 0, 20, runID, sessionID, tc.message, tc.reason)

			require.Equal(t, tc.wantReason, recordedReason,
				"the session row must carry the sentence its owner reads")
			require.Len(t, events, 1)
			require.Equal(t, "failed", events[0].Status)
			require.Equal(t, tc.wantReason, events[0].Reason,
				"a watching client must not have to re-poll to learn the reason")
			require.NotContains(t, events[0].Reason, "microsandbox",
				"the provider's error chain stays on the operator side")
		})
	}
}

// The old call site keeps working and now carries the generic sentence rather
// than nothing at all.
func TestMarkAgentDispatchInfrastructureFailedDefaultsToAReason(t *testing.T) {
	var recorded string
	dq := &mockAgentDispatchQuerier{
		recordAgentSessionFailureReasonFn: func(_ context.Context, _, reason string) (db.AgentSession, bool, error) {
			recorded = reason
			return db.AgentSession{}, false, nil
		},
	}
	svc := &AgentService{
		dispatchQ:      dq,
		q:              &mockAgentQuerier{},
		logStore:       &mockAgentLogStore{},
		sessionMetrics: &mockAgentSessionMetricsObserver{},
	}
	svc.markAgentDispatchInfrastructureFailed(context.Background(), 0, 20, 5,
		"cccccccc-cccc-4ccc-8ccc-cccccccccccc", "dispatch failed")
	require.Equal(t, agentSessionStartFailureMessage, recorded)
}

func TestAgentSessionFailureReasonForError(t *testing.T) {
	noCapacity := &pkgerrors.APIError{
		Status:  http.StatusServiceUnavailable,
		Code:    pkgerrors.CodeNoCapacity,
		Message: "no healthy Microsandbox worker has sufficient capacity",
	}
	require.Equal(t, agentSessionNoCapacityMessage, agentSessionFailureReasonForError(noCapacity))
	require.Equal(t, agentSessionStartFailureMessage,
		agentSessionFailureReasonForError(pkgerrors.Internal("create sandbox: connection refused")))
}

func TestAgentSessionFailureReasonFromMetadata(t *testing.T) {
	require.Equal(t, "", agentSessionFailureReasonFromMetadata(nil))
	require.Equal(t, "", agentSessionFailureReasonFromMetadata(json.RawMessage(`{}`)))
	require.Equal(t, "", agentSessionFailureReasonFromMetadata(json.RawMessage(`{"failure_reason":7}`)))
	require.Equal(t, "", agentSessionFailureReasonFromMetadata(json.RawMessage(`not json`)))
	require.Equal(t, "the pool is full",
		agentSessionFailureReasonFromMetadata(json.RawMessage(`{"failure_reason":" the pool is full "}`)))
}

func mustJSONString(s string) string {
	encoded, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	return string(encoded)
}

// A dispatch that fails before its task runs must still put one line on the
// run the person is looking at. Production run 17463 (2026-10-14 07:30Z)
// failed in 551 ms with `logs: []`, no output and no error field anywhere a
// product route returns.
func TestAgentDispatchFailureWritesOneLineToTheRunLog(t *testing.T) {
	var entries []db.InsertWorkflowRunLogNextSequenceParams
	var announced int
	dq := &mockAgentDispatchQuerier{
		insertWorkflowRunLogFn: func(_ context.Context, arg db.InsertWorkflowRunLogNextSequenceParams) (db.InsertWorkflowRunLogNextSequenceRow, error) {
			entries = append(entries, arg)
			return db.InsertWorkflowRunLogNextSequenceRow{ID: 9, WorkflowRunID: arg.WorkflowRunID, WorkflowStepID: arg.WorkflowStepID, Sequence: 1, Stream: arg.Stream, Entry: arg.Entry}, nil
		},
		notifyWorkflowRunLogFn: func(context.Context, db.NotifyWorkflowRunLogParams) error {
			announced++
			return nil
		},
	}
	svc := &AgentService{
		dispatchQ:      dq,
		q:              &mockAgentQuerier{},
		logStore:       &mockAgentLogStore{},
		sessionMetrics: &mockAgentSessionMetricsObserver{},
	}

	svc.markAgentDispatchInfrastructureFailedWithReason(context.Background(), 0, 20, 17463,
		"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
		"create sandbox: microsandbox api returned status 503 (no_capacity)",
		agentSessionNoCapacityMessage)

	require.Len(t, entries, 1)
	require.Equal(t, int64(17463), entries[0].WorkflowRunID)
	require.Equal(t, int64(20), entries[0].WorkflowStepID)
	require.Equal(t, "system", entries[0].Stream)
	require.Equal(t, agentSessionNoCapacityMessage, entries[0].Entry)
	require.NotContains(t, entries[0].Entry, "microsandbox",
		"the run log carries product vocabulary, not the provider's chain")
	require.Equal(t, 1, announced, "a watching Steps view must not have to refetch")
}

// A dispatch refused because this deployment has no agent loop must not tell
// the person to try again: retrying never helps until an entrypoint exists.
func TestRetiredAgentLoopRefusalDoesNotPromiseARetry(t *testing.T) {
	require.NotContains(t, agentSessionLoopRetiredMessage, "try again")
	require.NotEqual(t, agentSessionStartFailureMessage, agentSessionLoopRetiredMessage)
	require.Contains(t, agentSessionLoopRetiredMessage, "not available on this deployment")
}

// A taskless failure still has a step, which is where the line goes. A run or
// step that does not exist is skipped rather than written to run 0.
func TestAgentDispatchFailureLogSkipsWhenThereIsNoRunOrStep(t *testing.T) {
	var inserts int
	dq := &mockAgentDispatchQuerier{
		insertWorkflowRunLogFn: func(context.Context, db.InsertWorkflowRunLogNextSequenceParams) (db.InsertWorkflowRunLogNextSequenceRow, error) {
			inserts++
			return db.InsertWorkflowRunLogNextSequenceRow{}, nil
		},
	}
	svc := &AgentService{dispatchQ: dq}
	svc.appendAgentDispatchFailureLog(context.Background(), 0, 20, "reason")
	svc.appendAgentDispatchFailureLog(context.Background(), 17463, 0, "reason")
	svc.appendAgentDispatchFailureLog(context.Background(), 17463, 20, "   ")
	require.Zero(t, inserts)
}

// transactionalAgentDispatchQuerier is the dispatch querier a production
// *db.Queries is: it can start a transaction.
type transactionalAgentDispatchQuerier struct {
	*mockAgentDispatchQuerier
	tx       *workflowSandboxLogTx
	beginErr error
}

func (q *transactionalAgentDispatchQuerier) BeginTx(context.Context) (pgx.Tx, error) {
	if q.beginErr != nil {
		return nil, q.beginErr
	}
	return q.tx, nil
}

// workflow_run_logs is UNIQUE (workflow_run_id, sequence) and the insert reads
// MAX(sequence)+1, so this line must be allocated under the same advisory lock
// every other appender takes. The concurrent writer is not hypothetical: the
// sandbox scheduler reports the provisioning failure that caused the dispatch
// failure on the same run, and the loser of the race is the only line the
// Steps view would have had.
func TestAgentDispatchFailureLogLocksTheRunSequenceAndNotifiesAfterCommit(t *testing.T) {
	base := &mockAgentDispatchQuerier{}
	fakeTx := &workflowSandboxLogTx{}
	fakeTx.queryRowFn = func(_ context.Context, sql string, _ ...any) pgx.Row {
		require.Len(t, fakeTx.execCalls, 1, "the sequence lock must precede the insert")
		require.Contains(t, fakeTx.execCalls[0], "pg_advisory_xact_lock")
		require.Equal(t, []any{int64(17463)}, fakeTx.execArgs[0])
		require.Contains(t, sql, "-- name: InsertWorkflowRunLogNextSequence")
		return workflowSandboxLogTxRow{values: []any{
			int64(91), int64(17463), int64(20), int64(4), "system", agentSessionNoCapacityMessage, time.Now().UTC(),
		}}
	}
	base.insertWorkflowRunLogFn = func(context.Context, db.InsertWorkflowRunLogNextSequenceParams) (db.InsertWorkflowRunLogNextSequenceRow, error) {
		t.Error("the transaction path must insert through db.New(tx), not the outer querier")
		return db.InsertWorkflowRunLogNextSequenceRow{}, nil
	}
	var notified []db.NotifyWorkflowRunLogParams
	base.notifyWorkflowRunLogFn = func(_ context.Context, arg db.NotifyWorkflowRunLogParams) error {
		require.True(t, fakeTx.commitCalled, "no watcher is told about a row that may roll back")
		notified = append(notified, arg)
		return nil
	}
	svc := &AgentService{dispatchQ: &transactionalAgentDispatchQuerier{mockAgentDispatchQuerier: base, tx: fakeTx}}

	svc.appendAgentDispatchFailureLog(context.Background(), 17463, 20, agentSessionNoCapacityMessage)

	require.True(t, fakeTx.commitCalled)
	require.Len(t, notified, 1)
	require.Contains(t, notified[0].Payload, `"sequence":4`)
}

// A transaction that cannot even begin must not publish a notification for a
// log row that was never written.
func TestAgentDispatchFailureLogDoesNotAnnounceWhatItCouldNotWrite(t *testing.T) {
	base := &mockAgentDispatchQuerier{}
	var notified int
	base.notifyWorkflowRunLogFn = func(context.Context, db.NotifyWorkflowRunLogParams) error {
		notified++
		return nil
	}
	svc := &AgentService{dispatchQ: &transactionalAgentDispatchQuerier{
		mockAgentDispatchQuerier: base, beginErr: errors.New("pool exhausted"),
	}}

	svc.appendAgentDispatchFailureLog(context.Background(), 17463, 20, agentSessionNoCapacityMessage)

	require.Zero(t, notified)
}

// PostgreSQL TEXT rejects NUL and invalid UTF-8, and a rejected insert loses
// the only line the run has. Every other appender scrubs; so does this one.
func TestAgentDispatchFailureLogStoresAStorableEntry(t *testing.T) {
	var entries []db.InsertWorkflowRunLogNextSequenceParams
	dq := &mockAgentDispatchQuerier{
		insertWorkflowRunLogFn: func(_ context.Context, arg db.InsertWorkflowRunLogNextSequenceParams) (db.InsertWorkflowRunLogNextSequenceRow, error) {
			entries = append(entries, arg)
			return db.InsertWorkflowRunLogNextSequenceRow{ID: 1, Sequence: 1, Stream: arg.Stream, Entry: arg.Entry}, nil
		},
	}
	svc := &AgentService{dispatchQ: dq}

	svc.appendAgentDispatchFailureLog(context.Background(), 17463, 20, "refused\x00 by the pool")

	require.Len(t, entries, 1)
	require.NotContains(t, entries[0].Entry, "\x00")
}

// After RFD-004 a repository has one branch machine and every turn runs on it,
// so the second turn of any fan-out meets the first turn's in-flight
// provision: `workspaceProvisionInProgress`, a deliberately retryable
// GuestNotReady 503 wrapped by CreateAgentWorkspace. It fell through to the
// generic sentence, so a person starting a second turn — the ordinary case
// while a machine wakes — was told only that the agent "could not be started".
//
// Production 2026-10-14 13:26Z, API 2b14f97f: four turns dispatched together on
// repository 112554 failed in 6-12 s, all four with the generic sentence and
// all four caused by
//
//	create agent workspace: workspace provisioning is owned by another API:
//	workspace is provisioning; retry shortly
//
// smithers#3886.
func TestAFanOutTurnSaysTheMachineIsStillStarting(t *testing.T) {
	inFlight := fmt.Errorf("create agent workspace: %w", workspaceProvisionInProgress(nil))
	require.Equal(t, agentSessionMachineStartingMessage, agentSessionFailureReasonForError(inFlight),
		"a turn refused because the branch's machine is already starting says so; waiting is the action that helps")

	// The two sentences that were already distinguished stay exactly as they were.
	require.NotEqual(t, agentSessionMachineStartingMessage, agentSessionStartFailureMessage)
	require.Equal(t, agentSessionNoCapacityMessage, agentSessionFailureReasonForError(
		&pkgerrors.APIError{Status: http.StatusServiceUnavailable, Code: pkgerrors.CodeNoCapacity, Message: "no healthy Microsandbox worker has sufficient capacity"}))
	require.Equal(t, agentSessionStartFailureMessage,
		agentSessionFailureReasonForError(pkgerrors.Internal("create sandbox: connection refused")))
}

// A branch machine can vanish under a row that still reads `running`: the
// controller's placement store loses the sandbox, so every later inspect
// answers 404 not_found and the workspace's recovery error is
// CodeWorkspaceVMMissing. That error reached the fallback sentence, which
// promises a retry that can never work — the machine is gone and only a fresh
// box brings one back.
//
// Production 2026-10-14 14:49Z, API e227f1ae / public 46187b04: repository
// 112645's box 8bdcfa88 read `running` with vm_id 8bdcfa88 while the
// controller answered
//
//	create agent workspace: inspect workspace runtime: microsandbox api
//	returned status 404 (not_found): sandbox resource was not found
//
// and the turn said only "The agent could not be started. Nothing ran; try
// again in a moment." Four further turns on that repository said the same.
func TestATurnOnAVanishedMachineSaysTheMachineIsGone(t *testing.T) {
	missing := fmt.Errorf("create agent workspace: %w",
		pkgerrors.New(pkgerrors.CodeWorkspaceVMMissing,
			"workspace VM no longer exists; run `smithers workspace create` to provision a fresh workspace"))
	require.Equal(t, agentSessionMachineMissingMessage, agentSessionFailureReasonForError(missing),
		"a turn whose machine no longer exists says so; a fresh box is the action that helps")
	require.NotContains(t, agentSessionMachineMissingMessage, "try again in a moment",
		"retrying cannot recreate a machine the fleet has lost")
	require.NotEqual(t, agentSessionMachineMissingMessage, agentSessionStartFailureMessage)
	require.NotEqual(t, agentSessionMachineMissingMessage, agentSessionMachineStartingMessage)

	// A machine that is merely still starting, a full pool and everything else
	// keep the sentences they already had.
	require.Equal(t, agentSessionMachineStartingMessage, agentSessionFailureReasonForError(
		fmt.Errorf("create agent workspace: %w", workspaceProvisionInProgress(nil))))
	require.Equal(t, agentSessionNoCapacityMessage, agentSessionFailureReasonForError(
		&pkgerrors.APIError{Status: http.StatusServiceUnavailable, Code: pkgerrors.CodeNoCapacity, Message: "full"}))
	require.Equal(t, agentSessionStartFailureMessage,
		agentSessionFailureReasonForError(pkgerrors.Internal("create sandbox: connection refused")))
}
