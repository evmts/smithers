package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

func codingCompletionFixture(t *testing.T) (*AgentService, *pgxpool.Pool, flowdispatch.ProjectionUpdate) {
	t.Helper()
	pool := newProductTestPool(t)
	q := db.New(pool)
	ctx := t.Context()
	userID, repoID := setupTestUserAndRepo(t, pool)
	service := NewAgentServiceWithPool(q, pool, WithAgentDispatchQuerier(q))
	session, err := service.CreateSession(ctx, CreateAgentSessionInput{RepositoryID: repoID, UserID: userID, Title: "completion"})
	require.NoError(t, err)
	_, err = service.AppendMessage(ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"request"}`)}})
	require.NoError(t, err)
	def, err := q.UpsertAgentWorkflowDefinition(ctx, repoID)
	require.NoError(t, err)
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repoID, WorkflowDefinitionID: def.ID, Status: "running", TriggerEvent: "agent", TriggerRef: "main", TriggerCommitSha: "test", DispatchInputs: json.RawMessage(`{}`)})
	require.NoError(t, err)
	step, err := q.CreateWorkflowStep(ctx, db.CreateWorkflowStepParams{WorkflowRunID: run.ID, Name: "agent", Position: 1, Status: "running"})
	require.NoError(t, err)
	task, err := q.CreateWorkflowTask(ctx, db.CreateWorkflowTaskParams{WorkflowRunID: run.ID, WorkflowStepID: step.ID, RepositoryID: repoID, Status: "running", Priority: 1, Payload: json.RawMessage(`{}`), AvailableAt: time.Now()})
	require.NoError(t, err)
	_, err = q.UpdateAgentSessionWorkflowRun(ctx, db.UpdateAgentSessionWorkflowRunParams{ID: session.ID, WorkflowRunID: pgtype.Int8{Int64: run.ID, Valid: true}})
	require.NoError(t, err)
	projection, _ := json.Marshal(agentFlowProjection{Kind: "agent-workflow-run", SessionID: session.ID, WorkflowRunID: run.ID, WorkflowTaskID: task.ID})
	output := fmt.Sprintf(`{"turnId":"run-%d","runId":"host","messages":[{"role":"assistant","content":"one"},{"role":"assistant","content":"two"}]}`, run.ID)
	update := flowdispatch.ProjectionUpdate{Scope: agentFlowScope(repoID, userID), State: jobs.StateCompleted, Checkpoint: flowdispatch.RuntimeCheckpoint{Target: flowruntime.Target{BindingKind: "agent-session", BindingID: session.ID}, FlowID: codingDispatchFlowID, Projection: projection, Run: &flowruntime.Run{RunID: "host", FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &output}}}
	update.Checkpoint.RunID = "host"
	var workspace pgtype.UUID
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,name) VALUES($1,$2,'coding-completion') RETURNING id`, repoID, userID).Scan(&workspace))
	require.NoError(t, q.SetAgentSessionWorkspace(ctx, db.SetAgentSessionWorkspaceParams{ID: session.ID, WorkspaceID: workspace}))
	service.SetWorkspaceBackend(stubAgentWorkspaceBackend{})
	return service, pool, update
}

func TestCodingCompletionRollbackRetryAndConcurrentReplay(t *testing.T) {
	service, pool, update := codingCompletionFixture(t)
	ctx := t.Context()
	update.Checkpoint.RunID = "host"
	// Record receipt normally; use a real workspace for the run owner.
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
	q := db.New(pool)
	session, err := q.GetAgentSession(ctx, projection.SessionID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `CREATE FUNCTION refuse_second_reply() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content->>'value'='two' THEN RAISE EXCEPTION 'test interrupted second reply'; END IF; RETURN NEW; END $$`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `CREATE TRIGGER refuse_second_reply BEFORE INSERT ON agent_parts FOR EACH ROW EXECUTE FUNCTION refuse_second_reply()`)
	require.NoError(t, err)
	require.ErrorContains(t, service.ProjectFlowRuntime(ctx, update), "test interrupted second reply")
	messages, err := service.ListMessages(ctx, session.ID, 1, 100)
	require.NoError(t, err)
	require.Len(t, messages, 1, "partial replies must roll back")
	current, err := q.GetAgentSession(ctx, session.ID)
	require.NoError(t, err)
	require.Equal(t, "active", current.Status)
	require.False(t, current.FinishedAt.Valid)
	_, err = pool.Exec(ctx, `DROP TRIGGER refuse_second_reply ON agent_parts`)
	require.NoError(t, err)
	// Concurrent completions use PostgreSQL's row lock, not process memory.
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fresh := NewAgentServiceWithPool(db.New(pool), pool, WithAgentDispatchQuerier(db.New(pool)))
			fresh.SetWorkspaceBackend(stubAgentWorkspaceBackend{})
			errs <- fresh.ProjectFlowRuntime(context.Background(), update)
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	messages, err = service.ListMessages(ctx, session.ID, 1, 100)
	require.NoError(t, err)
	require.Len(t, messages, 3)
	for i, m := range messages {
		require.EqualValues(t, i, m.Sequence)
	}
	// Replacing the current turn fences delayed replay without rewriting history.
	_, err = q.UpdateAgentSessionWorkflowRun(ctx, db.UpdateAgentSessionWorkflowRunParams{ID: session.ID, WorkflowRunID: pgtype.Int8{}})
	require.NoError(t, err)
	require.NoError(t, service.ProjectFlowRuntime(ctx, update))
	messages, err = service.ListMessages(ctx, session.ID, 1, 100)
	require.NoError(t, err)
	require.Len(t, messages, 3)
}

