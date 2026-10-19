package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/microsandbox"
	"github.com/smithersai/smithers/packages/backend/productstore"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// FINISHED AGENT BOXES WERE NEVER RELEASED (hosted P0, smithers.sh owner
// f-2r370x). SuspendAgentWorkspace returned nil without doing anything, yet the
// reaper logged "agent workspace suspended" after every terminal run. In the
// 2026-10-18 spike the run's head token (id 63979, sandbox-workspace-9ffa4c83,
// write:repository, 7-day expiry) stayed live on a stopped box until the owner
// revoked it by hand.
//
// Composition here is hosted's: a real product database, the real workspace
// service over a guest runtime double, every branch-machine provider admitting,
// and no branch capture (plue#862), so sleep is refused and the box is stopped.

// hostedBoxRuntime is hosted's guest runtime: it keeps a stopped guest's disk,
// advertises no cold snapshots, records the guest services it stops and
// starts, and answers a later turn's join as an initialized checkout.
type hostedBoxRuntime struct {
	*interruptedReleaseRuntime
	serviceErr error
	stopped    []string
	started    []string
	starts     int
	cloneURL   string
	bookmark   string
	repository int64
}

func (*hostedBoxRuntime) Capabilities() workspaceapi.WorkspaceCapabilities {
	return workspaceapi.WorkspaceCapabilities{PersistentFiles: true, Execution: true, FileOperations: true, ManagedServices: true}
}

func (r *hostedBoxRuntime) InspectWorkspace(ctx context.Context, id string) (workspaceapi.Workspace, error) {
	observed, err := r.interruptedReleaseRuntime.InspectWorkspace(ctx, id)
	observed.Home, observed.Root = "/home/developer", "/workspace/repo"
	return observed, err
}

func (r *hostedBoxRuntime) StartWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	r.starts++
	r.guest.state = workspaceapi.WorkspaceRunning
	return workspaceapi.Workspace{ID: id, State: workspaceapi.WorkspaceRunning, Home: "/home/developer", Root: "/workspace/repo"}, nil
}

func (*hostedBoxRuntime) ListFiles(_ context.Context, _, dir string) ([]workspaceapi.FileEntry, error) {
	if dir == ".git" {
		return []workspaceapi.FileEntry{{Name: "smithers-workspace-initialization.json"}}, nil
	}
	return []workspaceapi.FileEntry{{Name: ".git", IsDir: true}, {Name: ".jj", IsDir: true}}, nil
}

func (r *hostedBoxRuntime) ReadFile(_ context.Context, workspaceID, _ string) ([]byte, error) {
	return json.Marshal(workspaceRepositoryReceipt{Version: workspaceRepositoryReceiptVersion, WorkspaceID: workspaceID,
		RepositoryID: r.repository, CloneURL: r.cloneURL, SourceBookmark: r.bookmark,
		SourceRevision: strings.Repeat("a", 40), InitializedAt: time.Now().UTC()})
}

// ExecuteCommand answers the origin check, and reports the head publisher
// running only once a join has started one, so a quiesced box gets a fresh
// publisher with a fresh token.
func (r *hostedBoxRuntime) ExecuteCommand(_ context.Context, _ string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
	if len(command.Args) >= 2 && command.Args[0] == "git" && command.Args[1] == "remote" {
		return workspaceapi.CommandResult{Stdout: r.cloneURL + "\n"}, nil
	}
	if _, probe := command.Environment["SMITHERS_WORKSPACE_TOKEN_ID"]; probe && !slices.Contains(r.started, workspaceHeadReporterService) {
		return workspaceapi.CommandResult{ExitCode: 1}, nil
	}
	return workspaceapi.CommandResult{}, nil
}

func (r *hostedBoxRuntime) StartService(_ context.Context, _ string, spec workspaceapi.ServiceSpec) (workspaceapi.Service, error) {
	r.started = append(r.started, spec.Name)
	return workspaceapi.Service{Name: spec.Name}, nil
}

func (*hostedBoxRuntime) InspectService(context.Context, string, string) (workspaceapi.ServiceObservation, error) {
	return workspaceapi.ServiceObservation{State: workspaceapi.ServiceRunning}, nil
}

