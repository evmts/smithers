//go:build integration

package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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

// Only the remote model host is substituted: the dispatcher, completion
// projector, PostgreSQL transcript and authenticated HTTP read are real.
type transcriptCompletionRuntime struct {
	flowruntime.Runtime
	output string
}

func (r *transcriptCompletionRuntime) Identity(context.Context) (flowruntime.Identity, error) {
	return flowruntime.Identity{Protocol: flowruntime.Protocol, RuntimeArtifactDigest: strings.Repeat("a", 64), SourceRevision: strings.Repeat("b", 40), OwnerGeneration: 1}, nil
}
func (r *transcriptCompletionRuntime) Launch(_ context.Context, in flowruntime.Launch) (flowruntime.LaunchResult, error) {
	return flowruntime.LaunchResult{ApplicationRequestID: in.ApplicationRequestID, OwnerGeneration: in.OwnerGeneration, RuntimeArtifactDigest: in.RuntimeArtifactDigest, SourceRevision: in.SourceRevision, PlanID: "plan", Receipt: flowruntime.Receipt{Tag: "Accepted", ReceiptID: "receipt", RunID: "host-turn"}}, nil
}
func (r *transcriptCompletionRuntime) Observe(_ context.Context, runID, _ string, _ int) (flowruntime.Observation, error) {
	return flowruntime.Observation{Run: flowruntime.Run{RunID: runID, FlowID: "coding/dispatch", Status: "completed", FinalOutput: &r.output}, Terminal: true}, nil
}

type transcriptWorkspaceBackend struct{}

func (transcriptWorkspaceBackend) CheckAgentWorkspaceQuota(context.Context, int64) error { return nil }
func (transcriptWorkspaceBackend) CreateAgentWorkspace(context.Context, services.CreateAgentWorkspaceInput) (services.AgentWorkspaceResult, error) {
	return services.AgentWorkspaceResult{}, nil
}
func (transcriptWorkspaceBackend) SuspendAgentWorkspace(context.Context, string) error { return nil }
func (transcriptWorkspaceBackend) FailAgentWorkspace(context.Context, string) error    { return nil }
func (transcriptWorkspaceBackend) SnapshotAgentWorkspace(context.Context, string, string) (string, error) {
	return "", nil
}

