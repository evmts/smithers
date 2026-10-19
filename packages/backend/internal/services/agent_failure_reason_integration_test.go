package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// sessionReadFailure is the session read as a client decodes it.
type sessionReadFailure struct {
	Status     string  `json:"status"`
	ReasonCode *string `json:"reason_code"`
	Reason     *string `json:"reason"`
	Retryable  *bool   `json:"retryable"`
}

func readSessionFailure(t *testing.T, service *AgentService, sessionID string) sessionReadFailure {
	t.Helper()
	response, err := service.GetSession(context.Background(), sessionID)
	require.NoError(t, err)
	encoded, err := json.Marshal(response)
	require.NoError(t, err)
	var read sessionReadFailure
	require.NoError(t, json.Unmarshal(encoded, &read))
	var fields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(encoded, &fields))
	for _, key := range []string{"status", "reason_code", "reason", "retryable"} {
		require.Contains(t, fields, key, "the session read always answers %s", key)
	}
	return read
}

// lastReplyText is the text of the transcript's last message, and its role.
func lastReplyText(t *testing.T, service *AgentService, sessionID string) (string, string, int) {
	t.Helper()
	messages, err := service.ListMessages(context.Background(), sessionID, 1, 100)
	require.NoError(t, err)
	require.NotEmpty(t, messages)
	last := messages[len(messages)-1]
	require.Len(t, last.Parts, 1)
	encoded, err := json.Marshal(last.Parts[0].Content)
	require.NoError(t, err)
	var text struct {
		Value string `json:"value"`
	}
	require.NoError(t, json.Unmarshal(encoded, &text))
	return last.Role, text.Value, len(messages)
}

