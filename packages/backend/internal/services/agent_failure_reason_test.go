package services

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

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
