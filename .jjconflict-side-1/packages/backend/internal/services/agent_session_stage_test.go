package services

import (
	"encoding/json"
	"fmt"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestAgentSessionStage(t *testing.T) {
	s, input := newBoundaryMessageSession(t)
	read := func() map[string]any {
		session, err := s.GetSession(t.Context(), input.SessionID)
		require.NoError(t, err)
		raw, err := json.Marshal(session)
		require.NoError(t, err)
		var body map[string]any
		require.NoError(t, json.Unmarshal(raw, &body))
		return body
	}
	require.NotContains(t, read(), "stage")
	_, err := s.messageJobs.Admit(t.Context(), jobs.Admission{
		Scope: repositoryJobFlowScope(input.RepositoryID, input.UserID), Operation: "other", RequestID: "ahead",
		Payload: json.RawMessage(`{}`), EffectPolicy: jobs.EffectIdempotent,
	})
	require.NoError(t, err)
	messageID := appendBoundaryMessage(t, s, input)
	var accepted time.Time
	require.NoError(t, s.messagePool.QueryRow(t.Context(), `SELECT created_at FROM agent_messages WHERE id=$1`, messageID).Scan(&accepted))
	// A reused session start must not turn an accepted dispatch into started.
	_, err = s.messagePool.Exec(t.Context(), `UPDATE agent_sessions SET started_at=now()-interval '1 day' WHERE id=$1`, input.SessionID)
	require.NoError(t, err)
	body := read()
	require.Equal(t, "queued", body["stage"])
	parsed, err := time.Parse(time.RFC3339Nano, body["queued_at"].(string))
	require.NoError(t, err)
	require.True(t, accepted.Equal(parsed))
	require.Equal(t, float64(2), body["queue_position"])
	requestID := fmt.Sprintf("agent-message:%d", messageID)
	// A capacity backoff is still queued, even before its next attempt is due.
	_, err = s.messagePool.Exec(t.Context(), `UPDATE product_job_dispatches SET next_attempt_at=now()+interval '1 hour' WHERE operation_id=(SELECT id FROM product_job_requests WHERE request_id=$1)`, requestID)
	require.NoError(t, err)
	require.Equal(t, "queued", read()["stage"])
	_, err = s.messagePool.Exec(t.Context(), `UPDATE product_job_dispatches SET next_attempt_at=now() WHERE operation_id=(SELECT id FROM product_job_requests WHERE request_id=$1)`, requestID)
	require.NoError(t, err)
	op, err := s.messageJobs.GetByRequest(t.Context(), repositoryJobFlowScope(input.RepositoryID, input.UserID), agentMessageDispatchOperation, requestID)
	require.NoError(t, err)
	_, err = s.messageJobs.ClaimOperation(t.Context(), "stage-reader-test", time.Minute, op.ID)
	require.NoError(t, err)
	body = read()
	require.Equal(t, "started", body["stage"])
	require.NotContains(t, body, "queued_at")
	require.NotContains(t, body, "queue_position")
	for _, state := range []string{"completed", "failed", "cancelled", "uncertain"} {
		_, err = s.messagePool.Exec(t.Context(), `UPDATE product_job_requests SET state=$1,terminal_receipt='{}' WHERE request_id=$2`, state, requestID)
		require.NoError(t, err)
		body = read()
		require.NotContains(t, body, "stage")
		require.NotContains(t, body, "queued_at")
		require.NotContains(t, body, "queue_position")
	}
}
