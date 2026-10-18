package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
)

// refusedLaunchHost refuses one turn's launch before any host exists, the way
// the model host slots refuse over the owner's cap or the fleet's ceiling.
type refusedLaunchHost struct {
	turnID string
	err    error
	calls  atomic.Int32
}

func (h *refusedLaunchHost) RunTurn(_ context.Context, grant ProducerGrant) error {
	if grant.TurnID != h.turnID {
		return errors.New("not this test's turn")
	}
	h.calls.Add(1)
	return h.err
}

// lastFrame is the final frame a reconnecting client replays for a sealed turn.
func lastFrame(t *testing.T, store *Store, scope Scope, runID string, journal JournalRequest) string {
	t.Helper()
	page, err := store.Replay(context.Background(), ReplayInput{Scope: scope, RunID: runID, Journal: journal, Limit: 8})
	require.NoError(t, err)
	require.True(t, page.Terminal)
	require.NotEmpty(t, page.Batches)
	frames := page.Batches[len(page.Batches)-1].Frames
	return string(frames[len(frames)-1])
}

// An owner at their model host cap waits on their own running chats, not on
// the fleet, so a rerun meets the same refusal. The turn ends once with the
// cap's sentence; the failure is counted as chat_guests_busy, and the receipt
// carries no code until every client decodes it.
func TestDispatcherEndsAnOwnerCapRefusalOnceWithItsSentence(t *testing.T) {
	for name, refusal := range map[string]error{
		"bare":    &ports.ModelHostsBusy{Limit: 2},
		"wrapped": fmt.Errorf("launch owner model host: %w", &ports.ModelHostsBusy{Limit: 2}),
	} {
		t.Run(name, func(t *testing.T) {
			store := needStore(t)
			scope, runID, journal := testScope(), "guests-busy-"+uuid.NewString(), testJournal()
			accepted := admit(t, store, scope, runID, journal)
			host := &refusedLaunchHost{turnID: accepted.TurnID, err: refusal}
			dispatcher, err := NewDispatcher(store, host, 1, time.Minute)
			require.NoError(t, err)
			fastRetries(dispatcher)
			dispatcher.logger = slog.New(slog.DiscardHandler)
			require.Equal(t, StateFailed, runDispatcherUntilTerminal(t, store, dispatcher, scope, accepted.TurnID))
			require.Equal(t, int32(1), host.calls.Load(), "an owner cap refusal is not rerun")
			require.Equal(t, 1.0, testutil.ToFloat64(dispatcher.metrics.failures.WithLabelValues("chat_guests_busy")))
			require.JSONEq(t,
				fmt.Sprintf(`{"runId":%q,"type":"done","error":"You have 2 chats answering right now. Wait for one to finish, then try again."}`, runID),
				lastFrame(t, store, scope, runID, journal))
		})
	}
}

// The fleet ceiling is a full fleet, not an owner's cap: the turn defers on
// the capacity ladder and is sealed host_no_capacity only when its attempts
// run out, with the sentence that says nothing was lost.
func TestDispatcherDefersAFullModelHostFleetAsCapacity(t *testing.T) {
	store := needStore(t)
	scope, runID, journal := testScope(), "fleet-full-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	host := &refusedLaunchHost{turnID: accepted.TurnID, err: fmt.Errorf("%w: %w", ports.ErrModelHostsFull,
		&sandbox.StatusError{StatusCode: 503, Code: sandbox.NoCapacityCode, Message: "every model host the fleet allows is running"})}
	dispatcher, err := NewDispatcher(store, host, 1, time.Minute)
	require.NoError(t, err)
	fastRetries(dispatcher)
	dispatcher.logger = slog.New(slog.DiscardHandler)
	require.Equal(t, StateFailed, runDispatcherUntilTerminal(t, store, dispatcher, scope, accepted.TurnID))
	// Every attempt before the last left the turn open for another one.
	require.Equal(t, int32(maxProducerAttempts), host.calls.Load())
	require.Zero(t, testutil.ToFloat64(dispatcher.metrics.failures.WithLabelValues("chat_guests_busy")))
	require.JSONEq(t,
		fmt.Sprintf(`{"runId":%q,"type":"done","code":"host_no_capacity","error":"Chat is busy right now. Nothing here was lost; try again in a moment."}`, runID),
		lastFrame(t, store, scope, runID, journal))
}

// pendingStore is a store on its own database. The turns these tests leave
// waiting must not reach the shared database's recovery scan, where later
// dispatcher tests would run them.
func pendingStore(t *testing.T) *Store {
	t.Helper()
	pool, _ := postgresfixture.NewProductDatabase(t)
	store, err := NewStore(pool)
	require.NoError(t, err)
	return store
}

type pendingTurn struct {
	runID   string
	journal JournalRequest
}

func newPendingTurn() pendingTurn {
	return pendingTurn{runID: "pending-" + uuid.NewString(), journal: testJournal()}
}

func admitPending(store *Store, scope Scope, turn pendingTurn, limit int) (AdmitResult, error) {
	return store.Admit(context.Background(), AdmitInput{Scope: scope, RunID: turn.runID, Journal: turn.journal, Request: requestFor(turn.runID), PendingLimit: limit})
}