func (r *hostedBoxRuntime) StopService(_ context.Context, _ string, name string) error {
	if r.serviceErr != nil {
		return r.serviceErr
	}
	r.stopped = append(r.stopped, name)
	return nil
}

type agentBoxRelease struct {
	ctx       context.Context
	pool      *pgxpool.Pool
	q         *db.Queries
	agent     *AgentService
	boxes     *WorkspaceService
	runtime   *interruptedReleaseRuntime
	hosted    *hostedBoxRuntime
	guest     *interruptedReleaseGuest
	workspace string
	session   string
	person    int64
	machines  int64
	run       int64
	update    flowdispatch.ProjectionUpdate
	// tokens are the access tokens minted for the run, by name.
	tokens map[string]int64
	logs   *bytes.Buffer
}

func newAgentBoxRelease(t *testing.T, status string) *agentBoxRelease {
	t.Helper()
	pool := newProductTestPool(t)
	q := db.New(pool)
	f := &agentBoxRelease{ctx: context.Background(), pool: pool, q: q, tokens: map[string]int64{}, logs: &bytes.Buffer{}}
	ctx := f.ctx
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&f.machines))
	var repo int64
	f.person, repo = setupTestUserAndRepo(t, pool)

	// The branch's machine, owned by the machine service as on hosted.
	f.workspace = uuid.NewString()
	_, err := pool.Exec(ctx, `INSERT INTO workspaces
		(id, repository_id, user_id, name, kind, vm_id, provisioning_generation, status, provisioning_stage, target_bookmark)
		VALUES ($1,$2,$3,$4,'container','vm-agent-box',3,$5,'','main')`,
		f.workspace, repo, f.machines, "agent-box-"+f.workspace[:8], status)
	require.NoError(t, err)
	head, err := issueTemporaryRepoTokenWithTTL(ctx, q, f.machines, "sandbox-workspace-"+f.workspace,
		workspaceHeadTokenScopes(repo, f.workspace), workspaceHeadTokenTTL)
	require.NoError(t, err)
	require.NoError(t, q.SetWorkspaceHeadPushTokenID(ctx, db.SetWorkspaceHeadPushTokenIDParams{
		ID: f.workspace, HeadPushTokenID: pgtype.Int8{Int64: head.ID, Valid: true}}))
	f.tokens["head"] = head.ID

	// The person's write share, which the first turn's join made before any
	// coding host ran on the box.
	_, err = q.UpsertWorkspaceShare(ctx, db.UpsertWorkspaceShareParams{WorkspaceID: f.workspace, OwnerUserID: f.machines,
		GranteeUserID: f.person, Level: string(WorkspaceAccessWrite)})
	require.NoError(t, err)

	// The coding host the run started on that box, with its two credentials.
	binding := uuid.NewString()
	_, err = pool.Exec(ctx, `INSERT INTO flow_runtime_host_bindings
		(id, tenant_id, principal_id, binding_kind, binding_id, repository_id, user_id, workspace_id, catalog_key,
		 service_name, runtime_artifact_digest, source_revision, owner_generation, credential_ciphertext, credential_hash, state)
		VALUES ($1,'t','p','agent-session','s',$2,$3,$4,'coding','smithers-coding-host',$5,$6,1,'sealed',$7,'running')`,
		binding, repo, f.person, f.workspace, strings.Repeat("a", 64), strings.Repeat("b", 40), bytes.Repeat([]byte{7}, 32))
	require.NoError(t, err)
	for name, token := range map[string]string{"landing": boxHostLandingTokenName(binding), "cache": boxHostCacheTokenName(binding)} {
		minted, mintErr := issueTemporaryRepoTokenWithTTL(ctx, q, f.person, token, "read:repository", time.Hour)
		require.NoError(t, mintErr)
		f.tokens[name] = minted.ID
	}

	f.guest = &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	if status != "running" {
		f.guest.state = workspaceapi.WorkspaceStopped
	}
	f.runtime = &interruptedReleaseRuntime{guest: f.guest}
	f.hosted = &hostedBoxRuntime{interruptedReleaseRuntime: f.runtime, bookmark: "main", repository: repo}
	slug, err := q.GetRepoOwnerSlugAndNameByID(ctx, repo)
	require.NoError(t, err)
	f.hosted.cloneURL = testWorkspaceGitBaseURL + "/" + slug.OwnerSlug + "/" + slug.RepoName + ".git"
	// Hosted supplies its workspace store as productstore.Product, never as
	// *db.Queries, so a release capability Product lacks would leave every
	// token live there. The fixture runs on that shape.
	f.boxes = newWorkspaceServiceForTests(hostedProductStore{Product: productstore.New(pool)},
		WithWorkspaceRuntime(f.hosted), WithWorkspaceTransactions(pool), WithWorkspaceSandboxMetrics(newCorePoolDutyRecorder()))
	f.boxes.gitBaseURL = testWorkspaceGitBaseURL
	f.boxes.branchMachineProviders = BranchMachineProviders{
		Membership:      func(context.Context, pgx.Tx, int64, int64) error { return nil },
		Authorize:       func(context.Context, pgx.Tx, string, int64, string, int64) error { return nil },
		LaneBinding:     func(context.Context, pgx.Tx, int64, string, string) error { return nil },
		MicroVM:         func(context.Context) error { return nil },
		SessionIdentity: func(context.Context) error { return nil },
	}

	f.agent = NewAgentServiceWithPool(q, pool, WithAgentDispatchQuerier(q))
	f.agent.SetWorkspaceBackend(f.boxes)
	f.session = f.attachSession(t, repo)

	// The run's own credentials: its callback token and its repository API token.
	definition, err := q.UpsertAgentWorkflowDefinition(ctx, repo)
	require.NoError(t, err)
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo, WorkflowDefinitionID: definition.ID, Status: "running",
		TriggerEvent: "agent", TriggerRef: "main", TriggerCommitSha: "test", DispatchInputs: json.RawMessage(`{}`)})
	require.NoError(t, err)
	f.run = run.ID
	step, err := q.CreateWorkflowStep(ctx, db.CreateWorkflowStepParams{WorkflowRunID: run.ID, Name: "agent", Position: 1, Status: "running"})
	require.NoError(t, err)
	task, err := q.CreateWorkflowTask(ctx, db.CreateWorkflowTaskParams{WorkflowRunID: run.ID, WorkflowStepID: step.ID, RepositoryID: repo,
		Status: "running", Priority: 1, Payload: json.RawMessage(`{}`), AvailableAt: time.Now()})
	require.NoError(t, err)
	_, err = q.UpdateAgentSessionWorkflowRun(ctx, db.UpdateAgentSessionWorkflowRunParams{ID: f.session, WorkflowRunID: pgtype.Int8{Int64: run.ID, Valid: true}})
	require.NoError(t, err)
	_, err = q.UpdateWorkflowRunAgentToken(ctx, db.UpdateWorkflowRunAgentTokenParams{ID: run.ID,
		AgentTokenHash:      pgtype.Text{String: "agent-token-" + f.session, Valid: true},
		AgentTokenExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}})
	require.NoError(t, err)
	jjhub, err := issueTemporaryRepoTokenWithTTL(ctx, q, f.person, "agent-run-api", "write:repository", time.Hour)
	require.NoError(t, err)
	require.NoError(t, q.UpdateWorkflowRunJJHubTokenID(ctx, db.UpdateWorkflowRunJJHubTokenIDParams{ID: run.ID, JjhubTokenID: pgtype.Int8{Int64: jjhub.ID, Valid: true}}))
	f.tokens["api"] = jjhub.ID

	projection, _ := json.Marshal(agentFlowProjection{Kind: "agent-workflow-run", SessionID: f.session, WorkflowRunID: run.ID, WorkflowTaskID: task.ID})
	output := fmt.Sprintf(`{"turnId":"run-%d","runId":"host","messages":[{"role":"assistant","content":"done"}]}`, run.ID)
	f.update = flowdispatch.ProjectionUpdate{Scope: agentFlowScope(repo, f.person), State: jobs.StateCompleted, Checkpoint: flowdispatch.RuntimeCheckpoint{
		Target: flowruntime.Target{BindingKind: "agent-session", BindingID: f.session}, FlowID: codingDispatchFlowID, Projection: projection,
		RunID: "host", Run: &flowruntime.Run{RunID: "host", FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &output}}}

	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(f.logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return f
}

