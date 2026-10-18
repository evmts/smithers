package services

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// queuedTurn is a chat turn whose message was accepted: the message and its
// dispatch request are committed, and no worker has dispatched it yet.
type queuedTurn struct {
	service   *AgentService
	pool      *pgxpool.Pool
	sessionID string
	messageID int64
}

func queuedTurnFixture(t *testing.T) queuedTurn {
	t.Helper()
	pool := newProductTestPool(t)
	ctx := context.Background()
	userID, repositoryID := setupTestUserAndRepo(t, pool)
	q := db.New(pool)
	service := NewAgentServiceWithPool(q, pool, WithAgentDispatchQuerier(q), WithAgentQueueTimeout(HostedAgentQueueTimeout))
	session, err := service.CreateSession(ctx, CreateAgentSessionInput{RepositoryID: repositoryID, UserID: userID, Title: "queued"})
	require.NoError(t, err)
	message, err := service.AppendMessageAndDispatch(ctx, DispatchAgentRunInput{
		SessionID: session.ID, RepositoryID: repositoryID, UserID: userID, RepoOwner: "queue-owner", RepoName: "queue-repo",
	}, []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"run this"}`)}})
	require.NoError(t, err)
	return queuedTurn{service: service, pool: pool, sessionID: session.ID, messageID: message.ID}
}

// age lets d pass for the session: every moment it stored (its creation, its
// messages' acceptance, its requests and, once dispatched, its start and end)
// moves d into the past.
func (turn queuedTurn) age(t *testing.T, d time.Duration) {
	t.Helper()
	ctx := context.Background()
	_, err := turn.pool.Exec(ctx, `UPDATE agent_messages SET created_at = created_at - make_interval(secs => $2) WHERE session_id = $1`, turn.sessionID, d.Seconds())
	require.NoError(t, err)
	_, err = turn.pool.Exec(ctx, `UPDATE product_job_requests SET created_at = created_at - make_interval(secs => $2)
		WHERE operation = 'agent-run-dispatch' AND payload->>'SessionID' = $1`, turn.sessionID, d.Seconds())
	require.NoError(t, err)
	_, err = turn.pool.Exec(ctx, `UPDATE agent_sessions SET created_at = created_at - make_interval(secs => $2),
		started_at = started_at - make_interval(secs => $2), finished_at = finished_at - make_interval(secs => $2) WHERE id = $1`, turn.sessionID, d.Seconds())
	require.NoError(t, err)
}

// request is the turn's dispatch request state and its delivery status.
func (turn queuedTurn) request(t *testing.T) (state, delivery string) {
	t.Helper()
	require.NoError(t, turn.pool.QueryRow(context.Background(), `
		SELECT request.state, dispatch.status FROM product_job_requests request
		JOIN product_job_dispatches dispatch ON dispatch.operation_id = request.id
		WHERE request.operation = 'agent-run-dispatch' AND request.request_id = $1`,
		"agent-message:"+strconv.FormatInt(turn.messageID, 10)).Scan(&state, &delivery))
	return state, delivery
}

// claim is a worker taking the session's queued request: the turn leaves
// the queue.
func (turn queuedTurn) claim(t *testing.T) jobs.Claim {
	t.Helper()
	claim, err := turn.service.messageJobs.ClaimForOperations(context.Background(), "dispatch-worker", time.Minute, []string{agentMessageDispatchOperation})
	require.NoError(t, err)
	var input DispatchAgentRunInput
	require.NoError(t, json.Unmarshal(claim.Payload, &input))
	require.Equal(t, turn.sessionID, input.SessionID)
	return claim
}

// allocate is the dispatch beginning to allocate the turn's box, where it
// stamps the turn's start.
func (turn queuedTurn) allocate(t *testing.T) {
	t.Helper()
	session, err := db.New(turn.pool).GetAgentSession(context.Background(), turn.sessionID)
	require.NoError(t, err)
	d := &agentDispatch{svc: turn.service, ctx: context.Background(),
		input: DispatchAgentRunInput{SessionID: session.ID, RepositoryID: session.RepositoryID, UserID: session.UserID, TriggerMessageID: turn.messageID}}
	require.NoError(t, d.reserveFleetSlot())
}

func (turn queuedTurn) session(t *testing.T) db.AgentSession {
	t.Helper()
	session, err := db.New(turn.pool).GetAgentSession(context.Background(), turn.sessionID)
	require.NoError(t, err)
	return session
}

// reap runs one session reaper pass with the hosted bounds.
func (turn queuedTurn) reap(t *testing.T) {
	t.Helper()
	require.NoError(t, turn.service.reapExpiredSessions(context.Background(), HostedAgentTurnTimeout))
}

const boxBusySentence = "The workspace service is busy starting other boxes; try again in a moment."

// requireQueueBoundFailed checks what the person and the product see after a
// turn waited out its queue bound: the session read's typed box_busy reason,
// one final reply with the same sentence, a turn that never started, and a
// request no worker can ever claim.
func requireQueueBoundFailed(t *testing.T, turn queuedTurn) {
	t.Helper()
	read := readSessionFailure(t, turn.service, turn.sessionID)
	require.Equal(t, "failed", read.Status)
	require.NotNil(t, read.ReasonCode)
	require.Equal(t, "box_busy", *read.ReasonCode)
	require.Equal(t, agentSessionBoxBusy.Code, *read.ReasonCode, "one code for a busy workspace service")
	require.NotNil(t, read.Reason)
	require.Equal(t, boxBusySentence, *read.Reason)
	require.NotNil(t, read.Retryable)
	require.True(t, *read.Retryable)

	role, text, count := lastReplyText(t, turn.service, turn.sessionID)
	require.Equal(t, "assistant", role)
	require.Equal(t, boxBusySentence, text, "the turn ends with the session's sentence")
	require.Equal(t, 2, count, "the request and exactly one box_busy reply")

	session := turn.session(t)
	require.False(t, session.StartedAt.Valid, "the turn never started")
	state, delivery := turn.request(t)
	require.Equal(t, "cancelled", state)
	require.Equal(t, "done", delivery)
	// The session read's stage reads the request through GetByRequest: it is
	// terminal, so the turn never reads queued beside its failed session.
	operation, err := turn.service.messageJobs.GetByRequest(context.Background(), repositoryJobFlowScope(session.RepositoryID, session.UserID),
		agentMessageDispatchOperation, "agent-message:"+strconv.FormatInt(turn.messageID, 10))
	require.NoError(t, err)
	require.Equal(t, jobs.StateCancelled, operation.State)
	require.True(t, operation.State.Terminal())
	_, err = turn.service.messageJobs.ClaimForOperations(context.Background(), "late-worker", time.Minute, []string{agentMessageDispatchOperation})
	require.ErrorIs(t, err, jobs.ErrNoWork, "no worker dispatches the turn afterwards")
}

// PM d-qij9n0: an accepted turn may wait for dispatch for
// HostedAgentQueueTimeout. Still queued twenty minutes after its message was
// accepted, it fails with box_busy, retryable, and the box_busy sentence as
// its reason and final reply; its request is cancelled with it, so it never
// starts later.
func TestATurnStillQueuedAtTwentyMinutesFailsBusyAndNeverStarts(t *testing.T) {
	for _, parked := range []bool{false, true} {
		t.Run(map[bool]string{false: "never claimed", true: "parked for a free sandbox"}[parked], func(t *testing.T) {
			turn := queuedTurnFixture(t)
			if parked {
				// A worker refused it for capacity and put it back: still queued.
				claim := turn.claim(t)
				require.NoError(t, turn.service.messageJobs.Abandon(context.Background(), claim, errors.New("message dispatch waiting for capacity"), time.Minute))
			}

			turn.age(t, HostedAgentQueueTimeout-time.Second)
			turn.reap(t)
			require.Equal(t, "active", turn.session(t).Status, "inside its twenty minutes the turn keeps waiting")
			state, delivery := turn.request(t)
			require.Equal(t, "accepted", state)
			require.Equal(t, "ready", delivery)

			turn.age(t, 2*time.Second)
			turn.reap(t)
			requireQueueBoundFailed(t, turn)

			// Another pass changes nothing: one reason, one reply.
			turn.reap(t)
			requireQueueBoundFailed(t, turn)
		})
	}
}

// A turn that leaves the queue inside its twenty minutes keeps running past
// them. A worker claimed its request at acceptance plus nineteen minutes; at
// plus twenty-one the queue bound leaves it alone whether its box allocation
// has begun or not, and its fifteen minutes run from that dispatch.
func TestATurnDispatchedAtNineteenMinutesKeepsRunning(t *testing.T) {
	for _, allocated := range []bool{true, false} {
		t.Run(map[bool]string{true: "box allocation began", false: "claimed, box not yet allocated"}[allocated], func(t *testing.T) {
			turn := queuedTurnFixture(t)
			turn.age(t, 19*time.Minute)
			turn.claim(t)
			if allocated {
				turn.allocate(t)
			}

			turn.age(t, 2*time.Minute)
			turn.reap(t)

			session := turn.session(t)
			require.Equal(t, "active", session.Status, "a dispatched turn is not failed by the queue bound")
			require.NotContains(t, string(session.Metadata), agentSessionFailureCodeKey, "no failure is recorded")
			state, delivery := turn.request(t)
			require.Equal(t, "dispatching", state)
			require.Equal(t, "claimed", delivery)
			if !allocated {
				turn.allocate(t)
			}
			require.True(t, turn.session(t).StartedAt.Valid, "the dispatched turn starts")
		})
	}
}

// The session row tells a queued turn from a started one. Accepted and
// waiting, the session is active with no started_at, and the queue the bound
// reads (listQueuedAgentTurns) holds the turn with its acceptance time. Once a
// worker claims its request it leaves that queue, and once box allocation
// begins, started_at holds that moment.
func TestAQueuedTurnReadsQueuedUntilItsDispatchBegins(t *testing.T) {
	turn := queuedTurnFixture(t)
	ctx := context.Background()
	queuedRead := func() bool {
		var queued bool
		require.NoError(t, turn.pool.QueryRow(ctx,
			`SELECT status = 'active' AND started_at IS NULL FROM agent_sessions WHERE id = $1`, turn.sessionID).Scan(&queued))
		return queued
	}
	inQueue := func() []queuedAgentTurn {
		turns, err := turn.service.listQueuedAgentTurns(ctx, time.Now().UTC().Add(time.Minute))
		require.NoError(t, err)
		return turns
	}

	require.True(t, queuedRead(), "accepted, no box yet: queued")
	turns := inQueue()
	require.Len(t, turns, 1)
	require.Equal(t, turn.sessionID, turns[0].sessionID)
	var accepted time.Time
	require.NoError(t, turn.pool.QueryRow(ctx, `SELECT created_at FROM agent_messages WHERE id = $1`, turn.messageID).Scan(&accepted))
	require.WithinDuration(t, accepted, turns[0].acceptedAt, time.Second, "the queue wait counts from acceptance")
	none, err := turn.service.listQueuedAgentTurns(ctx, accepted.Add(-time.Second))
	require.NoError(t, err)
	require.Empty(t, none, "a turn accepted after the cutoff is not listed")

	turn.claim(t)
	require.Empty(t, inQueue(), "a claimed request has left the queue")
	require.True(t, queuedRead(), "until box allocation begins the session still reads queued")

	before := time.Now().UTC().Truncate(time.Microsecond)
	turn.allocate(t)
	require.False(t, queuedRead(), "box allocation began: started")
	session := turn.session(t)
	require.True(t, session.StartedAt.Valid)
	require.False(t, session.StartedAt.Time.Before(before), "started_at is the dispatch, not the acceptance")
}

// A landing request's author session is reactivated for reviewer feedback
// (DispatchLandingAuthorTurn) long after its last turn ran. The new turn is
// queued: it reads as queued, neither the turn bound (which would count from
// the last turn's start) nor the never-started bound (which would count from
// the last run) fails it while it waits, and its fifteen minutes start at its
// own dispatch.
func TestARedispatchedSessionsTurnStartsItsClockAtItsOwnDispatch(t *testing.T) {
	for _, gap := range []time.Duration{20 * time.Minute, 2 * time.Hour} {
		t.Run(gap.String(), func(t *testing.T) {
			turn := queuedTurnFixture(t)
			ctx := context.Background()
			q := db.New(turn.pool)
			// The first turn runs and completes at T.
			claim := turn.claim(t)
			turn.allocate(t)
			require.NoError(t, turn.service.messageJobs.Complete(ctx, claim, json.RawMessage(`{}`)))
			first, err := q.UpdateAgentSessionTerminalStatus(ctx, db.UpdateAgentSessionTerminalStatusParams{
				ID: turn.sessionID, Status: "completed", FinishedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
			})
			require.NoError(t, err)
			require.True(t, first.StartedAt.Valid)

			// At T+gap a reviewer returns the landing request: a second message
			// is accepted on the same session and waits in the queue.
			turn.age(t, gap)
			require.NoError(t, turn.service.DispatchLandingAuthorTurn(ctx, LandingAgentTurnDispatchInput{
				SessionID: turn.sessionID, RepositoryID: first.RepositoryID, UserID: first.UserID,
				RepoOwner: "queue-owner", RepoName: "queue-repo", Number: 1, Feedback: "address the review",
			}))
			turn.age(t, time.Minute)
			turn.reap(t)
			session := turn.session(t)
			require.Equal(t, "active", session.Status, "the queued second turn is not reaped")
			require.False(t, session.StartedAt.Valid, "the queued second turn reads as queued")
			require.NotContains(t, string(session.Metadata), agentSessionFailureCodeKey)

			// Its dispatch starts its own fifteen minutes.
			turn.claim(t)
			turn.allocate(t)
			turn.age(t, HostedAgentTurnTimeout-5*time.Second)
			turn.reap(t)
			require.Equal(t, "active", turn.session(t).Status, "inside its own fifteen minutes the second turn runs")
			turn.age(t, 10*time.Second)
			turn.reap(t)
			read := readSessionFailure(t, turn.service, turn.sessionID)
			require.Equal(t, "failed", read.Status)
			require.NotNil(t, read.ReasonCode)
			require.Equal(t, agentFailureTurnTimedOut, *read.ReasonCode)
			require.NotNil(t, read.Reason)
			require.Equal(t, "This turn stopped after 15 minutes without finishing.", *read.Reason)
		})
	}
}

// The queue bound's one transaction carries the whole failure: the moment it
// commits, before any announcement or release, the session read already says
// box_busy, retryable, with its sentence and final reply, and the request is
// cancelled. A worker dying after the commit leaves nothing half-said.
func TestAQueuedTurnsBoxBusyCommitsWithItsFailure(t *testing.T) {
	turn := queuedTurnFixture(t)
	ctx := context.Background()
	turn.age(t, HostedAgentQueueTimeout+time.Second)
	turns, err := turn.service.listQueuedAgentTurns(ctx, time.Now().UTC().Add(-HostedAgentQueueTimeout))
	require.NoError(t, err)
	require.Len(t, turns, 1)

	_, failed, err := turn.service.failQueuedTurn(ctx, turns[0])
	require.NoError(t, err)
	require.True(t, failed)
	requireQueueBoundFailed(t, turn)

	_, failed, err = turn.service.failQueuedTurn(ctx, turns[0])
	require.NoError(t, err)
	require.False(t, failed, "a turn already failed is not failed twice")
}