// Production 2026-10-18 21:50Z, hosted P0 spike session cbd14a65: the coding
// host was refused staging (58,987,479 bytes over 50,331,648), the session
// went `failed` with metadata {} and no reply, and the person saw a bare
// "failed". Every failure class now leaves a typed reason on the session read
// and ends the turn with that sentence; a success leaves none.
func TestAFailedSessionSaysWhyAndEndsItsTurnWithTheSentence(t *testing.T) {
	type expectation struct {
		code      string
		retryable bool
		reason    string
	}
	flow := func(checkpoint string) func(*testing.T, *AgentService, flowdispatch.ProjectionUpdate) {
		return func(t *testing.T, service *AgentService, update flowdispatch.ProjectionUpdate) {
			t.Helper()
			update.State = jobs.StateFailed
			update.Checkpoint.Run = nil
			require.NoError(t, json.Unmarshal([]byte(checkpoint), &update.Checkpoint))
			require.NoError(t, service.ProjectFlowRuntime(context.Background(), update))
		}
	}
	dispatch := func(err error) func(*testing.T, *AgentService, flowdispatch.ProjectionUpdate) {
		return func(t *testing.T, service *AgentService, update flowdispatch.ProjectionUpdate) {
			t.Helper()
			ctx := context.Background()
			var projection agentFlowProjection
			require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
			q := service.dispatchQ.(*db.Queries)
			run, getErr := q.GetWorkflowRunByRunID(ctx, projection.WorkflowRunID)
			require.NoError(t, getErr)
			task, getErr := q.GetWorkflowTaskByRunID(ctx, projection.WorkflowRunID)
			require.NoError(t, getErr)
			session, getErr := q.GetAgentSession(ctx, projection.SessionID)
			require.NoError(t, getErr)
			d := &agentDispatch{svc: service, ctx: ctx, run: run, task: task, step: db.WorkflowStep{ID: task.WorkflowStepID},
				input: DispatchAgentRunInput{SessionID: session.ID, RepositoryID: session.RepositoryID, UserID: session.UserID}}
			require.Error(t, d.markInfraFailedFromError("create agent workspace", err))
		}
	}
	for _, tc := range []struct {
		name string
		fail func(*testing.T, *AgentService, flowdispatch.ProjectionUpdate)
		want expectation
	}{
		{"the coding host is too large to stage", flow(`{"failureCode":"flow_host_too_large","failureDetail":"The coding host (56.3 MiB) exceeds the sandbox staging limit (48 MiB)."}`),
			expectation{"flow_host_too_large", false, "The coding host (56.3 MiB) exceeds the sandbox staging limit (48 MiB). Nothing ran, and trying again will not help."}},
		{"the coding host never started", flow(`{"failureCode":"runtime_start_exhausted"}`),
			expectation{"flow_host_unavailable", true, "The coding host did not start in the box. Nothing ran; try again in a moment."}},
		{"the box never finished setting up", flow(`{"failureCode":"workspace_initializing"}`),
			expectation{"box_bootstrap_timeout", true, "The box did not finish starting in time. Nothing ran; try again in a moment."}},
		{"the model did not answer", flow(`{"run":{"runId":"host","flowId":"coding/dispatch","status":"failed","failureFault":"dependency","failureTag":"flows/model/ModelError/provider_internal"}}`),
			expectation{"model_unavailable", true, "The model did not answer. Try again in a moment."}},
		{"the model is rate limited", flow(`{"run":{"runId":"host","flowId":"coding/dispatch","status":"failed","failureFault":"wait","failureTag":"flows/model/ModelError/rate_limited"}}`),
			expectation{"model_rate_limited", true, "The model is rate limited right now. Try again in a moment."}},
		{"the account is out of credit", flow(`{"run":{"runId":"host","flowId":"coding/dispatch","status":"failed","failureFault":"user","failureTag":"flows/model/ModelError/out_of_credit"}}`),
			expectation{"out_of_credit", false, "This account is out of model credit. Add credit, then try again."}},
		{"the turn failed in the host", flow(`{"run":{"runId":"host","flowId":"coding/dispatch","status":"failed","failureFault":"factory","failureTag":"/harness/HarnessError/completion_incomplete"}}`),
			expectation{"turn_failed", true, "The agent stopped before it finished this turn. Try again."}},
		{"the pool had no room", dispatch(&pkgerrors.APIError{Status: http.StatusServiceUnavailable, Code: pkgerrors.CodeNoCapacity, Message: "no healthy worker"}),
			expectation{"box_unavailable", true, agentSessionNoCapacityMessage}},
		{"the branch's box is stopped", dispatch(fmt.Errorf("join: %w", branchMachineCompatible(db.Workspace{Status: "stopped", UserID: 7}, db.CreateWorkspaceParams{}, 7))),
			expectation{"box_stopped", false, agentSessionBranchMachineStoppedMessage}},
		{"the dispatch failed otherwise", dispatch(pkgerrors.Internal("create repo api token: database unavailable")),
			expectation{"dispatch_failed", true, agentSessionStartFailureMessage}},
		{"the turn ran past its time limit", func(t *testing.T, service *AgentService, update flowdispatch.ProjectionUpdate) {
			var projection agentFlowProjection
			require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
			q := service.dispatchQ.(*db.Queries)
			_, err := q.UpdateAgentSessionStartedAt(context.Background(), db.UpdateAgentSessionStartedAtParams{ID: projection.SessionID,
				StartedAt: pgtype.Timestamptz{Time: time.Now().UTC().Add(-16*time.Minute - 5*time.Second), Valid: true}})
			require.NoError(t, err)
			session, err := q.GetAgentSession(context.Background(), projection.SessionID)
			require.NoError(t, err)
			require.NoError(t, service.reapExpiredSession(context.Background(), session))
		}, expectation{"turn_timed_out", true, "This turn stopped after 16 minutes without finishing."}},
		{"the box stopped the turn at a time limit", flow(`{"run":{"runId":"host","flowId":"coding/dispatch","status":"failed","failureFault":"policy","failureTag":"flows/agent/Timeout"}}`),
			expectation{"turn_timed_out", true, "This turn ran past a time limit and was stopped."}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service, _, update := codingCompletionFixture(t)
			var projection agentFlowProjection
			require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))

			tc.fail(t, service, update)

			read := readSessionFailure(t, service, projection.SessionID)
			require.NotEqual(t, "active", read.Status)
			require.NotNil(t, read.ReasonCode, "a failed session never answers with only its status")
			require.Equal(t, tc.want.code, *read.ReasonCode)
			require.NotNil(t, read.Reason)
			require.Equal(t, tc.want.reason, *read.Reason)
			require.NotNil(t, read.Retryable)
			require.Equal(t, tc.want.retryable, *read.Retryable)
			require.Contains(t, agentSessionFailureCodes, *read.ReasonCode, "codes come from the closed vocabulary")

			role, text, count := lastReplyText(t, service, projection.SessionID)
			require.Equal(t, "assistant", role, "the turn ends with a reply, not silence")
			require.Equal(t, tc.want.reason, text, "the final reply is the session's sentence")
			require.Equal(t, 2, count, "the request and exactly one failure reply")
		})
	}

	t.Run("a success carries none", func(t *testing.T) {
		service, _, update := codingCompletionFixture(t)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		require.NoError(t, service.ProjectFlowRuntime(context.Background(), update))
		read := readSessionFailure(t, service, projection.SessionID)
		require.Equal(t, "completed", read.Status)
		require.Nil(t, read.ReasonCode)
		require.Nil(t, read.Reason)
		require.NotNil(t, read.Retryable)
		require.False(t, *read.Retryable)
		_, text, count := lastReplyText(t, service, projection.SessionID)
		require.Equal(t, "two", text, "the agent's own last reply ends the turn")
		require.Equal(t, 3, count)
	})

	t.Run("a replayed failure records one reason and one reply", func(t *testing.T) {
		service, _, update := codingCompletionFixture(t)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		fail := flow(`{"failureCode":"runtime_start_exhausted"}`)
		fail(t, service, update)
		fail(t, service, update)
		_, _, count := lastReplyText(t, service, projection.SessionID)
		require.Equal(t, 2, count)
		q := service.dispatchQ.(*db.Queries)
		recorded, ok, err := q.RecordAgentSessionFailure(context.Background(), projection.SessionID,
			db.AgentSessionFailure{Code: agentFailureTurnFailed, Reason: "a second reason", Retryable: true})
		require.NoError(t, err)
		require.False(t, ok, "a recorded failure is never overwritten or repeated")
		require.Empty(t, recorded.Session.ID)
		read := readSessionFailure(t, service, projection.SessionID)
		require.Equal(t, "flow_host_unavailable", *read.ReasonCode)
	})

	t.Run("a retry that starts drops the previous attempt's reason", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		flow(`{"failureCode":"runtime_start_exhausted"}`)(t, service, update)
		q := db.New(pool)
		require.NoError(t, q.FailWorkflowRun(context.Background(), projection.WorkflowRunID))
		definition, err := q.UpsertAgentWorkflowDefinition(context.Background(), readSessionRepository(t, q, projection.SessionID))
		require.NoError(t, err)
		retry, err := q.CreateWorkflowRun(context.Background(), db.CreateWorkflowRunParams{
			RepositoryID: definition.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "queued",
			TriggerEvent: "agent_message", DispatchInputs: []byte(`{}`), ExecutionPlane: "agent",
		})
		require.NoError(t, err)
		claimed, err := q.ClaimAgentSessionForDispatch(context.Background(), projection.SessionID, retry.ID)
		require.NoError(t, err)
		require.True(t, claimed)
		read := readSessionFailure(t, service, projection.SessionID)
		require.Equal(t, "active", read.Status)
		require.Nil(t, read.ReasonCode)
		require.Nil(t, read.Reason)
		require.False(t, *read.Retryable)
	})
}

