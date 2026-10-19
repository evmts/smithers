package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/stretchr/testify/require"
)

func TestChatProgressProjectionSurvivesReloadAndExcludesRequestData(t *testing.T) {
	f := newContextFixture(t)
	grant := f.admit(t, "progress-projection", "private-prompt-sentinel", true, true, false)
	record := ProgressRecord{Stage: "cloning", RequestID: grant.LegID, TurnID: grant.TurnID, RunID: grant.RunID, Generation: grant.Generation, MachineID: "machine-1", ReservationID: "reservation-1"}
	require.NoError(t, f.handler.Store.recordProgress(t.Context(), grant, record))
	// A new store reads the persisted metadata, not the observer's memory.
	reloaded, err := NewStore(f.handler.Store.pool)
	require.NoError(t, err)
	view, err := reloaded.SharedEntries(t.Context(), f.scope, "main", true)
	require.NoError(t, err)
	require.Len(t, view.Entries, 1)
	require.Len(t, view.Entries[0].Progress, 2)
	last := view.Entries[0].Progress[1]
	require.Equal(t, "cloning", last.Stage)
	require.Equal(t, "machine-1", last.MachineID)
	require.Equal(t, "reservation-1", last.ReservationID)
	raw, err := json.Marshal(view.Entries[0].Progress)
	require.NoError(t, err)
	require.NotContains(t, string(raw), "private-prompt-sentinel")
	require.NotContains(t, string(raw), grant.Token)
	baseline, err := reloaded.SharedEntries(t.Context(), f.scope, "main")
	require.NoError(t, err)
	require.Empty(t, baseline.Entries[0].Progress, "model-context readers do not acquire execution metadata")
	request := httptest.NewRequest(http.MethodGet, "/api/conversations/main", nil)
	request.Header.Set("X-Smithers-Chat-Trace", "1")
	request.Header.Set("X-Smithers-Chat-Progress", "1")
	response := httptest.NewRecorder()
	router := authenticatedRoutes(f.handler, f.scope.UserID, f.scope.Owner)
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var projected SharedConversation
	require.NoError(t, json.NewDecoder(response.Body).Decode(&projected))
	require.Equal(t, view.Entries[0].Progress, projected.Entries[0].Progress)
	// Existing clients use a strict decoder and know the trace header only.
	legacy := httptest.NewRequest(http.MethodGet, "/api/conversations/main", nil)
	legacy.Header.Set("X-Smithers-Chat-Trace", "1")
	previous := httptest.NewRecorder()
	router.ServeHTTP(previous, legacy)
	require.Equal(t, http.StatusOK, previous.Code)
	var legacyView SharedConversation
	require.NoError(t, json.NewDecoder(previous.Body).Decode(&legacyView))
	require.Empty(t, legacyView.Entries[0].Progress, "progress requires an explicit opt-in so older strict clients keep decoding")
}

func TestChatProgressRejectsExpiredAndTerminalProducers(t *testing.T) {
	store, clock := clockedStore(needStore(t))
	scope, runID, journal := testScope(), "progress-fence-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	grant, err := store.Claim(t.Context(), scope, accepted.TurnID, time.Minute)
	require.NoError(t, err)
	record := ProgressRecord{Stage: "model", RequestID: grant.LegID, TurnID: grant.TurnID, RunID: grant.RunID, Generation: grant.Generation}
	clock.advance(time.Minute)
	require.ErrorIs(t, store.recordProgress(t.Context(), grant, record), ErrProducerFenced)
	current, err := store.Claim(t.Context(), scope, accepted.TurnID, time.Minute)
	require.NoError(t, err)
	require.ErrorIs(t, store.recordProgress(t.Context(), grant, record), ErrProducerFenced)
	require.NoError(t, store.FailProducer(t.Context(), current, "host_failed"))
	require.ErrorIs(t, store.recordProgress(t.Context(), current, record), ErrProducerFenced)
}

