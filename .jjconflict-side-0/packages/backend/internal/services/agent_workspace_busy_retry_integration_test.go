package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// busyAgentWorkspaces refuses a turn's box start as box_busy refusals times
// (every time when refusals is negative), then starts it; or fails every
// start with other, when set.
type busyAgentWorkspaces struct {
	stubAgentWorkspaceBackend
	refusals int32
	other    error
	calls    atomic.Int32
}

func (b *busyAgentWorkspaces) CreateAgentWorkspace(context.Context, CreateAgentWorkspaceInput) (AgentWorkspaceResult, error) {
	n := b.calls.Add(1)
	if b.other != nil {
		return AgentWorkspaceResult{}, b.other
	}
	if b.refusals < 0 || n <= b.refusals {
		return AgentWorkspaceResult{}, fmt.Errorf("join: %w", errWorkspaceMutationBusy(context.DeadlineExceeded))
	}
	return AgentWorkspaceResult{WorkspaceID: "box", VMID: "guest"}, nil
}

// busyRetryDispatch is a turn's dispatch at its box start, on the session of
// the coding completion fixture, with the retry's timings shrunk.
func busyRetryDispatch(t *testing.T, backend *busyAgentWorkspaces, budget time.Duration) (*agentDispatch, *AgentService, string) {
	t.Helper()
	backoff, backoffCap, retryBudget := agentWorkspaceBusyBackoff, agentWorkspaceBusyBackoffCap, agentWorkspaceBusyRetryBudget
	agentWorkspaceBusyBackoff, agentWorkspaceBusyBackoffCap, agentWorkspaceBusyRetryBudget = 5*time.Millisecond, 20*time.Millisecond, budget
	t.Cleanup(func() {
		agentWorkspaceBusyBackoff, agentWorkspaceBusyBackoffCap, agentWorkspaceBusyRetryBudget = backoff, backoffCap, retryBudget
	})
	service, _, update := codingCompletionFixture(t)
	service.SetWorkspaceBackend(backend)
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
	ctx := context.Background()
	q := service.dispatchQ.(*db.Queries)
	run, err := q.GetWorkflowRunByRunID(ctx, projection.WorkflowRunID)
	require.NoError(t, err)
	task, err := q.GetWorkflowTaskByRunID(ctx, projection.WorkflowRunID)
	require.NoError(t, err)
	session, err := q.GetAgentSession(ctx, projection.SessionID)
	require.NoError(t, err)
	d := &agentDispatch{svc: service, ctx: ctx, run: run, task: task, step: db.WorkflowStep{ID: task.WorkflowStepID},
		input: DispatchAgentRunInput{SessionID: session.ID, RepositoryID: session.RepositoryID, UserID: session.UserID, RepoOwner: "owner", RepoName: "repo"}}
	return d, service, session.ID
}

// A turn's start is background work in the worker's message dispatch, so a
// box start refused because every mutation slot is held (box_busy) waits and
// retries within the turn instead of failing it (PM d-e53dx5).
func TestATurnRetriesABusyBoxStartWithinItsBudget(t *testing.T) {
	backend := &busyAgentWorkspaces{refusals: 3}
	d, service, sessionID := busyRetryDispatch(t, backend, 5*time.Second)

	require.NoError(t, d.createAgentWorkspaceVM())

	require.Equal(t, int32(4), backend.calls.Load(), "three refusals, then the start")
	require.Equal(t, "box", d.workspaceID)
	require.True(t, d.vmCreated)
	read := readSessionFailure(t, service, sessionID)
	require.Nil(t, read.ReasonCode, "a start that succeeded on a retry fails nothing")
}

// Once the budget is spent the session fails with box_busy, retryable, and
// one reply holding the sentence: the turn ends, never hangs.
func TestATurnStillRefusedBusyPastItsBudgetFailsAsBoxBusy(t *testing.T) {
	backend := &busyAgentWorkspaces{refusals: -1}
	d, service, sessionID := busyRetryDispatch(t, backend, 100*time.Millisecond)

	start := time.Now()
	require.Error(t, d.createAgentWorkspaceVM())

	require.Less(t, time.Since(start), 2*time.Second, "the retries stop at the budget")
	require.Greater(t, backend.calls.Load(), int32(1), "it retried before failing")
	read := readSessionFailure(t, service, sessionID)
	require.NotNil(t, read.ReasonCode)
	require.Equal(t, "box_busy", *read.ReasonCode)
	require.NotNil(t, read.Retryable)
	require.True(t, *read.Retryable)
	require.NotNil(t, read.Reason)
	require.Equal(t, "The workspace service is busy starting other boxes; try again in a moment.", *read.Reason)
	require.Contains(t, agentSessionFailureCodes, *read.ReasonCode)
	role, text, _ := lastReplyText(t, service, sessionID)
	require.Equal(t, "assistant", role)
	require.Equal(t, *read.Reason, text)
}

// Only box_busy is retried: any other refusal fails the turn on its first
// answer, and a turn whose own context ended stops retrying at once.
func TestOnlyABusyBoxStartIsRetried(t *testing.T) {
	t.Run("a full pool fails on its first answer", func(t *testing.T) {
		backend := &busyAgentWorkspaces{other: &pkgerrors.APIError{Status: http.StatusServiceUnavailable, Code: pkgerrors.CodeNoCapacity, Message: "no healthy worker"}}
		d, service, sessionID := busyRetryDispatch(t, backend, 5*time.Second)
		require.Error(t, d.createAgentWorkspaceVM())
		require.Equal(t, int32(1), backend.calls.Load())
		read := readSessionFailure(t, service, sessionID)
		require.NotNil(t, read.ReasonCode)
		require.Equal(t, "box_unavailable", *read.ReasonCode)
	})
	t.Run("a turn whose context ended stops retrying", func(t *testing.T) {
		backend := &busyAgentWorkspaces{refusals: -1}
		d, service, sessionID := busyRetryDispatch(t, backend, 5*time.Second)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		d.ctx = ctx
		require.Error(t, d.createAgentWorkspaceVM())
		require.Equal(t, int32(1), backend.calls.Load())
		read := readSessionFailure(t, service, sessionID)
		require.NotNil(t, read.ReasonCode)
		require.Equal(t, "box_busy", *read.ReasonCode)
	})
}
