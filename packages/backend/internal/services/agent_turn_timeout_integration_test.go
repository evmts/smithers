package services

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// cancelledFlowRequests records the Flow requests the reaper cancels; the
// reaper calls it from its own goroutine.
type cancelledFlowRequests struct {
	mu       sync.Mutex
	requests []string
}

func (*cancelledFlowRequests) Admit(context.Context, flowdispatch.LaunchRequest) (jobs.RequestReceipt, error) {
	return jobs.RequestReceipt{}, nil
}

func (c *cancelledFlowRequests) CancelRequest(_ context.Context, scope jobs.Scope, requestID string) (jobs.Operation, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.requests = append(c.requests, requestID)
	return jobs.Operation{ID: "operation-1", Scope: scope, State: jobs.StateWaiting}, nil
}

func (c *cancelledFlowRequests) list() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.requests...)
}

// requireTurnEnded checks what a person and the product see after a turn
// timed out: the session read's typed reason, a final reply with the same
// sentence, a run that is no longer queued or running, and a released run
// (finalizeAgentSession expired the run's agent token).
func requireTurnEnded(t *testing.T, service *AgentService, update flowdispatch.ProjectionUpdate, status, reason string) {
	t.Helper()
	ctx := context.Background()
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))

	read := readSessionFailure(t, service, projection.SessionID)
	require.Equal(t, status, read.Status)
	require.NotNil(t, read.ReasonCode)
	require.Equal(t, agentFailureTurnTimedOut, *read.ReasonCode)
	require.NotNil(t, read.Reason)
	require.Equal(t, reason, *read.Reason)
	require.NotNil(t, read.Retryable)
	require.True(t, *read.Retryable)

	role, text, count := lastReplyText(t, service, projection.SessionID)
	require.Equal(t, "assistant", role)
	require.Equal(t, reason, text, "the turn ends with the session's sentence")
	require.Equal(t, 2, count, "the request and exactly one timeout reply")

	q := service.dispatchQ.(*db.Queries)
	run, err := q.GetWorkflowRunByRunID(ctx, projection.WorkflowRunID)
	require.NoError(t, err)
	require.NotContains(t, []string{"queued", "running"}, run.Status, "the run never stays running")
	task, err := q.GetWorkflowTaskByRunID(ctx, projection.WorkflowRunID)
	require.NoError(t, err)
	require.Equal(t, "failed", task.Status)
	require.True(t, run.AgentTokenExpiresAt.Valid && run.AgentTokenExpiresAt.Time.Before(time.Now()),
		"the release path revoked the run's agent token")
}