func TestCodingCompletionRefusesInvalidOutputAndOwnership(t *testing.T) {
	for _, name := range []string{"absent", "malformed", "missing", "invalid later message", "wrong turn", "wrong scope", "wrong repository", "wrong target", "wrong task", "other session", "nonterminal", "failed", "cancelled"} {
		t.Run(name, func(t *testing.T) {
			service, pool, update := codingCompletionFixture(t)
			ctx := t.Context()
			q := db.New(pool)
			var projection agentFlowProjection
			require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
			owner, err := q.GetAgentSession(ctx, projection.SessionID)
			require.NoError(t, err)
			output := ""
			wantError := true
			wantStatus := "active"
			switch name {
			case "absent":
				update.Checkpoint.Run.FinalOutput = nil
			case "malformed":
				output = `{`
				update.Checkpoint.Run.FinalOutput = &output
			case "missing":
				output = `{}`
				update.Checkpoint.Run.FinalOutput = &output
			case "invalid later message":
				output = `{"messages":[{"role":"assistant","content":"one"},{"role":"tool","content":"two"}]}`
				update.Checkpoint.Run.FinalOutput = &output
			case "wrong turn":
				output = `{"turnId":"run-other","messages":[{"role":"assistant","content":"reply"}]}`
				update.Checkpoint.Run.FinalOutput = &output
			case "wrong scope":
				update.Scope.PrincipalID = "user:999999"
			case "wrong repository":
				update.Scope.TenantID = "repository:999999"
			case "wrong target":
				update.Checkpoint.Target.BindingID = "another-session"
			case "wrong task":
				projection.WorkflowTaskID++
				update.Checkpoint.Projection, _ = json.Marshal(projection)
				wantError = false
			case "other session":
				other, err := service.CreateSession(ctx, CreateAgentSessionInput{RepositoryID: owner.RepositoryID, UserID: owner.UserID})
				require.NoError(t, err)
				projection.SessionID = other.ID
				update.Checkpoint.Projection, _ = json.Marshal(projection)
				wantError = false
			case "nonterminal":
				update.State = jobs.StateRunning
				wantError = false
			case "failed":
				update.State = jobs.StateFailed
				wantError = false
				wantStatus = "failed"
			case "cancelled":
				update.State = jobs.StateCancelled
				wantError = false
				wantStatus = "cancelled"
			}
			err = service.ProjectFlowRuntime(ctx, update)
			if wantError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
			if name == "wrong scope" || name == "wrong repository" || name == "wrong target" {
				_, err := q.GetWorkflowRunCodingHost(ctx, projection.WorkflowRunID)
				require.ErrorIs(t, err, pgx.ErrNoRows, "unauthorized projection must not record a host receipt")
			}
			if name == "failed" || name == "cancelled" {
				update.State = jobs.StateCompleted
				require.NoError(t, service.ProjectFlowRuntime(ctx, update), "a delayed completion cannot override failure or cancellation")
			}
			current, err := q.GetAgentSession(ctx, owner.ID)
			require.NoError(t, err)
			require.Equal(t, wantStatus, current.Status)
			messages, err := service.ListMessages(ctx, owner.ID, 1, 100)
			require.NoError(t, err)
			require.Len(t, messages, 1)
		})
	}
}

func TestCodingCompletionNotificationsAndLargeReply(t *testing.T) {
	for _, large := range []bool{false, true} {
		t.Run(fmt.Sprintf("large=%t", large), func(t *testing.T) {
			service, pool, update := codingCompletionFixture(t)
			var projection agentFlowProjection
			require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
			listener, err := pgx.Connect(t.Context(), pool.Config().ConnString())
			require.NoError(t, err)
			defer listener.Close(context.Background())
			_, err = listener.Exec(t.Context(), "LISTEN "+pgx.Identifier{"agent_session_" + strings.ReplaceAll(projection.SessionID, "-", "")}.Sanitize())
			require.NoError(t, err)
			if large {
				// PostgreSQL's notification limit must not prevent a valid reply from
				// committing. Such messages use the existing transcript/SSE replay read.
				output := `{"messages":[{"role":"assistant","content":"` + strings.Repeat("a", codingTriggerTextLimit) + `"}]}`
				update.Checkpoint.Run.FinalOutput = &output
			}
			require.NoError(t, service.ProjectFlowRuntime(t.Context(), update))
			actions := []string{"message", "message", "status"}
			if large {
				actions = []string{"status"}
			}
			for i, action := range actions {
				ctx, cancel := context.WithTimeout(t.Context(), time.Second)
				notice, err := listener.WaitForNotification(ctx)
				cancel()
				require.NoError(t, err)
				var event AgentSessionEvent
				require.NoError(t, json.Unmarshal([]byte(notice.Payload), &event))
				require.Equal(t, projection.SessionID, event.SessionID)
				require.Equal(t, action, event.Action)
				if action == "message" {
					require.NotNil(t, event.Message)
					require.EqualValues(t, i+1, event.Message.Sequence)
					// Notification must follow the durable write of all replies.
					messages, err := service.ListMessages(t.Context(), projection.SessionID, 1, 100)
					require.NoError(t, err)
					require.Len(t, messages, 3)
				} else {
					require.Equal(t, "completed", event.Status)
				}
			}
			require.NoError(t, service.ProjectFlowRuntime(t.Context(), update))
			messages, err := service.ListMessages(t.Context(), projection.SessionID, 1, 100)
			require.NoError(t, err)
			if large {
				require.Len(t, messages, 2)
				want, err := json.Marshal(map[string]string{"value": strings.Repeat("a", codingTriggerTextLimit)})
				require.NoError(t, err)
				got, err := json.Marshal(messages[1].Parts[0].Content)
				require.NoError(t, err)
				require.JSONEq(t, string(want), string(got))
			}
		})
	}
}
