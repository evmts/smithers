package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// Observe projects a waiting page before it can call settle. An archive refusal
// on that page must not strand a completed coding turn before terminal projection.
func TestRunArchiveRefusalDoesNotBlockCompletion(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	archive := &runArchive{pool: pool, host: &archiveHost{}}
	update := flowdispatch.ProjectionUpdate{State: jobs.StateWaiting, Checkpoint: flowdispatch.RuntimeCheckpoint{
		RunID: "host", FlowID: "coding", Target: flowruntime.Target{TenantID: "repository:1", BindingKind: "agent-session"},
		Run: &flowruntime.Run{RunID: "host", Status: "completed"},
	}}
	require.ErrorContains(t, archive.capture(t.Context(), update.Checkpoint), "checkpoint names no repository run")
	require.NoError(t, archive.ProjectFlowRuntime(t.Context(), update), "waiting page must reach settlement")
}

type completionWorkspace struct{ services.AgentWorkspaceBackend }

func (completionWorkspace) ReleaseAgentWorkspace(context.Context, string, string, int64) (services.AgentWorkspaceRelease, error) {
	return services.AgentWorkspaceRelease{Outcome: "kept_in_use"}, nil
}
func (completionWorkspace) SnapshotAgentWorkspace(context.Context, string, string) (string, error) {
	return "11111111-1111-4111-8111-111111111111", nil
}

type completedCodingRuntime struct {
	flowruntime.Runtime
	output       string
	status       string
	stopped      atomic.Bool
	observations atomic.Int32
	onObserve    func()
}

func (*completedCodingRuntime) Identity(context.Context) (flowruntime.Identity, error) {
	return flowruntime.Identity{Protocol: flowruntime.Protocol, RuntimeArtifactDigest: strings.Repeat("a", 64), SourceRevision: strings.Repeat("b", 40), OwnerGeneration: 1}, nil
}
func (r *completedCodingRuntime) Launch(_ context.Context, in flowruntime.Launch) (flowruntime.LaunchResult, error) {
	return flowruntime.LaunchResult{ApplicationRequestID: in.ApplicationRequestID, OwnerGeneration: in.OwnerGeneration, RuntimeArtifactDigest: in.RuntimeArtifactDigest, SourceRevision: in.SourceRevision, ExecutionDigest: strings.Repeat("c", 64), Receipt: flowruntime.Receipt{Tag: "Accepted", ReceiptID: "accepted", RunID: "host"}}, nil
}
func (r *completedCodingRuntime) Observe(context.Context, string, string, int) (flowruntime.Observation, error) {
	sequence := r.observations.Add(1)
	if r.stopped.Load() {
		return flowruntime.Observation{}, fmt.Errorf("coding host is stopped")
	}
	status := r.status
	if status == "" {
		status = "completed"
	}
	if r.onObserve != nil {
		f := r.onObserve
		r.onObserve = nil
		f()
	}
	return flowruntime.Observation{Run: flowruntime.Run{RunID: "host", FlowID: "coding/dispatch", Status: status, FinalOutput: &r.output}, Events: []flowruntime.Event{{RunID: "host", Sequence: int64(sequence), Kind: "control.run." + status, Payload: json.RawMessage(`{}`)}}, NextCursor: fmt.Sprint(sequence), Terminal: status != "running"}, nil
}

func (r *completedCodingRuntime) Cancel(_ context.Context, input flowruntime.Lifecycle) (flowruntime.MutationResult, error) {
	r.status = "cancelled"
	return flowruntime.MutationResult{Operation: "cancel", ApplicationRequestID: input.ApplicationRequestID, Receipt: flowruntime.Receipt{Tag: "Accepted", ReceiptID: "cancelled", RunID: input.RunID}}, nil
}

func TestCodingDispatchCompletesDespiteArchiveRefusal(t *testing.T) {
	testCodingDispatchCompletion(t, false, "")
}
func TestHostedCodingDispatchArchivesWorkspace(t *testing.T) {
	testCodingDispatchCompletion(t, true, "")
}

// The hosted resolver supplies this identity only after authorizing the session.
type workspaceCodingRuntime struct {
	*completedCodingRuntime
	workspace string
}

func (r *workspaceCodingRuntime) RuntimeWorkspaceID() string { return r.workspace }

type completionArchiveHost struct{}

func (completionArchiveHost) Monitor(context.Context, flowruntime.Target, string, *int64) (json.RawMessage, error) {
	return json.RawMessage(`{"id":"host"}`), nil
}
func (completionArchiveHost) CallRPC(_ context.Context, _ flowruntime.Target, _ string, payload json.RawMessage) (json.RawMessage, error) {
	if strings.Contains(string(payload), "run-summary") {
		return json.RawMessage(`{"ok":true,"payload":{"rows":[{"runId":"host","flowId":"coding/dispatch","status":"completed"}]}}`), nil
	}
	return json.RawMessage(`{"ok":true,"payload":{"rows":[]}}`), nil
}

