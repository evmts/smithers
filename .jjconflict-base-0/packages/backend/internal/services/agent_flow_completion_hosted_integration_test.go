package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// The hosted completion shape (prod 2026-10-19, session b34b9bd1, run-18065):
// the bridge launched dispatch:<op> and the coding flow, a child execution of
// it, echoes its own 64-hex execution id as runId. Every such reply was
// refused, so no hosted turn ever completed. It now completes through
// completeCodingTurn with its coding_result; a reply naming the right turn
// still cannot arrive through another binding or run, or from a prior turn.
func TestHostedCodingCompletionAcceptsTheChildExecutionID(t *testing.T) {
	const dispatch = "dispatch:43b468ed-b2b4-493e-aafa-6f2a1141b500"
	const execution = "a389d9117b55e397df4f33e47adaed106967d3e59b6a22ebeef84e7187a9e5b9"
	head := strings.Repeat("b", 40)
	observer := fixedCodingTurns{result: CodingResult{HeadCommit: &head, TestNotRun: &CodingTestNotRun{ReasonCode: codingTestNotRunNoDeclaredTest, Reason: "the repository declares no test"}}}
	hosted := func(t *testing.T) (*AgentService, *pgxpool.Pool, agentFlowProjection, func(turn int64) (string, error)) {
		service, pool, update := codingCompletionFixture(t)
		service.SetCodingTurnObserver(observer)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		project := func(turn int64) (string, error) {
			output := fmt.Sprintf(`{"turnId":"run-%d","runId":%q,"messages":[{"ordinal":0,"role":"assistant","content":"done"}]}`, turn, execution)
			update.Checkpoint.RunID, update.Checkpoint.Run.RunID, update.Checkpoint.Run.FinalOutput = dispatch, dispatch, &output
			return output, service.ProjectFlowRuntime(t.Context(), update)
		}
		return service, pool, projection, project
	}

	t.Run("prod shape completes with its coding_result", func(t *testing.T) {
		service, pool, projection, project := hosted(t)
		_, err := project(projection.WorkflowRunID)
		require.NoError(t, err)
		session, err := db.New(pool).GetAgentSession(t.Context(), projection.SessionID)
		require.NoError(t, err)
		require.Equal(t, "completed", session.Status)
		messages, err := service.ListMessages(t.Context(), projection.SessionID, 1, 100)
		require.NoError(t, err)
		require.Len(t, messages, 2, "the request and the reply")
		var results int
		require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM agent_parts WHERE session_id=$1 AND part_type='coding_result'`, projection.SessionID).Scan(&results))
		require.Equal(t, 1, results, "B2's coding_result rides the completion")
	})

	t.Run("a prior turn's reply is refused", func(t *testing.T) {
		_, pool, projection, project := hosted(t)
		_, err := project(projection.WorkflowRunID - 1)
		require.ErrorIs(t, err, errCodingTurnIdentity)
		session, err := db.New(pool).GetAgentSession(t.Context(), projection.SessionID)
		require.NoError(t, err)
		require.Equal(t, "active", session.Status)
	})

	t.Run("the right turn through another run is refused", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		service.SetCodingTurnObserver(observer)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		output := fmt.Sprintf(`{"turnId":"run-%d","runId":%q,"messages":[{"role":"assistant","content":"done"}]}`, projection.WorkflowRunID, execution)
		// The page read is not the launched run's own: the server refuses
		// output from any run but the one it started.
		update.Checkpoint.RunID, update.Checkpoint.Run.RunID, update.Checkpoint.Run.FinalOutput = dispatch, execution, &output
		require.ErrorIs(t, service.ProjectFlowRuntime(t.Context(), update), errCodingRunIdentity)
		session, err := db.New(pool).GetAgentSession(t.Context(), projection.SessionID)
		require.NoError(t, err)
		require.Equal(t, "active", session.Status)
	})

	t.Run("the right turn through another binding is refused", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		service.SetCodingTurnObserver(observer)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		output := fmt.Sprintf(`{"turnId":"run-%d","runId":%q,"messages":[{"role":"assistant","content":"done"}]}`, projection.WorkflowRunID, execution)
		update.Checkpoint.RunID, update.Checkpoint.Run.RunID, update.Checkpoint.Run.FinalOutput = dispatch, dispatch, &output
		update.Checkpoint.Target.BindingID = "another-session"
		require.ErrorIs(t, service.ProjectFlowRuntime(t.Context(), update), errAgentFlowNotOwner)
		session, err := db.New(pool).GetAgentSession(t.Context(), projection.SessionID)
		require.NoError(t, err)
		require.Equal(t, "active", session.Status)
	})
}
