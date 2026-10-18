package database

import (
	"context"
	"errors"
	"maps"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
)

// acquireFailureRecorder is the metrics surface NewPool is handed: query
// durations, which these cases ignore, and the acquire failures they read.
type acquireFailureRecorder struct {
	mu       sync.Mutex
	failures map[string]int
}

func (r *acquireFailureRecorder) ObserveDBQueryDuration(string, float64) {}

func (r *acquireFailureRecorder) ObserveDBPoolAcquireFailure(pool, duty, reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failures == nil {
		r.failures = map[string]int{}
	}
	r.failures[pool+"/"+duty+"/"+reason]++
}

func (r *acquireFailureRecorder) snapshot() map[string]int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return maps.Clone(r.failures)
}

// The core pool counts every acquire it does not serve where it fails, with
// the duty the caller named and a closed reason, and never a served one.
func TestPool_CountsAcquiresItDoesNotServeByDutyAndReason(t *testing.T) {
	recorder := &acquireFailureRecorder{}
	pool, err := NewPool(context.Background(), config.DatabaseConfig{
		URL: testdb.New(t).URL, MaxConns: 1, MinConns: 1, MaxConnLifetime: 60, MaxConnIdleTime: 30,
	}, recorder)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	held, err := pool.Acquire(context.Background())
	require.NoError(t, err)
	require.Empty(t, recorder.snapshot(), "a served acquire was counted as a failure")

	// The one connection is held, so a bounded acquire waits out its bound.
	bounded, cancel := context.WithTimeout(WithPoolDuty(context.Background(), "workspace_provision_claim"), 50*time.Millisecond)
	_, err = pool.Acquire(bounded)
	cancel()
	require.ErrorIs(t, err, context.DeadlineExceeded)

	// An unnamed caller is attributed to nobody, not dropped.
	unnamed, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	_, err = pool.Acquire(unnamed)
	cancel()
	require.Error(t, err)

	// A caller cancelled while it waits.
	waiting, cancelWaiting := context.WithCancel(WithPoolDuty(context.Background(), "public_mirror_seed"))
	go func() { time.Sleep(20 * time.Millisecond); cancelWaiting() }()
	_, err = pool.Acquire(waiting)
	require.ErrorIs(t, err, context.Canceled)

	require.Equal(t, map[string]int{
		"core/workspace_provision_claim/deadline": 1,
		"core/unattributed/deadline":              1,
		"core/public_mirror_seed/canceled":        1,
	}, recorder.snapshot())

	// A query through the pool is an acquire too.
	queryCtx, cancel := context.WithTimeout(WithPoolDuty(context.Background(), "workspace_provision_backlog"), 50*time.Millisecond)
	err = pool.QueryRow(queryCtx, "SELECT 1").Scan(new(int))
	cancel()
	require.Error(t, err)
	require.Equal(t, 1, recorder.snapshot()["core/workspace_provision_backlog/deadline"])

	// Released, the pool serves again and counts nothing more.
	held.Release()
	before := recorder.snapshot()
	require.NoError(t, pool.QueryRow(WithPoolDuty(context.Background(), "workspace_provision_claim"), "SELECT 1").Scan(new(int)))
	require.Equal(t, before, recorder.snapshot())

	// A closed pool is unavailable, never mistaken for a deadline.
	pool.Close()
	_, err = pool.Acquire(context.Background())
	require.Error(t, err)
	require.Equal(t, 1, recorder.snapshot()["core/unattributed/unavailable"])
}

func TestPoolAcquireFailureReasonIsClosed(t *testing.T) {
	require.Equal(t, PoolAcquireFailureDeadline, poolAcquireFailureReason(context.DeadlineExceeded))
	require.Equal(t, PoolAcquireFailureCanceled, poolAcquireFailureReason(context.Canceled))
	require.Equal(t, PoolAcquireFailureUnavailable, poolAcquireFailureReason(errors.New("dial tcp: connection refused to secret-host:5432")))
	require.Equal(t, UnattributedPoolDuty, PoolDuty(context.Background()))
	require.Equal(t, UnattributedPoolDuty, PoolDuty(WithPoolDuty(context.Background(), "")))
}

// A pool constructed without metrics, or a tracer handed no pool name, counts
// nothing and does not fail an acquire.
func TestPool_UnnamedTracerCountsNoAcquireFailure(t *testing.T) {
	recorder := &acquireFailureRecorder{}
	tracer := NewMetricsTracer(recorder)
	tracer.TraceAcquireEnd(context.Background(), nil, pgxpool.TraceAcquireEndData{Err: context.DeadlineExceeded})
	require.Empty(t, recorder.snapshot())
	var nilTracer *MetricsTracer
	nilTracer.TraceAcquireEnd(context.Background(), nil, pgxpool.TraceAcquireEndData{Err: context.DeadlineExceeded})
}
