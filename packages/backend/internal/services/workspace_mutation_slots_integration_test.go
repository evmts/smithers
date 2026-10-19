package services

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// THE MUTATION SLOT CAP (CEO a-jrqf09, PM d-7cjbv3; smithers#4347 is the
// real fix). A workspace mutation holds its authorization transaction for
// its whole run, and its own reads take further pool connections. Capping
// the holders at a third of the pool leaves every holder a connection; the
// rest wait briefly, then are refused retryably.

func TestTheMutationCapIsAThirdOfThePool(t *testing.T) {
	for maxConns, want := range map[int32]int{1: 1, 2: 1, 3: 1, 12: 4, 25: 8} {
		require.Equal(t, want, WorkspaceMutationConcurrencyFor(maxConns), "a pool of %d connections", maxConns)
	}
}

// Concurrent mutations, each reading through the pool while it holds its
// authorization transaction, all finish on a pool smaller than their count.
// Without the cap the same load deadlocks the pool.
func TestConcurrentMutationsFinishOnASmallPoolUnderTheCap(t *testing.T) {
	// meet holders inside their transactions before any reads, so an uncapped
	// run deterministically has two holders each waiting for a connection.
	run := func(t *testing.T, capped bool, meet int32, ctx context.Context) []error {
		f := newAgentBoxRelease(t, "running")
		svc, small := f.smallPoolService(t, 2)
		if capped {
			WithWorkspaceMutationConcurrency(WorkspaceMutationConcurrencyFor(small.Config().MaxConns))(svc)
		}
		row := f.box(t)
		var inside atomic.Int32
		errs := make([]error, 6)
		var wg sync.WaitGroup
		for i := range errs {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				errs[i] = svc.withBranchMachineMutation(ctx, row, f.person, func(ctx context.Context) error {
					inside.Add(1)
					for deadline := time.Now().Add(2 * time.Second); inside.Load() < meet && time.Now().Before(deadline); {
						time.Sleep(10 * time.Millisecond)
					}
					_, err := svc.q.GetWorkspace(ctx, row.ID)
					time.Sleep(20 * time.Millisecond)
					return err
				})
			}(i)
		}
		done := make(chan struct{})
		go func() { wg.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(30 * time.Second):
			t.Fatal("mutations hung on a small pool")
		}
		return errs
	}
	t.Run("under the cap every mutation finishes", func(t *testing.T) {
		for i, err := range run(t, true, 1, context.Background()) {
			require.NoError(t, err, "mutation %d", i)
		}
	})
	t.Run("without the cap the pool deadlocks until the deadline", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		failed := 0
		for _, err := range run(t, false, 2, ctx) {
			if err != nil {
				failed++
			}
		}
		require.NotZero(t, failed, "uncapped holders wait on each other's connections")
	})
}

// At production's pool sizes (the API's SMITHERS_DATABASE_MAX_CONNS=10 and
// the worker's 12), twenty concurrent mutations, each reading through the
// pool while it holds its transaction, all finish within their budget: none
// exhausts the pool. The cap comes from the pool's own config, as compose
// wires it: max(1, MaxConns/3).
func TestTwentyConcurrentMutationsFinishOnTheAPIAndWorkerPools(t *testing.T) {
	for _, pool := range []struct {
		name  string
		conns int32
	}{{"the API's pool", 10}, {"the worker's pool", 12}} {
		t.Run(pool.name, func(t *testing.T) {
			f := newAgentBoxRelease(t, "running")
			svc, small := f.smallPoolService(t, pool.conns)
			WithWorkspaceMutationConcurrency(WorkspaceMutationConcurrencyFor(small.Config().MaxConns))(svc)
			want := max(1, int(small.Config().MaxConns)/3)
			require.Equal(t, want, cap(svc.mutationSlots), "a third of the configured pool")
			row := f.box(t)
			var peak, inside atomic.Int32
			errs := make([]error, 20)
			var wg sync.WaitGroup
			start := time.Now()
			for i := range errs {
				wg.Add(1)
				go func(i int) {
					defer wg.Done()
					errs[i] = svc.withBranchMachineMutation(context.Background(), row, f.person, func(ctx context.Context) error {
						now := inside.Add(1)
						defer inside.Add(-1)
						for {
							seen := peak.Load()
							if now <= seen || peak.CompareAndSwap(seen, now) {
								break
							}
						}
						_, err := svc.q.GetWorkspace(ctx, row.ID)
						time.Sleep(20 * time.Millisecond)
						return err
					})
				}(i)
			}
			done := make(chan struct{})
			go func() { wg.Wait(); close(done) }()
			select {
			case <-done:
			case <-time.After(60 * time.Second):
				t.Fatal("mutations hung on the pool")
			}
			for i, err := range errs {
				require.NoError(t, err, "mutation %d", i)
			}
			require.Equal(t, int32(want), peak.Load(), "the cap admits exactly its share at once, never more")
			require.Less(t, time.Since(start), workspaceMutationSlotWait, "all within the slot wait")
		})
	}
}

