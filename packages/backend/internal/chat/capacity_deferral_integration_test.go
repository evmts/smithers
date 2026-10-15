package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/testutil"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// fullFleetHost is the production refusal of turn f413964a: the sandbox
// provider had no host with room, so the launch was refused before any worker
// ran and before any provider started. The controller answers 503 with the
// typed code its envelope publishes.
type fullFleetHost struct{ attempts *int }

func (h fullFleetHost) RunTurn(context.Context, ProducerGrant) error {
	if h.attempts != nil {
		*h.attempts++
	}
	return fmt.Errorf("create isolated chat sandbox: %w", &sandbox.StatusError{
		StatusCode: http.StatusServiceUnavailable,
		ErrorCode:  sandbox.NoCapacityCode,
		Code:       sandbox.NoCapacityCode,
		Provider:   "microsandbox",
		Message:    "no healthy worker has sufficient capacity",
	})
}

// A full fleet is a deferral, not a host fault. Turn f413964a's generations 2
// and 3 were both refused for capacity and both recorded the unclassified code
// host_failed, which reads as the model host breaking, and the person was told
// the host "stopped before completing the turn" — a verdict on a host that
// never started. The same misattribution was fixed one layer down in the
// controller's logs (plue#832); this is its API-side half.
func TestDispatcherNamesAFullFleetAsCapacityAndNotAHostFailure(t *testing.T) {
	store := needStore(t)
	scope, runID, journal := testScope(), "capacity-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	attempts := 0
	dispatcher, err := NewDispatcher(store, fullFleetHost{attempts: &attempts}, 1, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	fastRetries(dispatcher)
	var logs bytes.Buffer
	dispatcher.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	if state := runDispatcherUntilTerminal(t, store, dispatcher, scope, accepted.TurnID); state != StateFailed {
		t.Fatalf("a turn out of attempts against a full fleet ended %s, want failed", state)
	}
	deferrals, misattributed := 0, 0
	for line := range strings.Lines(logs.String()) {
		var record map[string]any
		if json.Unmarshal([]byte(line), &record) != nil || record["turn_id"] != accepted.TurnID {
			continue
		}
		switch record["code"] {
		case codeHostNoCapacity:
			deferrals++
		case "host_failed", "host_stalled":
			misattributed++
		}
	}
	if misattributed != 0 {
		t.Fatalf("a capacity refusal was recorded as a host fault %d times: %s", misattributed, logs.String())
	}
	if deferrals != maxProducerAttempts {
		t.Fatalf("capacity deferrals logged = %d, want %d: %s", deferrals, maxProducerAttempts, logs.String())
	}
	if got := testutil.ToFloat64(dispatcher.metrics.failures.WithLabelValues(codeHostNoCapacity)); got < maxProducerAttempts {
		t.Fatalf("%s counter = %v", codeHostNoCapacity, got)
	}
	// The person reads why the turn ended: the fleet was busy and nothing of
	// theirs was lost, not that their model host broke.
	page, err := store.Replay(context.Background(), ReplayInput{Scope: scope, RunID: runID, Journal: journal, Limit: 8})
	if err != nil || len(page.Batches) == 0 {
		t.Fatalf("replay: batches=%d err=%v", len(page.Batches), err)
	}
	frames := page.Batches[len(page.Batches)-1].Frames
	receipt := string(frames[len(frames)-1])
	if !strings.Contains(receipt, hostNoCapacityMessage) {
		t.Fatalf("terminal receipt does not name capacity: %s", receipt)
	}
	// The sentence is prose. The code beside it is what a client branches on,
	// so it never has to read the message to know the cause.
	var sealed struct {
		Code string `json:"code"`
	}
	if json.Unmarshal([]byte(receipt), &sealed) != nil || sealed.Code != codeHostNoCapacity {
		t.Fatalf("terminal receipt carries no %s code: %s", codeHostNoCapacity, receipt)
	}
}

// Generations 2 and 3 of turn f413964a were dispatched 1 s and 2 s after the
// refusal before them — the host-failure ladder — so the turn spent two of its
// five attempts inside forty seconds while the fleet was still full, and the
// one attempt left had to cover the whole drain. A deferral waits the interval
// the error registry publishes for no_capacity instead.
func TestCapacityDeferralWaitsTheRegistrysRetryAfter(t *testing.T) {
	store := needStore(t)
	scope, runID, journal := testScope(), "capacity-wait-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	attempts := 0
	// A short claim lease keeps a live attempt's own renewal far below the
	// deferral interval this test reads, so the two can never be confused.
	dispatcher, err := NewDispatcher(store, fullFleetHost{attempts: &attempts}, 1, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	// Recovery scans fast; only the deferral interval under test is real.
	dispatcher.scan = 20 * time.Millisecond
	entry, ok := pkgerrors.Lookup(pkgerrors.CodeNoCapacity)
	if !ok || entry.RetryAfter <= 0 {
		t.Fatalf("the error registry publishes no RetryAfter for %s", pkgerrors.CodeNoCapacity)
	}
	want := time.Duration(entry.RetryAfter) * time.Second
	ctx, cancel := context.WithCancel(context.Background())
	finished := make(chan error, 1)
	go func() { finished <- dispatcher.Run(ctx, 1) }()
	defer func() {
		cancel()
		<-finished
	}()
	if !dispatcher.Enqueue(Candidate{Scope: scope, TurnID: accepted.TurnID}) {
		t.Fatal("enqueue refused")
	}
	deadline := time.Now().Add(dbWait)
	for time.Now().Before(deadline) {
		inspection, err := store.InspectTurn(context.Background(), accepted.TurnID)
		if err != nil {
			t.Fatal(err)
		}
		if inspection.Terminal {
			t.Fatalf("the turn was sealed instead of deferred after %d attempt(s)", attempts)
		}
		if attempts > 0 && inspection.LeaseExpiresAt != nil {
			// The rerun is held off until the published interval has passed,
			// with slack for the round trips between the refusal and this read.
			if waiting := time.Until(*inspection.LeaseExpiresAt); waiting > want-2*time.Second {
				if attempts != 1 {
					t.Fatalf("the fleet was asked %d times inside one deferral", attempts)
				}
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("a capacity deferral never waited %s; attempts=%d", want, attempts)
}

// The deferral reads one code twice: sandbox.IsNoCapacity decides that a
// refusal is a capacity deferral, and the error registry decides how long to
// hold the rerun. Before this, nothing tied the port's spelling to the
// registry's, so renaming CodeNoCapacity would have left the dispatcher
// detecting refusals it then backed off with the silent 30 s fallback, and the
// workspace pool's own predicate — which stopped reading the registry constant
// when it moved onto the port — recognising nothing at all.
func TestTheDeferralsPortCodeIsTheRegistrysCode(t *testing.T) {
	if sandbox.NoCapacityCode != string(pkgerrors.CodeNoCapacity) {
		t.Fatalf("the provider port spells a capacity refusal %q and the error registry %q; one deferral cannot have two names",
			sandbox.NoCapacityCode, pkgerrors.CodeNoCapacity)
	}
}

// A capacity receipt tells the person nothing of theirs was lost. That is only
// true of a turn no provider ever started: the refusal lands before anything
// runs. A turn whose provider did start has its own partial output on screen
// and ends uncertain, so it keeps the uncertain receipt rather than being told
// to send the message again.
func TestACapacityReceiptIsOnlyGivenToATurnNoProviderStarted(t *testing.T) {
	store := needStore(t)
	scope, runID, journal := testScope(), "capacity-started-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	grant, err := store.Claim(context.Background(), scope, accepted.TurnID, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	// Spend every attempt so the next refusal seals the turn instead of
	// deferring it, then record that this generation's provider did start.
	for grant.Generation < maxProducerAttempts {
		if _, err = store.RetryProducer(context.Background(), grant, codeHostNoCapacity, 0); err != nil {
			t.Fatal(err)
		}
		if grant, err = store.Claim(context.Background(), scope, accepted.TurnID, time.Minute); err != nil {
			t.Fatal(err)
		}
	}
	if err = store.MarkProviderStarted(context.Background(), grant); err != nil {
		t.Fatal(err)
	}
	retrying, err := store.RetryProducer(context.Background(), grant, codeHostNoCapacity, 0)
	if err != nil || retrying {
		t.Fatalf("a started provider out of attempts must be sealed: retrying=%v err=%v", retrying, err)
	}
	page, err := store.Replay(context.Background(), ReplayInput{Scope: scope, RunID: runID, Journal: journal, Limit: 8})
	if err != nil || len(page.Batches) == 0 {
		t.Fatalf("replay: batches=%d err=%v", len(page.Batches), err)
	}
	frames := page.Batches[len(page.Batches)-1].Frames
	receipt := string(frames[len(frames)-1])
	if strings.Contains(receipt, hostNoCapacityMessage) {
		t.Fatalf("a turn whose provider started was told nothing was lost and to send it again: %s", receipt)
	}
	state, terminal, err := store.GetState(context.Background(), scope, accepted.TurnID)
	if err != nil || !terminal || state != StateUncertain {
		t.Fatalf("a started provider's turn ended %s terminal=%v err=%v, want uncertain", state, terminal, err)
	}
}
