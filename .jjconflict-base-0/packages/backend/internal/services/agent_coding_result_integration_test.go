package services

import (
	"encoding/json"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

func TestLatestCodingResult(t *testing.T) {
	s, pool, update := codingCompletionFixture(t)
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
	session, err := db.New(pool).GetAgentSession(t.Context(), projection.SessionID)
	require.NoError(t, err)
	_, err = s.LatestCodingResult(t.Context(), session.RepositoryID, session.ID, nil)
	require.ErrorIs(t, err, ErrNoCodingResult)
	_, err = s.LatestCodingResult(t.Context(), session.RepositoryID, "00000000-0000-0000-0000-000000000001", nil)
	require.ErrorIs(t, err, ErrNoCodingResult)
	_, err = s.LatestCodingResult(t.Context(), session.RepositoryID, "missing-session", nil)
	require.ErrorIs(t, err, ErrNoCodingResult)
	raw := json.RawMessage(`{"head_commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head_change_id":"change-one","test_receipt":{"command":"npm run test","exit_code":0,"commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","finished_at":"2026-10-18T22:00:00Z","output_tail":"","tests_run":0}}`)
	reply, err := s.AppendMessage(t.Context(), session.ID, "assistant", []db.CreateAgentPartParams{{PartType: "coding_result", Content: raw}})
	require.NoError(t, err)
	_, err = s.AppendMessage(t.Context(), session.ID, "assistant", []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"later"}`)}})
	require.NoError(t, err)
	result, err := s.LatestCodingResult(t.Context(), session.RepositoryID, session.ID, nil)
	require.NoError(t, err)
	require.Equal(t, reply.ID, result.ReplyID)
	require.True(t, result.Tested())
	require.False(t, result.Passed(), "zero tests never pass")
	result.TestReceipt.TestsRun = nil
	require.True(t, result.Passed(), "unknown test count permits success")
	result.TestReceipt.Commit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	require.False(t, result.Tested())
	require.False(t, result.Passed())
	_, err = s.LatestCodingResult(t.Context(), session.RepositoryID+1, session.ID, &reply.ID)
	require.ErrorIs(t, err, ErrNoCodingResult)
	result, err = s.LatestCodingResult(t.Context(), session.RepositoryID, session.ID, &reply.ID)
	require.NoError(t, err)
	require.Equal(t, "change-one", *result.HeadChangeID)
}

func TestSessionReadIncludesAgentBoxRunAndFailure(t *testing.T) {
	s, pool, update := codingCompletionFixture(t)
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
	var payer int64
	require.NoError(t, pool.QueryRow(t.Context(), `INSERT INTO users(username,lower_username) VALUES ('payer','payer') RETURNING id`).Scan(&payer))
	_, err := pool.Exec(t.Context(), `UPDATE workspaces SET user_id=$1 WHERE id=(SELECT workspace_id FROM agent_sessions WHERE id=$2)`, payer, projection.SessionID)
	require.NoError(t, err)

	_, err = pool.Exec(t.Context(), `UPDATE agent_sessions SET status='failed', metadata='{"failure_reason_code":"flow_host_too_large","failure_reason":"The coding host exceeds the staging limit.","failure_retryable":false}' WHERE id=$1`, projection.SessionID)
	require.NoError(t, err)
	session, err := s.GetSession(t.Context(), projection.SessionID)
	require.NoError(t, err)
	require.NotNil(t, session.Workspace)
	require.Equal(t, "coding-completion", session.Workspace.Name)
	require.Equal(t, session.WorkspaceID, session.Workspace.ID)
	require.NotNil(t, session.Run)
	require.Equal(t, projection.WorkflowRunID, session.Run.ID)
	require.Equal(t, "running", session.Run.Status)
	require.Equal(t, "flow_host_too_large", *session.ReasonCode)
	require.Equal(t, "The coding host exceeds the staging limit.", *session.Reason)
	require.False(t, session.Retryable)
}

func TestSessionReadLegacyMetadataRemainsReadable(t *testing.T) {
	for _, raw := range []string{`{"failure_reason_code":42,"failure_reason":{},"failure_retryable":"yes"}`, `[]`, `null`, `{}`} {
		response := AgentSessionResponse{}
		require.NoError(t, readAgentSessionFailure(json.RawMessage(raw), &response))
		require.Nil(t, response.ReasonCode)
		require.Nil(t, response.Reason)
		require.False(t, response.Retryable)
	}
}

func TestSessionReadRunFields(t *testing.T) {
	for _, tc := range []struct {
		name, metadata, status string
		started, finished      any
	}{
		{"absent", `{}`, "queued", nil, nil},
		{"running", `{"model":"cerebras:qwen-3.8-27b"}`, "running", "2026-10-18T20:00:00Z", nil},
		{"finished", `{"model":"openai:gpt-6.1"}`, "success", "2026-10-18T20:00:00Z", "2026-10-18T20:01:00Z"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, pool, update := codingCompletionFixture(t)
			var projection agentFlowProjection
			require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
			_, err := pool.Exec(t.Context(), `UPDATE agent_sessions SET metadata=$1 WHERE id=$2`, tc.metadata, projection.SessionID)
			require.NoError(t, err)
			_, err = pool.Exec(t.Context(), `UPDATE workflow_runs SET status=$1,started_at=$2::text::timestamptz,completed_at=$3::text::timestamptz WHERE id=$4`, tc.status, tc.started, tc.finished, projection.WorkflowRunID)
			require.NoError(t, err)
			session, err := s.GetSession(t.Context(), projection.SessionID)
			require.NoError(t, err)
			raw, err := json.Marshal(session)
			require.NoError(t, err)
			var body map[string]any
			require.NoError(t, json.Unmarshal(raw, &body))
			run := body["run"].(map[string]any)
			require.Equal(t, float64(projection.WorkflowRunID), run["id"])
			require.Equal(t, tc.status, run["status"])
			for _, key := range []string{"model", "started_at", "finished_at"} {
				require.Contains(t, run, key)
			}
			var metadata map[string]any
			require.NoError(t, json.Unmarshal([]byte(tc.metadata), &metadata))
			require.Equal(t, metadata["model"], run["model"])
			require.Equal(t, tc.started, run["started_at"])
			require.Equal(t, tc.finished, run["finished_at"])
		})
	}
}

func TestSessionReadLaneBFailureCodes(t *testing.T) {
	s, pool, update := codingCompletionFixture(t)
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
	for _, code := range []string{"flow_host_too_large", "flow_host_unavailable", "box_unavailable", "box_starting", "box_bootstrap_timeout", "box_missing", "box_failed", "box_stopped", "model_unavailable", "model_rate_limited", "out_of_credit", "turn_failed", "turn_timed_out", "dispatch_failed", "agents_unavailable"} {
		metadata, err := json.Marshal(map[string]any{"failure_reason_code": code, "failure_reason": "Try again.", "failure_retryable": true, "model": "provider:model"})
		require.NoError(t, err)
		_, err = pool.Exec(t.Context(), `UPDATE agent_sessions SET metadata=$1,status='failed' WHERE id=$2`, metadata, projection.SessionID)
		require.NoError(t, err)
		session, err := s.GetSession(t.Context(), projection.SessionID)
		require.NoError(t, err)
		require.Equal(t, code, *session.ReasonCode)
		require.Equal(t, "Try again.", *session.Reason)
		require.True(t, session.Retryable)
	}
}