// attachSession is one active agent session of the person on the box.
func (f *agentBoxRelease) attachSession(t *testing.T, repo int64) string {
	t.Helper()
	session, err := f.agent.CreateSession(f.ctx, CreateAgentSessionInput{RepositoryID: repo, UserID: f.person, Title: "release"})
	require.NoError(t, err)
	_, err = f.agent.AppendMessage(f.ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"request"}`)}})
	require.NoError(t, err)
	require.NoError(t, f.q.SetAgentSessionWorkspace(f.ctx, db.SetAgentSessionWorkspaceParams{ID: session.ID, WorkspaceID: pgUUIDFromString(f.workspace)}))
	return session.ID
}

func (f *agentBoxRelease) finish(t *testing.T) {
	t.Helper()
	require.NoError(t, f.agent.ProjectFlowRuntime(f.ctx, f.update))
	session, err := f.q.GetAgentSession(f.ctx, f.session)
	require.NoError(t, err)
	require.Equal(t, "completed", session.Status)
}

func (f *agentBoxRelease) tokenLive(t *testing.T, name string) bool {
	t.Helper()
	var live bool
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT EXISTS (SELECT 1 FROM access_tokens WHERE id=$1)`, f.tokens[name]).Scan(&live))
	return live
}

func (f *agentBoxRelease) box(t *testing.T) db.Workspace {
	t.Helper()
	row, err := f.q.GetWorkspace(f.ctx, f.workspace)
	require.NoError(t, err)
	return row
}

