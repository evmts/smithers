package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// Hosted coding is open only to the users a deployment lists
// (agents.hosted_coding_user_ids, PM d-6jzbq9 and d-d97hx9). These tests pin
// the gate on the coding dispatch path: a refused user costs no row, no token,
// no Flow admission, no workspace and no box, and the session says why.

// hostedCodingEffects counts every side effect a coding dispatch can have.
type hostedCodingEffects struct {
	runs        int
	agentTokens int
	repoTokens  int
	boxes       int
	workspaces  int
	quotaChecks int
	terminal    []db.UpdateAgentSessionTerminalStatusParams
	failures    []db.AgentSessionFailure
	dispatcher  *recordingAgentFlowDispatcher
}

type countingAgentWorkspaces struct{ effects *hostedCodingEffects }

func (w countingAgentWorkspaces) CheckAgentWorkspaceQuota(context.Context, int64) error {
	w.effects.quotaChecks++
	return nil
}

func (w countingAgentWorkspaces) CreateAgentWorkspace(context.Context, CreateAgentWorkspaceInput) (AgentWorkspaceResult, error) {
	w.effects.workspaces++
	return AgentWorkspaceResult{WorkspaceID: "workspace", VMID: "vm"}, nil
}
func (countingAgentWorkspaces) ReleaseAgentWorkspace(context.Context, string, string) (AgentWorkspaceRelease, error) {
	return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse}, nil
}
func (countingAgentWorkspaces) SnapshotAgentWorkspace(context.Context, string, string) (string, error) {
	return "", nil
}

func newHostedCodingService(t *testing.T, users string) (*AgentService, *hostedCodingEffects) {
	t.Helper()
	admitted, err := config.ParseHostedCodingUserIDs(users)
	require.NoError(t, err)
	effects := &hostedCodingEffects{dispatcher: &recordingAgentFlowDispatcher{}}
	dq := &mockAgentDispatchQuerier{
		createWorkflowRunFn: func(_ context.Context, arg db.CreateWorkflowRunParams) (db.WorkflowRun, error) {
			effects.runs++
			return db.WorkflowRun{ID: 10, RepositoryID: arg.RepositoryID, Status: arg.Status}, nil
		},
		updateWorkflowRunAgentTokenFn: func(_ context.Context, arg db.UpdateWorkflowRunAgentTokenParams) (db.WorkflowRun, error) {
			effects.agentTokens++
			return db.WorkflowRun{ID: arg.ID, AgentTokenHash: arg.AgentTokenHash}, nil
		},
		createAccessTokenFn: func(_ context.Context, arg db.CreateAccessTokenParams) (db.AccessToken, error) {
			effects.repoTokens++
			return db.AccessToken{ID: 41, UserID: arg.UserID, Name: arg.Name}, nil
		},
		updateAgentSessionTerminalStatusFn: func(_ context.Context, arg db.UpdateAgentSessionTerminalStatusParams) (db.AgentSession, error) {
			effects.terminal = append(effects.terminal, arg)
			session := sampleDBAgentSession(arg.ID, 101, 9, "hosted coding")
			session.Status = arg.Status
			return session, nil
		},
		recordAgentSessionFailureFn: func(_ context.Context, sessionID string, failure db.AgentSessionFailure) (db.AgentSessionFailureRecord, bool, error) {
			effects.failures = append(effects.failures, failure)
			session := sampleDBAgentSession(sessionID, 101, 9, "hosted coding")
			session.Status = "failed"
			return db.AgentSessionFailureRecord{Session: session}, true, nil
		},
	}
	svc := newTestDispatchService(dq, nil)
	svc.sandbox = &mockSandboxVMClient{createVMFn: func(context.Context, sandbox.CreateRequest) (sandbox.CreateResult, error) {
		effects.boxes++
		return sandbox.CreateResult{ID: "vm"}, nil
	}}
	svc.workspaces = countingAgentWorkspaces{effects: effects}
	svc.flowDispatcher = effects.dispatcher
	WithAgentHostedCodingUsers(admitted)(svc)
	return svc, effects
}

func hostedCodingInput(userID int64) DispatchAgentRunInput {
	return DispatchAgentRunInput{
		SessionID: "6492fbde-3fd6-4e85-85c1-34b749b7df48", RepositoryID: 101, UserID: userID,
		RepoOwner: "org", RepoName: "repo",
	}
}

func requireHostedCodingRefusal(t *testing.T, err error) {
	t.Helper()
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeHostedCodingNotOpen, apiErr.Code)
	assert.Equal(t, 403, apiErr.Status)
	assert.Equal(t, "Hosted coding isn't open for your account yet", apiErr.Message)
}