// G1 (2026-10-20 launch): run 17989's turn finished in its box, but the
// product worker never heard, so the session stayed active and the card said
// "Model working" with no end. The backend's own wall-clock bound now ends a
// turn whose box never reports, whatever the box is doing. The test injects a
// one-second bound for HostedAgentTurnTimeout.
func TestATurnThatNeverCompletesEndsAtTheTurnBound(t *testing.T) {
	service, _, update := codingCompletionFixture(t)
	ctx := context.Background()
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
	cancels := &cancelledFlowRequests{}
	service.SetFlowDispatcher(cancels)
	q := service.dispatchQ.(*db.Queries)
	started := time.Now().UTC()
	_, err := q.UpdateAgentSessionStartedAt(ctx, db.UpdateAgentSessionStartedAtParams{
		ID: projection.SessionID, StartedAt: pgtype.Timestamptz{Time: started, Valid: true},
	})
	require.NoError(t, err)

	newTicker := agentSessionReaperNewTicker
	agentSessionReaperNewTicker = func(time.Duration) *time.Ticker { return time.NewTicker(20 * time.Millisecond) }
	t.Cleanup(func() { agentSessionReaperNewTicker = newTicker })
	const bound = time.Second
	reaper, stop := context.WithCancel(ctx)
	t.Cleanup(stop)
	service.StartSessionReaper(reaper, bound)

	// Nothing ends the turn before its bound.
	time.Sleep(bound / 2)
	session, err := q.GetAgentSession(ctx, projection.SessionID)
	require.NoError(t, err)
	require.Equal(t, "active", session.Status, "a turn inside its bound keeps running")

	require.Eventually(t, func() bool {
		messages, err := service.ListMessages(ctx, projection.SessionID, 1, 100)
		return err == nil && len(messages) == 2
	}, 10*time.Second, 20*time.Millisecond, "the reaper ends the turn soon after its bound")
	stop()

	session, err = q.GetAgentSession(ctx, projection.SessionID)
	require.NoError(t, err)
	ran := session.FinishedAt.Time.Sub(session.StartedAt.Time)
	require.GreaterOrEqual(t, ran, bound, "the turn ran its whole bound")
	require.Less(t, ran, bound+5*time.Second)
	requireTurnEnded(t, service, update, "failed", agentSessionTurnTimedOutAfter(ran).Reason)
	require.Regexp(t, `^This turn stopped after \d+ seconds? without finishing\.$`, agentSessionTurnTimedOutAfter(ran).Reason)
	require.Equal(t, []string{agentFlowRequestID(projection.WorkflowRunID)}, cancels.list(), "the box's turn is cancelled")

	// A completion that arrives after the bound changes nothing.
	require.NoError(t, service.ProjectFlowRuntime(ctx, update))
	requireTurnEnded(t, service, update, "failed", agentSessionTurnTimedOutAfter(ran).Reason)
}

// At the hosted bound the session names the fifteen minutes the turn ran.
func TestAHostedTurnPastFifteenMinutesSaysSo(t *testing.T) {
	service, _, update := codingCompletionFixture(t)
	ctx := context.Background()
	var projection agentFlowProjection
	require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
	q := service.dispatchQ.(*db.Queries)
	_, err := q.UpdateAgentSessionStartedAt(ctx, db.UpdateAgentSessionStartedAtParams{
		ID: projection.SessionID, StartedAt: pgtype.Timestamptz{Time: time.Now().UTC().Add(-HostedAgentTurnTimeout - 30*time.Second), Valid: true},
	})
	require.NoError(t, err)

	require.NoError(t, service.reapExpiredSessions(ctx, HostedAgentTurnTimeout))

	requireTurnEnded(t, service, update, "failed", "This turn stopped after 15 minutes without finishing.")
}

// A shell or test command that blocks forever is killed by the coding host
// at HostedToolCallTimeout, and the host fails the turn with the call-limit
// fault (packages/smithers/agent/test/RunawayGuard.test.ts drives that end).
// The session reads it as turn_timed_out with the command's sentence.
func TestACommandPastTheToolBoundEndsTheTurn(t *testing.T) {
	service, _, update := codingCompletionFixture(t)
	update.State = jobs.StateFailed
	update.Checkpoint.Run = nil
	require.NoError(t, json.Unmarshal([]byte(`{"run":{"runId":"host","flowId":"coding/dispatch","status":"failed",`+
		`"failureFault":"policy","failureTag":"flows/agent/RunawayGuard/CallLimit"}}`), &update.Checkpoint))

	require.NoError(t, service.ProjectFlowRuntime(context.Background(), update))

	requireTurnEnded(t, service, update, "failed", "A command ran longer than 5 minutes and was stopped.")
}

func TestTurnTimeoutSentencesSayHowLong(t *testing.T) {
	for _, tc := range []struct {
		ran  time.Duration
		want string
	}{
		{300 * time.Millisecond, "less than a second"},
		{time.Second, "1 second"},
		{59*time.Second + 900*time.Millisecond, "59 seconds"},
		{time.Minute, "1 minute"},
		{15*time.Minute + 59*time.Second, "15 minutes"},
		{90 * time.Minute, "90 minutes"},
	} {
		require.Equal(t, tc.want, spokenDuration(tc.ran))
	}
	require.Equal(t, "This turn stopped after 15 minutes without finishing.", agentSessionTurnTimedOutAfter(HostedAgentTurnTimeout).Reason)
	require.Equal(t, agentSessionCommandTimedOut, agentSessionFailureForFlow(flowdispatch.RuntimeCheckpoint{Run: &flowruntime.Run{
		Status: "failed", FailureTag: codingToolCallLimitTag,
	}}))
}