func TestDispatcherCapacityRefusesFirstAttemptWithinTenSeconds(t *testing.T) {
	store, clock := clockedStore(needStore(t))
	scope, runID, journal := testScope(), "capacity-fast-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	started := clock.Now()
	attempts := 0
	d, err := NewDispatcher(store, fullFleetHost{attempts: &attempts, message: "private-provider-payload-sentinel"}, 1, time.Minute)
	require.NoError(t, err)
	var logs bytes.Buffer
	d.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	d.runOne(t.Context(), Candidate{Scope: scope, TurnID: accepted.TurnID})
	state, terminal, err := store.GetState(t.Context(), scope, accepted.TurnID)
	require.NoError(t, err)
	require.True(t, terminal, "known zero capacity must end the first attempt, not schedule a capacity retry")
	require.Equal(t, StateFailed, state)
	require.LessOrEqual(t, clock.Now().Sub(started), 10*time.Second)
	require.Equal(t, 1, attempts)
	require.NotContains(t, logs.String(), "private-provider-payload-sentinel")
	page, err := store.Replay(t.Context(), ReplayInput{Scope: scope, RunID: runID, Journal: journal})
	require.NoError(t, err)
	var receipt map[string]any
	require.NoError(t, json.Unmarshal(page.Batches[len(page.Batches)-1].Frames[0], &receipt))
	require.Equal(t, "host_no_capacity", receipt["code"])
	var raw []byte
	require.NoError(t, store.pool.QueryRow(t.Context(), `SELECT progress FROM chat_turns WHERE id=$1`, accepted.TurnID).Scan(&raw))
	var records []map[string]any
	require.NoError(t, json.Unmarshal(raw, &records))
	var stages []string
	for _, record := range records {
		stages = append(stages, record["stage"].(string))
		require.Equal(t, accepted.TurnID, record["turnId"])
		require.Equal(t, runID, record["runId"])
		require.Equal(t, journal.LegID, record["requestId"])
	}
	require.Equal(t, []string{"admitted", "allocating", "refused"}, stages)
	require.Equal(t, "host_no_capacity", records[2]["code"])
	// The original request remains durable and can be resubmitted under a new key.
	var request []byte
	require.NoError(t, store.pool.QueryRow(t.Context(), `SELECT request_payload FROM chat_turns WHERE id=$1`, accepted.TurnID).Scan(&request))
	require.JSONEq(t, string(requestFor(runID)), string(request))
}

func TestDispatcherCapacityAvailableKeepsSlowLaunchAndStages(t *testing.T) {
	store, clock := clockedStore(needStore(t))
	scope, runID, journal := testScope(), "capacity-ok-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	host := chatRuntimeUnitHost(func(ctx context.Context, grant ProducerGrant) error {
		clock.advance(11 * time.Second) // Slow capacity is not evidence of zero capacity.
		ports.ReportChatAllocation(ctx, ports.ChatStageCloning, "sandbox-7", "machine-7", "reservation-7")
		ports.ReportChatProgress(ctx, ports.ChatStageHostRequest, "")
		_, err := store.Commit(ctx, CommitInput{TurnID: grant.TurnID, Generation: grant.Generation, Token: grant.Token, Expected: grant.Cursor, Frames: []json.RawMessage{done(runID, "stop")}})
		return err
	})
	d, err := NewDispatcher(store, host, 1, time.Minute)
	require.NoError(t, err)
	d.runOne(t.Context(), Candidate{Scope: scope, TurnID: accepted.TurnID})
	state, terminal, err := store.GetState(t.Context(), scope, accepted.TurnID)
	require.NoError(t, err)
	require.True(t, terminal)
	require.Equal(t, StateCompleted, state)
	var raw []byte
	require.NoError(t, store.pool.QueryRow(t.Context(), `SELECT progress FROM chat_turns WHERE id=$1`, accepted.TurnID).Scan(&raw))
	var records []map[string]any
	require.NoError(t, json.Unmarshal(raw, &records))
	var stages []string
	for _, record := range records {
		stages = append(stages, record["stage"].(string))
	}
	require.Equal(t, []string{"admitted", "allocating", "cloning", "model", "verifying"}, stages)
	for _, record := range records[2:] {
		require.Equal(t, "machine-7", record["machineId"])
		require.Equal(t, "reservation-7", record["reservationId"])
	}
}

func TestDispatcherCapacityRefusesProductAllocationWithinTenSeconds(t *testing.T) {
	store, clock := clockedStore(needStore(t))
	scope, runID, journal := testScope(), "capacity-api-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	started := clock.Now()
	host := chatRuntimeUnitHost(func(context.Context, ProducerGrant) error { return pkgerrors.NoCapacity("private-allocation-sentinel") })
	d, err := NewDispatcher(store, host, 1, time.Minute)
	require.NoError(t, err)
	d.runOne(t.Context(), Candidate{Scope: scope, TurnID: accepted.TurnID})
	state, terminal, err := store.GetState(t.Context(), scope, accepted.TurnID)
	require.NoError(t, err)
	require.True(t, terminal, "product no_capacity is as conclusive as the fleet envelope")
	require.Equal(t, StateFailed, state)
	require.LessOrEqual(t, clock.Now().Sub(started), 10*time.Second)
	page, err := store.Replay(t.Context(), ReplayInput{Scope: scope, RunID: runID, Journal: journal})
	require.NoError(t, err)
	var receipt map[string]any
	require.NoError(t, json.Unmarshal(page.Batches[0].Frames[0], &receipt))
	require.Equal(t, "host_no_capacity", receipt["code"])
}