// requireRunTokensRevoked checks the run's callback token and every access
// token minted for the run or its box.
func (f *agentBoxRelease) requireRunTokensRevoked(t *testing.T, names ...string) {
	t.Helper()
	run, err := f.q.GetWorkflowRunByRunID(f.ctx, f.run)
	require.NoError(t, err)
	require.False(t, run.AgentTokenHash.Valid, "the run's callback token is revoked")
	for _, name := range names {
		require.False(t, f.tokenLive(t, name), "the %s token minted for the run is revoked", name)
	}
}

// releaseLog is the one line the terminal run logged about its box.
func (f *agentBoxRelease) releaseLog(t *testing.T) string {
	t.Helper()
	for _, line := range strings.Split(f.logs.String(), "\n") {
		if strings.Contains(line, "agent workspace") && strings.Contains(line, f.workspace) && strings.Contains(line, "final_status=") {
			return line
		}
	}
	t.Fatalf("no agent workspace line for %s in:\n%s", f.workspace, f.logs.String())
	return ""
}

func TestAFinishedRunQuiescesItsBoxAndRevokesEveryTokenMintedForIt(t *testing.T) {
	f := newAgentBoxRelease(t, "running")

	f.finish(t)

	require.Zero(t, f.runtime.stops.Load(), "hosted cannot wake a stopped box through the session path, so the box is not stopped")
	require.Equal(t, workspaceapi.WorkspaceRunning, f.guest.state)
	box := f.box(t)
	require.Equal(t, "running", box.Status, "the next turn joins it without a wake")
	require.False(t, box.HeadPushTokenID.Valid, "the row records no head token")
	require.Equal(t, []string{"smithers-coding-host"}, f.hosted.stopped, "the coding host is stopped before its credentials are retired")
	f.requireRunTokensRevoked(t, "head", "landing", "cache", "api")
	line := f.releaseLog(t)
	require.Contains(t, line, "outcome=quiesced", "the log states what happened to the box")
	require.Contains(t, line, "head_token_revoked=true")
}