func TestHostedCodingRefusesAnUnlistedUserBeforeAnyEffect(t *testing.T) {
	for name, users := range map[string]string{"listed others": "12,34", "nobody": ""} {
		t.Run(name, func(t *testing.T) {
			svc, effects := newHostedCodingService(t, users)
			input := hostedCodingInput(9)

			_, err := svc.DispatchAgentRun(context.Background(), input)
			requireHostedCodingRefusal(t, err)

			assert.Zero(t, effects.runs, "no workflow run row")
			assert.Zero(t, effects.agentTokens, "no agent token minted")
			assert.Zero(t, effects.repoTokens, "no clone or repository token minted")
			assert.Empty(t, effects.dispatcher.launches, "no Flow admission")
			assert.Zero(t, effects.quotaChecks, "refused before the workspace quota is read")
			assert.Zero(t, effects.workspaces, "no workspace provisioned")
			assert.Zero(t, effects.boxes, "no box created")

			// The session shows the refusal: it fails without a run, with a
			// typed reason whose sentence is the one the caller got. Waiting
			// or retrying does not open the gate; only the operator does.
			require.Len(t, effects.terminal, 1)
			assert.Equal(t, input.SessionID, effects.terminal[0].ID)
			assert.Equal(t, "failed", effects.terminal[0].Status)
			assert.False(t, effects.terminal[0].ExpectedWorkflowRunID.Valid, "no run exists to expect")
			assert.Equal(t, []db.AgentSessionFailure{{
				Code: "hosted_coding_not_open", Reason: "Hosted coding isn't open for your account yet", Retryable: false,
			}}, effects.failures)
		})
	}
}

func TestHostedCodingAdmitsListedUsersAndEveryone(t *testing.T) {
	for _, tc := range []struct {
		name   string
		users  string
		userID int64
	}{
		{"listed", "12,34", 12},
		{"also listed", "12,34", 34},
		{"everyone", "*", 9},
	} {
		t.Run(tc.name, func(t *testing.T) {
			svc, effects := newHostedCodingService(t, tc.users)
			_, err := svc.DispatchAgentRun(context.Background(), hostedCodingInput(tc.userID))
			var apiErr *pkgerrors.APIError
			if err != nil && assert.ErrorAs(t, err, &apiErr) {
				assert.NotEqual(t, pkgerrors.CodeHostedCodingNotOpen, apiErr.Code)
			}
			assert.Equal(t, 1, effects.runs, "dispatch proceeds past the gate")
			assert.Len(t, effects.dispatcher.launches, 1, "the turn reaches Flow admission")
			assert.Empty(t, effects.failures)
		})
	}
}

// The allowlist gates hosted coding turns only. A dispatch that would not run
// one (no Flow dispatcher, or no workspace backend) is not this gate's call.
func TestHostedCodingGateLeavesOtherDispatchPathsAlone(t *testing.T) {
	owned := DispatchAgentRunInput{SessionID: "s", UserID: 9, RepoOwner: "org", RepoName: "repo"}
	for name, svc := range map[string]*AgentService{
		"no flow dispatcher": {workspaces: stubAgentWorkspaceBackend{}},
		"no workspace":       {flowDispatcher: &recordingAgentFlowDispatcher{}},
	} {
		t.Run(name, func(t *testing.T) {
			dispatch := &agentDispatch{ctx: context.Background(), svc: svc, input: owned}
			require.False(t, dispatch.codingDispatchEnabled())
			require.NoError(t, dispatch.refuseUnlistedCodingUser())
		})
	}
}

// The durable message worker is how a posted chat message becomes a coding
// turn in production. A refused user's message settles with a typed receipt,
// creates no run and admits no Flow request, and the session read carries the
// typed refusal while the turn ends with the same sentence as its reply.
func TestHostedCodingRefusalSettlesTheMessageAndShowsOnTheSession(t *testing.T) {
	service, input := newBoundaryMessageSession(t)
	dispatcher := &recordingAgentFlowDispatcher{}
	service.dispatchQ = db.New(service.messagePool)
	service.flowDispatcher = dispatcher
	service.workspaces = stubAgentWorkspaceBackend{}
	// No WithAgentHostedCodingUsers: the zero value admits nobody.

	messageID := appendBoundaryMessage(t, service, input)
	runBoundaryMessageWorker(t, service)
	requireBoundaryReceipt(t, service, input, messageID, "hosted_coding_not_open")

	session, err := service.GetSession(t.Context(), input.SessionID)
	require.NoError(t, err)
	assert.Equal(t, "failed", session.Status)
	require.NotNil(t, session.ReasonCode)
	require.NotNil(t, session.Reason)
	assert.Equal(t, "hosted_coding_not_open", *session.ReasonCode)
	assert.Contains(t, agentSessionFailureCodes, *session.ReasonCode, "codes come from the closed vocabulary")
	assert.Equal(t, "Hosted coding isn't open for your account yet", *session.Reason)
	assert.False(t, session.Retryable)
	var reply string
	require.NoError(t, service.messagePool.QueryRow(t.Context(), `SELECT p.content->>'value' FROM agent_messages m JOIN agent_parts p ON p.message_id=m.id WHERE m.session_id=$1 AND m.role='assistant' ORDER BY m.sequence DESC LIMIT 1`, input.SessionID).Scan(&reply))
	assert.Equal(t, "Hosted coding isn't open for your account yet", reply, "the turn ends with the refusal as its reply")
	var runs int
	require.NoError(t, service.messagePool.QueryRow(t.Context(), `SELECT count(*) FROM workflow_runs WHERE repository_id=$1`, input.RepositoryID).Scan(&runs))
	assert.Zero(t, runs)
	assert.Empty(t, dispatcher.launches)
}
