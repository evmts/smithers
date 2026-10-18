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
	_, err := pool.Exec(t.Context(), `UPDATE agent_sessions SET status='failed', metadata='{"failure_reason_code":"flow_host_too_large","failure_reason":"The coding host exceeds the staging limit.","failure_retryable":false}' WHERE id=$1`, projection.SessionID)
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