// A mutation that finds every slot held waits a bounded time, even with
// context.Background(), then is refused retryably with the holder count
// logged; the session names it as a busy box start.
func TestAMutationThatFindsEverySlotHeldIsRefusedRetryably(t *testing.T) {
	wait := workspaceMutationSlotWait
	workspaceMutationSlotWait = 300 * time.Millisecond
	t.Cleanup(func() { workspaceMutationSlotWait = wait })
	f := newAgentBoxRelease(t, "running")
	WithWorkspaceMutationConcurrency(1)(f.boxes)
	row := f.box(t)
	holding, release := make(chan struct{}), make(chan struct{})
	held := make(chan error, 1)
	go func() {
		held <- f.boxes.withBranchMachineMutation(context.Background(), row, f.person, func(context.Context) error {
			close(holding)
			<-release
			return nil
		})
	}()
	<-holding

	start := time.Now()
	err := f.boxes.withBranchMachineMutation(context.Background(), row, f.person, func(context.Context) error { return nil })

	require.Less(t, time.Since(start), 3*time.Second, "the wait is bounded")
	var apiErr *pkgerrors.APIError
	require.True(t, errors.As(err, &apiErr))
	require.Equal(t, pkgerrors.CodeServiceUnavailable, apiErr.Code, "retryable")
	require.Equal(t, http.StatusServiceUnavailable, apiErr.Status, "the API answers 503")
	require.Equal(t, workspaceMutationBusyRetryAfter, apiErr.RetryAfter, "with a Retry-After the client backs off by")
	require.ErrorIs(t, apiErr.Cause(), errWorkspaceStartsBusy)
	require.ErrorIs(t, apiErr.Cause(), context.DeadlineExceeded)
	require.Contains(t, f.logs.String(), "workspace mutation refused: every slot is held")
	require.Contains(t, f.logs.String(), "holders=1")
	failure := agentSessionFailureForError(err)
	require.Equal(t, "box_busy", failure.Code)
	require.True(t, failure.Retryable)
	require.Equal(t, "The workspace service is busy starting other boxes; try again in a moment.", failure.Reason)

	recorder := httptest.NewRecorder()
	pkgerrors.WriteError(recorder, apiErr)
	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Equal(t, "5", recorder.Header().Get("Retry-After"))
	var body struct {
		Code       string `json:"code"`
		Message    string `json:"message"`
		RetryAfter int    `json:"retry_after"`
		Details    struct {
			ReasonCode string `json:"reason_code"`
			Retryable  bool   `json:"retryable"`
		} `json:"details"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.Equal(t, "service_unavailable", body.Code)
	require.Equal(t, failure.Reason, body.Message, "the 503 says the session's sentence")
	require.Equal(t, 5, body.RetryAfter)
	require.Equal(t, "box_busy", body.Details.ReasonCode, "typed as the session read types it")
	require.True(t, body.Details.Retryable)

	close(release)
	require.NoError(t, <-held)
	require.NoError(t, f.boxes.withBranchMachineMutation(context.Background(), row, f.person, func(context.Context) error { return nil }),
		"a freed slot admits the next mutation")
}

// A mutation nested inside one that holds a slot reuses that slot; with a cap
// of one it would otherwise wait on itself and be refused.
func TestANestedMutationReusesItsParentsSlot(t *testing.T) {
	svc := &WorkspaceService{}
	WithWorkspaceMutationConcurrency(1)(svc)
	outer, releaseOuter, err := svc.acquireMutationSlot(context.Background())
	require.NoError(t, err)
	start := time.Now()
	_, releaseInner, err := svc.acquireMutationSlot(outer)
	require.NoError(t, err)
	require.Less(t, time.Since(start), time.Second, "the nested mutation did not wait")
	require.Equal(t, 1, len(svc.mutationSlots), "one slot held for both")
	releaseInner()
	require.Equal(t, 1, len(svc.mutationSlots), "the nested release frees nothing")
	releaseOuter()
	require.Zero(t, len(svc.mutationSlots))
}

// A caller that gives up while waiting for a slot gets its own context error,
// not a busy refusal, and is not logged as refused.
func TestACallerThatGivesUpWaitingIsNotRefusedAsBusy(t *testing.T) {
	svc := &WorkspaceService{}
	WithWorkspaceMutationConcurrency(1)(svc)
	_, release, err := svc.acquireMutationSlot(context.Background())
	require.NoError(t, err)
	defer release()
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(50*time.Millisecond, cancel)

	_, _, err = svc.acquireMutationSlot(ctx)

	require.ErrorIs(t, err, context.Canceled)
	require.False(t, isWorkspaceMutationBusy(err))
}