func readSessionRepository(t *testing.T, q *db.Queries, sessionID string) int64 {
	t.Helper()
	session, err := q.GetAgentSession(context.Background(), sessionID)
	require.NoError(t, err)
	return session.RepositoryID
}

// The status event repeats the typed reason, so a watching client learns why
// without re-reading the session.
func TestAFailedSessionStatusEventCarriesTheTypedReason(t *testing.T) {
	var events []AgentSessionEvent
	service := &AgentService{q: &mockAgentQuerier{notifyAgentSessionFn: func(_ context.Context, arg db.NotifyAgentSessionParams) error {
		var event AgentSessionEvent
		require.NoError(t, json.Unmarshal([]byte(arg.Payload), &event))
		events = append(events, event)
		return nil
	}}}
	service.notifyAgentSessionStatus(context.Background(), db.AgentSession{ID: "s", Status: "failed",
		Metadata: json.RawMessage(`{"failure_reason":"The model did not answer. Try again in a moment.","failure_reason_code":"model_unavailable","failure_retryable":true}`)})
	service.notifyAgentSessionStatus(context.Background(), db.AgentSession{ID: "s", Status: "completed", Metadata: json.RawMessage(`{}`),
		WorkflowRunID: pgtype.Int8{Int64: 1, Valid: true}})
	require.Len(t, events, 2)
	require.Equal(t, "model_unavailable", events[0].ReasonCode)
	require.Equal(t, "The model did not answer. Try again in a moment.", events[0].Reason)
	require.True(t, events[0].Retryable)
	encoded, err := json.Marshal(events[1])
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "reason", "a success carries no reason")
}

