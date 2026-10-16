package chat

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// stallingHost is the production hang of #3812: the provider started and the
// first frames committed, then the host stopped answering altogether. The real
// one was waiting on a journal callback its sandbox could no longer send.
type stallingHost struct {
	store   *Store
	turnID  string
	batches int
	entered chan struct{}
	stopped chan struct{}
}

func (h stallingHost) RunTurn(ctx context.Context, grant ProducerGrant) error {
	if grant.TurnID != h.turnID {
		return errors.New("not this test's turn")
	}
	if err := h.store.MarkProviderStarted(ctx, grant); err != nil {
		return err
	}
	cursor := grant.Cursor
	for range h.batches {
		result, err := h.store.Commit(ctx, CommitInput{TurnID: grant.TurnID, Generation: grant.Generation,
			Token: grant.Token, Expected: cursor, Frames: []json.RawMessage{frame(grant.RunID, "x")}})
		if err != nil {
			return err
		}
		cursor = result.Cursor
	}
	close(h.entered)
	<-ctx.Done()
	close(h.stopped)
	return ctx.Err()
}

// Regression for #3812: a host that commits nothing more and reaches no new
// stage must have its attempt interrupted, so the turn ends with a receipt the
// person reads. Before this bound the producer renewed the lease for over an
// hour and held its dispatcher worker.
func TestDispatcherEndsTurnWhoseHostStopsMakingProgress(t *testing.T) {
	store := needStore(t)
	scope, runID, journal := testScope(), "stall-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	host := stallingHost{store: store, turnID: accepted.TurnID, batches: 2, entered: make(chan struct{}), stopped: make(chan struct{})}
	dispatcher, err := NewDispatcher(store, host, 1, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	dispatcher.silence = 500 * time.Millisecond
	state := runDispatcherUntilTerminal(t, store, dispatcher, scope, accepted.TurnID)
	// The provider started, so the turn's output is unknown: it seals uncertain
	// rather than rerunning against the same provider.
	if state != StateUncertain {
		t.Fatalf("stalled turn ended %s, want uncertain", state)
	}
	select {
	case <-host.stopped:
	case <-time.After(dbWait):
		t.Fatal("the dispatcher left the wedged host running")
	}
	if got := testutil.ToFloat64(dispatcher.metrics.failures.WithLabelValues("host_stalled")); got != 1 {
		t.Fatalf("host_stalled counter = %v, want 1", got)
	}
	inspection, err := store.InspectTurn(context.Background(), accepted.TurnID)
	if err != nil {
		t.Fatal(err)
	}
	// The two batches the host did commit are kept, plus the terminal one.
	if inspection.HeadBatch != 3 || inspection.ProviderStartedAt == nil {
		t.Fatalf("inspection head_batch=%d provider_started=%v", inspection.HeadBatch, inspection.ProviderStartedAt)
	}
}

// A host that keeps committing batches is making progress even though it
// reports no new stage, so the no-progress bound must never interrupt it.
func TestDispatcherKeepsTurnWhoseHostCommitsBatchesWithoutNewStages(t *testing.T) {
	store := needStore(t)
	scope, journal := testScope(), testJournal()
	runID := "paced-" + uuid.NewString()
	accepted := admit(t, store, scope, runID, journal)
	dispatcher, err := NewDispatcher(store, streamingHost{store: store, ticks: 12, every: 100 * time.Millisecond}, 1, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	// Each batch lands well within the bound, but the whole turn runs for
	// several times the bound and reports no stage at all.
	dispatcher.silence = 400 * time.Millisecond
	if state := runDispatcherUntilTerminal(t, store, dispatcher, scope, accepted.TurnID); state != StateCompleted {
		t.Fatalf("paced healthy turn ended %s, want completed", state)
	}
	if got := testutil.ToFloat64(dispatcher.metrics.failures.WithLabelValues("host_stalled")); got != 0 {
		t.Fatalf("host_stalled counter = %v, want 0", got)
	}

}