func ownerTurnRows(t *testing.T, store *Store, scope Scope) int {
	t.Helper()
	var rows int
	require.NoError(t, store.pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_turns WHERE user_id=$1`, scope.UserID).Scan(&rows))
	return rows
}

func TestAdmitRefusesAnOwnersNewTurnPastThePendingLimit(t *testing.T) {
	store := pendingStore(t)
	owner, other := testScope(), testScope()
	// Another owner's full backlog does not count against this owner.
	for range 5 {
		result, err := admitPending(store, other, newPendingTurn(), 5)
		require.NoError(t, err)
		require.Equal(t, "accepted", result.Status)
	}
	turns := make([]pendingTurn, 5)
	held := make([]AdmitResult, 5)
	for i := range turns {
		turns[i] = newPendingTurn()
		result, err := admitPending(store, owner, turns[i], 5)
		require.NoError(t, err)
		require.Equal(t, "accepted", result.Status)
		held[i] = result
	}

	sixth := newPendingTurn()
	_, err := admitPending(store, owner, sixth, 5)
	var full *PendingFull
	require.ErrorAs(t, err, &full)
	require.Equal(t, 5, full.Limit)
	require.ErrorIs(t, err, ErrPendingFull)
	require.EqualError(t, err, "You have 5 messages waiting for an answer. Wait for one to be answered, then try again.")
	require.Equal(t, 5, ownerTurnRows(t, store, owner), "a refused turn leaves no row")

	// A replay of a held turn is not a new turn, so a full backlog never refuses it.
	replay, err := admitPending(store, owner, turns[0], 5)
	require.NoError(t, err)
	require.Equal(t, "existing", replay.Status)
	require.Equal(t, held[0].TurnID, replay.TurnID)

	// Once one turn ends, the refused turn admits.
	grant, err := store.Claim(context.Background(), owner, held[0].TurnID, time.Minute)
	require.NoError(t, err)
	require.NoError(t, store.FailProducer(context.Background(), grant, "host_failed"))
	result, err := admitPending(store, owner, sixth, 5)
	require.NoError(t, err)
	require.Equal(t, "accepted", result.Status)

	// A limit of 0 is no bound.
	result, err = admitPending(store, owner, newPendingTurn(), 0)
	require.NoError(t, err)
	require.Equal(t, "accepted", result.Status)
}

// Replicas admit at once: the owner's lock makes the count and the insert one
// decision, so a burst cannot slip past the limit.
func TestAdmitHoldsThePendingLimitAcrossConcurrentAdmissions(t *testing.T) {
	store := pendingStore(t)
	owner := testScope()
	const limit, senders = 5, 10
	statuses, errs := make([]string, senders), make([]error, senders)
	start := make(chan struct{})
	var admissions sync.WaitGroup
	for i := range senders {
		admissions.Go(func() {
			<-start
			result, err := admitPending(store, owner, newPendingTurn(), limit)
			statuses[i], errs[i] = result.Status, err
		})
	}
	close(start)
	admissions.Wait()
	accepted, refused := 0, 0
	for i := range senders {
		switch {
		case errs[i] == nil && statuses[i] == "accepted":
			accepted++
		case errors.Is(errs[i], ErrPendingFull):
			refused++
		default:
			t.Fatalf("admission %d: status=%q err=%v", i, statuses[i], errs[i])
		}
	}
	require.Equal(t, limit, accepted)
	require.Equal(t, senders-limit, refused)
	require.Equal(t, limit, ownerTurnRows(t, store, owner))
}

func TestPromptAnswersAFullPendingBacklogWithARetryable429(t *testing.T) {
	store := pendingStore(t)
	alice, err := seed.CreateUser(t.Context(), store.pool, "pending-alice")
	require.NoError(t, err)
	// The dispatcher never runs, so every admitted prompt stays waiting.
	dispatcher, err := NewDispatcher(store, failingHost{err: errors.New("never dispatched")}, 8, time.Minute)
	require.NoError(t, err)
	handler := &Handler{PrivateConversations: true, PendingPerOwner: 2, Store: store, Dispatcher: dispatcher, credentials: newTurnCredentials()}
	server := archiveServer(t, handler, alice, "pending-alice")
	first := submitPrompt(t, server, "main", "one", "First question")
	submitPrompt(t, server, "main", "two", "Second question")

	body, err := json.Marshal(map[string]string{"prompt": "Third question", "idempotencyKey": "three"})
	require.NoError(t, err)
	response := postJSON(t, server.Client(), server.URL+"/api/conversations/main/prompt", body)
	defer response.Body.Close()
	require.Equal(t, http.StatusTooManyRequests, response.StatusCode)
	require.Equal(t, "5", response.Header.Get("Retry-After"))
	raw, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.JSONEq(t, `{"class":"capacity","code":"chat_turns_pending","message":"You have 2 messages waiting for an answer. Wait for one to be answered, then try again."}`, string(raw))

	// Resending a prompt the server already holds is a replay, not a new turn.
	require.Equal(t, first.TurnID, submitPrompt(t, server, "main", "one", "First question").TurnID)
}