// sessionMetadataModel is metadata.model as the session read returns it: nil
// when absent.
func sessionMetadataModel(t *testing.T, service *AgentService, sessionID string) any {
	t.Helper()
	response, err := service.GetSession(context.Background(), sessionID)
	require.NoError(t, err)
	var metadata map[string]any
	if len(response.Metadata) > 0 {
		require.NoError(t, json.Unmarshal(response.Metadata, &metadata))
	}
	return metadata["model"]
}

// The run card names the model the turn actually used, never a fixed label
// (contract: lane B writes metadata.model when it dispatches the turn, beside
// metadata.failure_reason_code; lane A reads it from there).
func TestADispatchedTurnRecordsTheModelItUses(t *testing.T) {
	admit := func(t *testing.T, service *AgentService, update flowdispatch.ProjectionUpdate) {
		t.Helper()
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		session, err := service.dispatchQ.(*db.Queries).GetAgentSession(context.Background(), projection.SessionID)
		require.NoError(t, err)
		payload, err := json.Marshal(agentTaskPayload{MessageHistory: []agentTaskPayloadMessage{{Role: "user", Content: "add slugify"}}})
		require.NoError(t, err)
		service.flowDispatcher = &recordingAgentFlowDispatcher{}
		d := &agentDispatch{svc: service, ctx: context.Background(), payload: payload,
			input: DispatchAgentRunInput{SessionID: session.ID, RepositoryID: session.RepositoryID, UserID: session.UserID, RepoOwner: "o", RepoName: "r"}}
		d.run.ID, d.task.ID = projection.WorkflowRunID, projection.WorkflowTaskID
		require.NoError(t, d.admitCodingTurn())
	}

	t.Run("null before dispatch, the turn's model after", func(t *testing.T) {
		service, _, update := codingCompletionFixture(t)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		service.codingTurnModel = func(context.Context) (string, error) { return "cerebras:qwen-3.8-27b", nil }
		require.Nil(t, sessionMetadataModel(t, service, projection.SessionID), "no turn, no model")

		admit(t, service, update)

		require.Equal(t, "cerebras:qwen-3.8-27b", sessionMetadataModel(t, service, projection.SessionID))
		require.NoError(t, service.ProjectFlowRuntime(context.Background(), func() flowdispatch.ProjectionUpdate {
			failed := update
			failed.State, failed.Checkpoint.Run = jobs.StateFailed, nil
			failed.Checkpoint.FailureCode = "runtime_start_exhausted"
			return failed
		}()))
		read := readSessionFailure(t, service, projection.SessionID)
		require.Equal(t, "flow_host_unavailable", *read.ReasonCode)
		require.Equal(t, "cerebras:qwen-3.8-27b", sessionMetadataModel(t, service, projection.SessionID), "the failure keeps the model beside it")
	})

	t.Run("a deployment that names no model records none", func(t *testing.T) {
		service, _, update := codingCompletionFixture(t)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		service.codingTurnModel = func(context.Context) (string, error) { return "", nil }
		admit(t, service, update)
		require.Nil(t, sessionMetadataModel(t, service, projection.SessionID))
	})

	t.Run("the next turn's claim drops the last turn's model", func(t *testing.T) {
		service, pool, update := codingCompletionFixture(t)
		var projection agentFlowProjection
		require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
		service.codingTurnModel = func(context.Context) (string, error) { return "cerebras:qwen-3.8-27b", nil }
		admit(t, service, update)
		require.NoError(t, service.ProjectFlowRuntime(context.Background(), update))
		q := db.New(pool)
		definition, err := q.UpsertAgentWorkflowDefinition(context.Background(), readSessionRepository(t, q, projection.SessionID))
		require.NoError(t, err)
		next, err := q.CreateWorkflowRun(context.Background(), db.CreateWorkflowRunParams{
			RepositoryID: definition.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "queued",
			TriggerEvent: "agent_message", DispatchInputs: []byte(`{}`), ExecutionPlane: "agent",
		})
		require.NoError(t, err)
		claimed, err := q.ClaimAgentSessionForDispatch(context.Background(), projection.SessionID, next.ID)
		require.NoError(t, err)
		require.True(t, claimed)
		require.Nil(t, sessionMetadataModel(t, service, projection.SessionID), "null until the new turn writes its own")
	})
}
