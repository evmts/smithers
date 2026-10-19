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
type fullFleetHost struct {
	attempts *int
	message  string
}

func (h fullFleetHost) RunTurn(context.Context, ProducerGrant) error {
	if h.attempts != nil {
		*h.attempts++
	}
	message := h.message
	if message == "" {
		message = "no healthy worker has sufficient capacity"
	}
	return fmt.Errorf("create isolated chat sandbox: %w", &sandbox.StatusError{
		StatusCode: http.StatusServiceUnavailable,
		ErrorCode:  sandbox.NoCapacityCode,
		Code:       sandbox.NoCapacityCode,
		Provider:   "microsandbox",
		Message:    message,
	})
}

// A full fleet refuses the first attempt under its own code, never as a host fault.
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
		t.Fatalf("a turn against a full fleet ended %s, want failed", state)
	}
	refusals, misattributed := 0, 0
	for line := range strings.Lines(logs.String()) {
		var record map[string]any
		if json.Unmarshal([]byte(line), &record) != nil || record["turn_id"] != accepted.TurnID {
			continue
		}
		switch record["code"] {
		case codeHostNoCapacity:
			if record["msg"] == "chat turn failed" {
				refusals++
			}
		case "host_failed", "host_stalled":
			misattributed++
		}
	}
	if misattributed != 0 {
		t.Fatalf("a capacity refusal was recorded as a host fault %d times: %s", misattributed, logs.String())
	}
	if refusals != 1 {
		t.Fatalf("capacity refusals logged = %d, want %d: %s", refusals, 1, logs.String())
	}
	if got := testutil.ToFloat64(dispatcher.metrics.failures.WithLabelValues(codeHostNoCapacity)); got < 1 {
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

// A known capacity refusal is terminal and cannot be recovered automatically.
func TestCapacityRefusalDoesNotQueueRecovery(t *testing.T) {
	store, clock := clockedStore(needStore(t))
	scope, runID, journal := testScope(), "capacity-wait-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	attempts := 0
	dispatcher, err := NewDispatcher(store, fullFleetHost{attempts: &attempts}, 1, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	dispatcher.runOne(t.Context(), Candidate{Scope: scope, TurnID: accepted.TurnID})
	clock.advance(time.Hour)
	candidates, err := store.RecoveryCandidates(t.Context(), 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range candidates {
		if candidate.TurnID == accepted.TurnID {
			t.Fatal("capacity refusal scheduled an automatic retry")
		}
	}
	if attempts != 1 {
		t.Fatalf("attempts=%d, want 1", attempts)
	}
}

// The provider and product agree on the capacity refusal code.
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