// A coding host the runtime does not stop still loses every credential the
// run minted: the run is over, so a host left running only fails its next
// call. The stop is owed, so the binding is marked and the next release
// retries it (Security s-z9semr).
func TestAFailedHostStopStillRevokesTheRunsTokens(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	f.hosted.serviceErr = errors.New("guest agent unreachable")

	f.finish(t)

	require.Zero(t, f.runtime.stops.Load())
	require.False(t, f.box(t).HeadPushTokenID.Valid)
	f.requireRunTokensRevoked(t, "head", "landing", "cache", "api")
	line := f.releaseLog(t)
	require.Contains(t, line, "outcome=quiesced")
	require.Contains(t, line, "head_token_revoked=true")
	require.Contains(t, line, "stop retried on the next release")
	require.Equal(t, db.FlowHostStopPending, f.bindingErrorCode(t), "the owed stop is recorded")

	// The next release retries the stop and clears the mark.
	f.hosted.serviceErr = nil
	release, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, "")
	require.NoError(t, err)
	require.Equal(t, agentWorkspaceQuiesced, release.Outcome)
	require.Equal(t, []string{"smithers-coding-host"}, f.hosted.stopped, "the owed stop is retried")
	require.Empty(t, f.bindingErrorCode(t), "a stop that succeeds clears the mark")
}