func TestAgentFlowCompletionHTTPTranscript(t *testing.T) {
	ctx := t.Context()
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	user := routesIntegrationCreateUser(t, pool, "completion_owner")
	repo := routesIntegrationCreateRepo(t, pool, user, "completion_repo", false)
	otherRepo := routesIntegrationCreateRepo(t, pool, user, "other_repo", false)
	session := routesIntegrationCreateAgentSession(t, q, repo, user)
	otherSession := routesIntegrationCreateAgentSession(t, q, repo, user)
	service := services.NewAgentServiceWithPool(q, pool, services.WithAgentDispatchQuerier(q))
	service.SetWorkspaceBackend(transcriptWorkspaceBackend{})
	_, err := service.AppendMessage(ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"hello"}`)}})
	require.NoError(t, err)
	// Existing non-text history must survive completion unchanged.
	_, err = service.AppendMessage(ctx, session.ID, "tool", []db.CreateAgentPartParams{{PartType: "tool_result", Content: json.RawMessage(`{"output":"prior result"}`)}})
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
	var workspace string
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,name) VALUES($1,$2,'completion') RETURNING id`, repo.ID, user.ID).Scan(&workspace))
	var workspaceID pgtype.UUID
	require.NoError(t, workspaceID.Scan(workspace))
	require.NoError(t, q.SetAgentSessionWorkspace(ctx, db.SetAgentSessionWorkspaceParams{ID: session.ID, WorkspaceID: workspaceID}))
	projection, _ := json.Marshal(map[string]any{"kind": "agent-workflow-run", "sessionId": session.ID, "workflowRunId": run.ID, "workflowTaskId": task.ID})
	runtime := &transcriptCompletionRuntime{output: fmt.Sprintf(`{"turnId":"run-%d","runId":"host-turn","messages":[{"ordinal":0,"role":"assistant","content":"Smithers agent online on bare metal."},{"ordinal":1,"role":"assistant","content":"  second\nreply  "}]}`, run.ID)}
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	var mu sync.Mutex
	var completed flowdispatch.ProjectionUpdate
	completions := 0
	dispatcher, err := flowdispatch.New(flowdispatch.Config{Store: store, Resolver: flowruntime.ResolverFunc(func(context.Context, flowruntime.Target) (flowruntime.Runtime, error) { return runtime, nil }), Projector: flowdispatch.ProjectorFunc(func(ctx context.Context, update flowdispatch.ProjectionUpdate) error {
		if err := service.ProjectFlowRuntime(ctx, update); err != nil {
			return err
		}
		if update.State == jobs.StateCompleted {
			mu.Lock()
			defer mu.Unlock()
			completed = update
			completions++
			if completions == 1 {
				return fmt.Errorf("lost completion acknowledgement")
			}
		}
		return nil
	}), ObservationDelay: time.Millisecond})
	require.NoError(t, err)
	scope := jobs.Scope{TenantID: fmt.Sprintf("repository:%d", repo.ID), PrincipalID: fmt.Sprintf("user:%d", user.ID)}
	receipt, err := dispatcher.Admit(ctx, flowdispatch.LaunchRequest{Scope: scope, RequestID: fmt.Sprintf("agent-run:%d", run.ID), Target: flowruntime.Target{BindingKind: "agent-session", BindingID: session.ID}, FlowID: "coding/dispatch", Payload: json.RawMessage(`{}`), Projection: projection, ApprovalPolicy: flowdispatch.ApprovalAuto})
	require.NoError(t, err)
	workerCtx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() {
		done <- dispatcher.RunWorker(workerCtx, jobs.WorkerConfig{WorkerID: "completion-worker", Capacity: 1, Lease: time.Second, PollInterval: time.Millisecond, RetryDelay: time.Millisecond})
	}()
	t.Cleanup(func() { cancel(); require.NoError(t, <-done) })
	require.Eventually(t, func() bool {
		op, err := store.Get(ctx, scope, receipt.OperationID)
		return err == nil && op.State == jobs.StateCompleted
	}, 10*time.Second, 10*time.Millisecond)
	mu.Lock()
	update := completed
	count := completions
	mu.Unlock()
	require.GreaterOrEqual(t, count, 2, "lost acknowledgement must retry durable completion")
	// A fresh service has no in-memory dedupe state.
	recovered := services.NewAgentServiceWithPool(db.New(pool), pool, services.WithAgentDispatchQuerier(db.New(pool)))
	recovered.SetWorkspaceBackend(transcriptWorkspaceBackend{})
	require.NoError(t, recovered.ProjectFlowRuntime(ctx, update))
	current, err := q.GetAgentSession(ctx, session.ID)
	require.NoError(t, err)
	require.Equal(t, "completed", current.Status)

	handler := &AgentSessionHandler{Service: recovered}
	router := chi.NewRouter()
	router.Use(middleware.AuthLoader(q, config.AuthConfig{}))
	router.Route("/api/repos/{owner}/{repo}", func(r chi.Router) {
		r.Use(middleware.LoadRepoContext(q))
		r.With(middleware.RequireAuth, middleware.RequireScope(middleware.ScopeReadRepository), middleware.RequireRepoPermission(middleware.PermissionRead)).Get("/agent/sessions/{id}/messages", handler.ListMessages)
	})
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	client := routesIntegrationAuthenticatedClient(t, server, routesIntegrationCreateSessionCookie(t, q, user))
	read := func(repoName, sessionID string, client *http.Client, code int) []services.AgentMessageResponse {
		resp, err := client.Get(server.URL + fmt.Sprintf("/api/repos/%s/%s/agent/sessions/%s/messages", repo.Owner, repoName, sessionID))
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, code, resp.StatusCode)
		if code != http.StatusOK {
			return nil
		}
		var messages []services.AgentMessageResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&messages))
		return messages
	}
	messages := read(repo.Name, session.ID, client, http.StatusOK)
	require.Len(t, messages, 4, "completed canonical output must appear in the existing transcript API exactly once")
	require.Equal(t, "user", messages[0].Role)
	require.Equal(t, "tool", messages[1].Role)
	require.JSONEq(t, `{"output":"prior result"}`, string(mustMarshalAgentJSON(messages[1].Parts[0].Content)))
	for i, text := range []string{"Smithers agent online on bare metal.", "  second\nreply  "} {
		message := messages[i+2]
		require.Equal(t, "assistant", message.Role)
		require.EqualValues(t, i+2, message.Sequence)
		require.Len(t, message.Parts, 1)
		require.Equal(t, "text", message.Parts[0].Type)
		want, _ := json.Marshal(map[string]string{"value": text})
		require.JSONEq(t, string(want), string(mustMarshalAgentJSON(message.Parts[0].Content)))
	}
	require.Empty(t, read(repo.Name, otherSession.ID, client, http.StatusOK))
	read(otherRepo.Name, session.ID, client, http.StatusNotFound)
	read(repo.Name, session.ID, server.Client(), http.StatusNotFound)
	// A signed-in outsider reaches neither the repository nor the reply.
	outsider := routesIntegrationCreateUser(t, pool, "completion_outsider")
	read(repo.Name, session.ID, routesIntegrationAuthenticatedClient(t, server, routesIntegrationCreateSessionCookie(t, q, outsider)), http.StatusNotFound)
}
