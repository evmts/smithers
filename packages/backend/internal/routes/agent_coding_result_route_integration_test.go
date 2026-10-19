//go:build integration

package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

type fixedCodingTurnObserver struct{ result services.CodingResult }

func (o fixedCodingTurnObserver) ObserveCodingTurn(context.Context, services.CodingTurn) services.CodingResult {
	return o.result
}

// The transcript API returns the server-written coding_result as the last
// reply's second part, {part_index, type, content}, with the record as
// content (QA Q3).
func TestCodingResultReadThroughTheMessagesRoute(t *testing.T) {
	ctx := t.Context()
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	user := routesIntegrationCreateUser(t, pool, "coding_result_owner")
	repo := routesIntegrationCreateRepo(t, pool, user, "coding_result_repo", false)
	session := routesIntegrationCreateAgentSession(t, q, repo, user)
	service := services.NewAgentServiceWithPool(q, pool, services.WithAgentDispatchQuerier(q))
	service.SetWorkspaceBackend(transcriptWorkspaceBackend{})
	head, change, tests := "0123456789abcdef0123456789abcdef01234567", "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk", 2
	service.SetCodingTurnObserver(fixedCodingTurnObserver{services.CodingResult{HeadCommit: &head, HeadChangeID: &change, TestReceipt: &services.CodingTestReceipt{
		Command: "node --test", ExitCode: 0, Commit: head, FinishedAt: "2026-10-19T05:00:00Z", OutputTail: "ℹ tests 2\n", TestsRun: &tests,
	}}})
	_, err := service.AppendMessage(ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"hello"}`)}})
	require.NoError(t, err)
	def, err := q.UpsertAgentWorkflowDefinition(ctx, repo.ID)
	require.NoError(t, err)
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo.ID, WorkflowDefinitionID: def.ID, Status: "running", TriggerEvent: "agent", TriggerRef: "main", TriggerCommitSha: "test", DispatchInputs: json.RawMessage(`{}`)})
	require.NoError(t, err)
	step, err := q.CreateWorkflowStep(ctx, db.CreateWorkflowStepParams{WorkflowRunID: run.ID, Name: "agent", Position: 1, Status: "running"})
	require.NoError(t, err)
	task, err := q.CreateWorkflowTask(ctx, db.CreateWorkflowTaskParams{WorkflowRunID: run.ID, WorkflowStepID: step.ID, RepositoryID: repo.ID, Status: "running", Priority: 1, Payload: json.RawMessage(`{}`), AvailableAt: time.Now()})
	require.NoError(t, err)
	_, err = q.UpdateAgentSessionWorkflowRun(ctx, db.UpdateAgentSessionWorkflowRunParams{ID: session.ID, WorkflowRunID: pgtype.Int8{Int64: run.ID, Valid: true}})
	require.NoError(t, err)
	var workspace pgtype.UUID
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,name) VALUES($1,$2,'coding-result') RETURNING id`, repo.ID, user.ID).Scan(&workspace))
	require.NoError(t, q.SetAgentSessionWorkspace(ctx, db.SetAgentSessionWorkspaceParams{ID: session.ID, WorkspaceID: workspace}))
	projection, _ := json.Marshal(map[string]any{"kind": "agent-workflow-run", "sessionId": session.ID, "workflowRunId": run.ID, "workflowTaskId": task.ID})
	output := fmt.Sprintf(`{"turnId":"run-%d","runId":"host","messages":[{"role":"assistant","content":"one"},{"role":"assistant","content":"two"}]}`, run.ID)
	update := flowdispatch.ProjectionUpdate{
		Scope: jobs.Scope{TenantID: fmt.Sprintf("repository:%d", repo.ID), PrincipalID: fmt.Sprintf("user:%d", user.ID)}, State: jobs.StateCompleted,
		Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: "host", Target: flowruntime.Target{BindingKind: "agent-session", BindingID: session.ID}, FlowID: "coding/dispatch", Projection: projection,
			Run: &flowruntime.Run{RunID: "host", FlowID: "coding/dispatch", Status: "completed", FinalOutput: &output}},
	}
	require.NoError(t, service.ProjectFlowRuntime(ctx, update))

	handler := &AgentSessionHandler{Service: service}
	router := chi.NewRouter()
	router.Use(middleware.AuthLoader(q, config.AuthConfig{}))
	router.Route("/api/repos/{owner}/{repo}", func(r chi.Router) {
		r.Use(middleware.LoadRepoContext(q))
		r.With(middleware.RequireAuth, middleware.RequireScope(middleware.ScopeReadRepository), middleware.RequireRepoPermission(middleware.PermissionRead)).Get("/agent/sessions/{id}/messages", handler.ListMessages)
	})
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	client := routesIntegrationAuthenticatedClient(t, server, routesIntegrationCreateSessionCookie(t, q, user))
	resp, err := client.Get(server.URL + fmt.Sprintf("/api/repos/%s/%s/agent/sessions/%s/messages", repo.Owner, repo.Name, session.ID))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var messages []struct {
		Role  string            `json:"role"`
		Parts []json.RawMessage `json:"parts"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&messages))
	require.Len(t, messages, 3)
	require.Len(t, messages[1].Parts, 1, "only the last reply carries the record")
	last := messages[2]
	require.Equal(t, "assistant", last.Role)
	require.Len(t, last.Parts, 2)
	require.JSONEq(t, `{"part_index":0,"type":"text","content":{"value":"two"}}`, string(last.Parts[0]))
	require.JSONEq(t, `{"part_index":1,"type":"coding_result","content":{
		"producer":"smithers-server",
		"head_commit":"0123456789abcdef0123456789abcdef01234567",
		"head_change_id":"kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
		"test_receipt":{"command":"node --test","exit_code":0,"commit":"0123456789abcdef0123456789abcdef01234567","finished_at":"2026-10-19T05:00:00Z","output_tail":"ℹ tests 2\n","tests_run":2}}}`, string(last.Parts[1]))
}