// PM d-kppoyr: the turn's clock starts when its message is accepted (the
// confirm, or a typed /change), not when its box is ready. A dispatch that
// runs ten minutes after the message was accepted stamps the acceptance as
// the turn's start, on both the uncapped and the fleet-capped path, so the
// reaper ends it five minutes later, not fifteen.
func TestATurnsClockStartsWhenItsMessageIsAccepted(t *testing.T) {
	for _, capped := range []bool{false, true} {
		t.Run(map[bool]string{false: "uncapped", true: "fleet capped"}[capped], func(t *testing.T) {
			service, pool, update := codingCompletionFixture(t)
			ctx := context.Background()
			var projection agentFlowProjection
			require.NoError(t, json.Unmarshal(update.Checkpoint.Projection, &projection))
			messages, err := service.ListMessages(ctx, projection.SessionID, 1, 100)
			require.NoError(t, err)
			require.Len(t, messages, 1)
			accepted := time.Now().UTC().Add(-10 * time.Minute).Truncate(time.Microsecond)
			_, err = pool.Exec(ctx, `UPDATE agent_messages SET created_at = $2 WHERE id = $1`, messages[0].ID, accepted)
			require.NoError(t, err)
			q := service.dispatchQ.(*db.Queries)
			session, err := q.GetAgentSession(ctx, projection.SessionID)
			require.NoError(t, err)
			if capped {
				service.concurrencyCounter, service.concurrencyMax = q, 10
			}
			d := &agentDispatch{svc: service, ctx: ctx, run: db.WorkflowRun{ID: projection.WorkflowRunID},
				input: DispatchAgentRunInput{SessionID: session.ID, RepositoryID: session.RepositoryID, UserID: session.UserID, TriggerMessageID: messages[0].ID}}

			require.NoError(t, d.loadMessageHistory())
			require.NoError(t, d.reserveFleetSlot())

			session, err = q.GetAgentSession(ctx, projection.SessionID)
			require.NoError(t, err)
			require.True(t, session.StartedAt.Valid)
			require.True(t, accepted.Equal(session.StartedAt.Time), "started_at %s is the acceptance %s", session.StartedAt.Time, accepted)
			sessions, err := q.ListStaleActiveSessions(ctx, pgtype.Timestamptz{Time: time.Now().UTC().Add(-5 * time.Minute), Valid: true})
			require.NoError(t, err)
			require.Len(t, sessions, 1, "five minutes after dispatch, the turn has run fifteen")
		})
	}
}

func TestATurnWithoutItsAcceptedMessageStartsItsClockAtDispatch(t *testing.T) {
	messages := []AgentMessageResponse{{ID: 4, Role: "assistant", CreatedAt: time.Unix(10, 0)}, {ID: 5, Role: "user", CreatedAt: time.Unix(20, 0)}}
	require.Equal(t, time.Unix(20, 0), agentTriggerMessageAcceptedAt(messages, 5))
	require.True(t, agentTriggerMessageAcceptedAt(messages, 4).IsZero(), "only a user message starts a turn")
	require.True(t, agentTriggerMessageAcceptedAt(messages, 6).IsZero())
	require.True(t, agentTriggerMessageAcceptedAt(messages, 0).IsZero())
	before := time.Now().UTC()
	require.False(t, (&agentDispatch{}).turnStartedAt().Before(before))
	require.False(t, (&agentDispatch{acceptedAt: time.Now().Add(time.Hour)}).turnStartedAt().After(time.Now().UTC()),
		"a clock skewed into the future starts at dispatch")
}