func (f *agentBoxRelease) bindingErrorCode(t *testing.T) string {
	t.Helper()
	var code string
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT last_error_code FROM flow_runtime_host_bindings WHERE workspace_id=$1`, f.workspace).Scan(&code))
	return code
}

func TestARunOnAnAlreadyStoppedBoxRevokesTheHeadTokenItLeftLive(t *testing.T) {
	f := newAgentBoxRelease(t, "stopped")
	f.update.State = jobs.StateFailed
	f.update.Checkpoint.Run = nil

	require.NoError(t, f.agent.ProjectFlowRuntime(f.ctx, f.update))

	require.Zero(t, f.runtime.stops.Load(), "a stopped box is not stopped again")
	require.Equal(t, "stopped", f.box(t).Status)
	f.requireRunTokensRevoked(t, "head", "api")
	require.Contains(t, f.releaseLog(t), "outcome=already_released")
}

// A box another session is still working on keeps running, and keeps the head
// token that session's edits publish with. Only the finished run's own
// credentials are revoked.
func TestABoxAnotherSessionStillUsesKeepsRunning(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	box := f.box(t)
	other := f.attachSession(t, box.RepositoryID)

	f.finish(t)

	require.Zero(t, f.runtime.stops.Load(), "never stop a box a live session is using")
	require.Empty(t, f.hosted.stopped, "nor its coding host")
	require.Equal(t, "running", f.box(t).Status)
	require.True(t, f.tokenLive(t, "head"), "the box's head token serves the session still on it")
	require.True(t, f.tokenLive(t, "landing"), "the coding host still serves the other session")
	f.requireRunTokensRevoked(t, "api")
	line := f.releaseLog(t)
	require.Contains(t, line, "outcome=kept_in_use")
	require.Contains(t, line, other, "the log names who still uses the box")
}

// A person's open terminal on the branch's box is use too.
func TestABoxWithAnOpenTerminalKeepsRunning(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	_, err := f.pool.Exec(f.ctx, `INSERT INTO workspace_sessions (workspace_id, repository_id, user_id, status)
		SELECT id, repository_id, $2, 'running' FROM workspaces WHERE id=$1`, f.workspace, f.person)
	require.NoError(t, err)

	f.finish(t)

	require.Zero(t, f.runtime.stops.Load())
	require.Equal(t, "running", f.box(t).Status)
	require.True(t, f.tokenLive(t, "head"))
	require.Contains(t, f.releaseLog(t), "outcome=kept_in_use")
}

// On an install the machine lifecycle releases an idle branch after a
// verified capture; a finished run leaves the box to it.
func TestAnInstallLeavesTheBoxToItsMachineLifecycle(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	f.boxes.machineAdmission = &microsandbox.AdmissionProviders{}

	f.finish(t)

	require.Zero(t, f.runtime.stops.Load())
	require.Equal(t, "running", f.box(t).Status)
	require.True(t, f.tokenLive(t, "head"))
	f.requireRunTokensRevoked(t, "api")
	require.Contains(t, f.releaseLog(t), "outcome=kept_for_machine_lifecycle")
}

// The spike's leak itself: after three failed coding-host starts the resolver
// releases the machine, which recorded it stopped and left its head token
// live (token 63979, revoked by hand at 21:53:06Z).
func TestReleasingAFailedFlowHostMachineRevokesItsHeadToken(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	box := f.box(t)

	require.NoError(t, f.boxes.ReleaseFailedFlowHostMachine(f.ctx, flowhost.Binding{WorkspaceID: f.workspace, RepositoryID: box.RepositoryID}))

	require.Equal(t, "stopped", f.box(t).Status)
	require.False(t, f.tokenLive(t, "head"), "a stopped machine keeps no live head token")
	require.False(t, f.box(t).HeadPushTokenID.Valid)
}

// TWO CONSECUTIVE CHANGE REQUESTS ON ONE REPO BOTH GET A WORKING BOX (PM
// d-qhgqyv). A person cannot start a box the payer account owns, so after the
// first turn releases its box, a second message on the same session and a
// new session on the same repository must each get a running box through the
// session path, with fresh credentials, and their turns must be admitted to
// the coding host. Nothing may be refused.
func TestTwoConsecutiveChangeRequestsOnOneRepoBothGetAWorkingBox(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	box := f.box(t)
	f.finish(t)
	f.requireRunTokensRevoked(t, "head", "landing", "cache", "api")
	firstHead := f.tokens["head"]

	request := func(t *testing.T, sessionID string) {
		t.Helper()
		ctx := f.ctx
		definition, err := f.q.UpsertAgentWorkflowDefinition(ctx, box.RepositoryID)
		require.NoError(t, err)
		run, err := f.q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: box.RepositoryID, WorkflowDefinitionID: definition.ID, Status: "queued",
			TriggerEvent: "agent_message", DispatchInputs: json.RawMessage(`{}`), ExecutionPlane: "agent"})
		require.NoError(t, err)
		claimed, err := f.q.ClaimAgentSessionForDispatch(ctx, sessionID, run.ID)
		require.NoError(t, err)
		require.True(t, claimed)
		slug, err := f.q.GetRepoOwnerSlugAndNameByID(ctx, box.RepositoryID)
		require.NoError(t, err)

		joined, err := f.boxes.CreateAgentWorkspace(ctx, CreateAgentWorkspaceInput{RepositoryID: box.RepositoryID, UserID: f.person,
			SessionID: sessionID, RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName})
		require.NoError(t, err, "the dispatch gets a working box, never a refusal")
		require.Equal(t, box.ID, joined.WorkspaceID, "the branch's own box serves the turn")
		require.Zero(t, f.hosted.starts, "the quiesced box is still running: no wake, no refusal")
		current := f.box(t)
		require.Equal(t, "running", current.Status)
		require.Equal(t, workspaceapi.WorkspaceRunning, f.guest.state)
		require.True(t, current.HeadPushTokenID.Valid, "the box publishes with a fresh head token")
		require.NotEqual(t, firstHead, current.HeadPushTokenID.Int64)

		dispatcher := &recordingAgentFlowDispatcher{}
		f.agent.flowDispatcher = dispatcher
		payload, err := json.Marshal(agentTaskPayload{MessageHistory: []agentTaskPayloadMessage{{Role: "user", Content: "add slugify with tests"}}})
		require.NoError(t, err)
		d := &agentDispatch{svc: f.agent, ctx: ctx, payload: payload,
			input: DispatchAgentRunInput{SessionID: sessionID, RepositoryID: box.RepositoryID, UserID: f.person, RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName}}
		d.run.ID = run.ID
		require.NoError(t, d.admitCodingTurn())
		require.Len(t, dispatcher.launches, 1, "the turn reaches the coding host, which runs its test step")
		f.agent.flowDispatcher = nil
	}

	t.Run("a second message on the same session", func(t *testing.T) {
		request(t, f.session)
	})
	t.Run("a new session on the same repository", func(t *testing.T) {
		session, err := f.agent.CreateSession(f.ctx, CreateAgentSessionInput{RepositoryID: box.RepositoryID, UserID: f.person, Title: "second"})
		require.NoError(t, err)
		request(t, session.ID)
	})
}