func TestCodingDispatchCancelledDespiteArchiveRefusal(t *testing.T) {
	testCodingDispatchCompletion(t, false, "cancel-requested")
}
func TestCodingDispatchRetriesCompletionAfterHostQuiesced(t *testing.T) {
	testCodingDispatchCompletion(t, true, "retry")
}

func testCodingDispatchCompletion(t *testing.T, hosted bool, mode string) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	user, err := q.CreateUser(ctx, db.CreateUserParams{Username: "completion", LowerUsername: "completion", DisplayName: "Completion"})
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: user.ID, Valid: true}, Name: "completion", LowerName: "completion", DefaultBookmark: "main"})
	require.NoError(t, err)
	agent := services.NewAgentServiceWithPool(q, pool, services.WithAgentDispatchQuerier(q))
	agent.SetWorkspaceBackend(completionWorkspace{})
	session, err := agent.CreateSession(ctx, services.CreateAgentSessionInput{RepositoryID: repo.ID, UserID: user.ID, Title: "completion"})
	require.NoError(t, err)
	_, err = agent.AppendMessage(ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"request"}`)}})
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
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,name) VALUES($1,$2,'completion') RETURNING id`, repo.ID, user.ID).Scan(&workspace))
	require.NoError(t, q.SetAgentSessionWorkspace(ctx, db.SetAgentSessionWorkspaceParams{ID: session.ID, WorkspaceID: workspace}))
	projection, _ := json.Marshal(map[string]any{"kind": "agent-workflow-run", "sessionId": session.ID, "workflowRunId": run.ID, "workflowTaskId": task.ID})
	runtime := &completedCodingRuntime{output: fmt.Sprintf(`{"turnId":"run-%d","runId":"host","messages":[{"role":"assistant","content":"one"},{"role":"assistant","content":"two"},{"role":"assistant","content":"three"}]}`, run.ID)}
	if mode == "cancel-requested" {
		runtime.status = "running"
	}
	var terminalAttempts atomic.Int32
	var rolledBack atomic.Bool
	if mode == "retry" {
		_, err = pool.Exec(ctx, `CREATE SEQUENCE completion_failure; CREATE FUNCTION completion_fail_once() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content->>'value'='two' AND nextval('completion_failure')=1 THEN RAISE EXCEPTION 'transient completion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER completion_fail_once BEFORE INSERT ON agent_parts FOR EACH ROW EXECUTE FUNCTION completion_fail_once()`)
		require.NoError(t, err)
	}
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	archive := &runArchive{pool: pool, host: &archiveHost{}}
	var resolved flowruntime.Runtime = runtime
	if hosted {
		authorityResolver, e := services.NewAgentFlowHostTargetResolver(agent)
		require.NoError(t, e)
		authority, e := authorityResolver.ResolveFlowHostTarget(ctx, flowruntime.Target{TenantID: fmt.Sprintf("repository:%d", repo.ID), PrincipalID: fmt.Sprintf("user:%d", user.ID), BindingKind: "agent-session", BindingID: session.ID})
		require.NoError(t, e)
		require.Equal(t, services.UUIDString(workspace), authority.WorkspaceID)
		resolved = &workspaceCodingRuntime{completedCodingRuntime: runtime, workspace: authority.WorkspaceID}
		archive.host = completionArchiveHost{}
	}
	projector := flowProjector(archive, agent)
	if mode == "retry" {
		downstream := projector
		projector = flowdispatch.ProjectorFunc(func(ctx context.Context, update flowdispatch.ProjectionUpdate) error {
			if update.State == jobs.StateCompleted {
				runtime.stopped.Store(true)
				terminalAttempts.Add(1)
			}
			err := downstream.ProjectFlowRuntime(ctx, update)
			if err != nil && update.State == jobs.StateCompleted {
				messages, readErr := agent.ListMessages(ctx, session.ID, 1, 100)
				current, statusErr := q.GetAgentSession(ctx, session.ID)
				rolledBack.Store(readErr == nil && statusErr == nil && len(messages) == 1 && current.Status == "active")
			}
			return err
		})
	}
	dispatcher, err := flowdispatch.New(flowdispatch.Config{Store: store, Resolver: flowruntime.ResolverFunc(func(context.Context, flowruntime.Target) (flowruntime.Runtime, error) {
		if runtime.stopped.Load() {
			return nil, fmt.Errorf("coding host is quiesced")
		}
		return resolved, nil
	}), Projector: projector, ObservationDelay: time.Millisecond})
	require.NoError(t, err)
	scope := jobs.Scope{TenantID: fmt.Sprintf("repository:%d", repo.ID), PrincipalID: fmt.Sprintf("user:%d", user.ID)}
	receipt, err := dispatcher.Admit(ctx, flowdispatch.LaunchRequest{Scope: scope, RequestID: "completion", Target: flowruntime.Target{BindingKind: "agent-session", BindingID: session.ID}, FlowID: "coding/dispatch", Payload: json.RawMessage(`{}`), AuthorizationContext: json.RawMessage(`{}`), Projection: projection, ApprovalPolicy: flowdispatch.ApprovalAuto})
	require.NoError(t, err)
	if mode == "cancel-requested" {
		runtime.onObserve = func() {
			_, cancelErr := dispatcher.CancelRequest(ctx, scope, "completion")
			if cancelErr != nil {
				panic(cancelErr)
			}
		}
	}
	workerCtx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() {
		done <- dispatcher.RunWorker(workerCtx, jobs.WorkerConfig{WorkerID: "completion", Capacity: 1, Lease: 2 * time.Second, PollInterval: time.Millisecond, RetryDelay: time.Millisecond})
	}()
	t.Cleanup(func() { cancel(); require.NoError(t, <-done) })
	wantState := jobs.StateCompleted
	if mode == "cancel-requested" {
		wantState = jobs.StateCancelled
	}
	require.Eventually(t, func() bool {
		op, e := store.Get(ctx, scope, receipt.OperationID)
		return e == nil && op.State == wantState
	}, 5*time.Second, 10*time.Millisecond)
	if hosted {
		op, e := store.Get(ctx, scope, receipt.OperationID)
		require.NoError(t, e)
		var cp flowdispatch.RuntimeCheckpoint
		require.NoError(t, json.Unmarshal(op.ExternalReceipt, &cp))
		require.Equal(t, services.UUIDString(workspace), cp.Target.WorkspaceID)
		captured, e := readRunArchive(ctx, pool, repo.ID, cp.Target.WorkspaceID, "host")
		require.NoError(t, e)
		require.Equal(t, "completed", captured.Status)
		var events int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM run_archive_events WHERE workspace_id=$1 AND run_id='host'`, cp.Target.WorkspaceID).Scan(&events))
		require.Equal(t, 1, events)
	}
	if mode == "retry" {
		require.True(t, rolledBack.Load(), "failed completion must roll back parts and status")
		require.EqualValues(t, 2, terminalAttempts.Load())
		require.EqualValues(t, 1, runtime.observations.Load(), "settlement retry must not observe the stopped host")
	}
	if mode == "cancel-requested" {
		require.EqualValues(t, 2, runtime.observations.Load(), "observe the cancellation receipt after the requested stop")
		current, e := q.GetWorkflowRunByRunID(ctx, run.ID)
		require.NoError(t, e)
		require.Equal(t, "cancelled", current.Status)
		settled, e := q.GetAgentSession(ctx, session.ID)
		require.NoError(t, e)
		require.Equal(t, "cancelled", settled.Status)
		require.True(t, settled.FinishedAt.Valid)
		messages, e := agent.ListMessages(ctx, session.ID, 1, 100)
		require.NoError(t, e)
		require.Len(t, messages, 1, "cancelled output must not append assistant replies")
		return
	}
	current, err := q.GetWorkflowRunByRunID(ctx, run.ID)
	require.NoError(t, err)
	require.Equal(t, "success", current.Status)
	settledSession, e := q.GetAgentSession(ctx, session.ID)
	require.NoError(t, e)
	require.Equal(t, "completed", settledSession.Status)
	require.True(t, settledSession.FinishedAt.Valid)
	messages, err := agent.ListMessages(ctx, session.ID, 1, 100)
	require.NoError(t, err)
	require.Len(t, messages, 4)
	for i, text := range []string{"one", "two", "three"} {
		require.Equal(t, "assistant", messages[i+1].Role)
		content, e := json.Marshal(messages[i+1].Parts[0].Content)
		require.NoError(t, e)
		require.JSONEq(t, fmt.Sprintf(`{"value":%q}`, text), string(content))
	}
}

func TestRunArchiveFailureLoggedOncePerRun(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	var output bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })
	archive := &runArchive{pool: pool, host: &archiveHost{}}
	for _, run := range []string{"first", "first", "second", "first", "second"} {
		update := flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: run, Target: flowruntime.Target{TenantID: "repository:1"}, Run: &flowruntime.Run{RunID: run, Status: "completed"}}}
		require.NoError(t, archive.ProjectFlowRuntime(t.Context(), update))
	}
	require.Equal(t, 2, strings.Count(output.String(), `"msg":"run archive capture failed"`))
	for _, run := range []string{"first", "second"} {
		require.Equal(t, 1, strings.Count(output.String(), fmt.Sprintf(`"run_id":%q`, run)))
	}
	require.Contains(t, output.String(), "checkpoint names no repository run")
	require.Contains(t, output.String(), `"workspace_id":""`)
}
