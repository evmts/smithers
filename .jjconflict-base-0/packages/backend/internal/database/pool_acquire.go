package database

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ACQUIRES A POOL DID NOT SERVE, counted where they fail.
//
// smithers_db_connections_active over _max reads 4 of 4 for a worker that is
// working and for one whose every duty is refusing, and pgxpool's own
// cancellation total names neither the pool nor who asked. During plue#839 a
// worker refused 21,600 claims an hour and nothing an alert could read moved.
// smithers_db_pool_acquire_failures_total{pool,duty,reason} is counted at the
// pool boundary itself, so it sees every failed acquire whichever code path
// made it, and a duty that names itself on its context is attributed.

// CorePoolName is the pool label of the product's core pool.
const CorePoolName = "core"

// UnattributedPoolDuty is the duty label of an acquire whose context names no
// duty: a request, or a duty not yet attributed.
const UnattributedPoolDuty = "unattributed"

// The reasons an acquire fails, a closed set. headroom is not produced here:
// it is a duty refusing BEFORE it acquires, because the pool was measured
// unable to serve it whole, and that duty records it itself.
const (
	PoolAcquireFailureDeadline    = "deadline"
	PoolAcquireFailureCanceled    = "canceled"
	PoolAcquireFailureUnavailable = "unavailable"
	PoolAcquireFailureHeadroom    = "headroom"
)

// DBPoolAcquireFailureObserver receives acquires a pool did not serve. Every
// argument is a closed source constant.
type DBPoolAcquireFailureObserver interface {
	ObserveDBPoolAcquireFailure(pool, duty, reason string)
}

type poolDutyKey struct{}

// WithPoolDuty attributes the acquires made under ctx to duty, which must be
// a closed source constant: it becomes a metric label.
func WithPoolDuty(ctx context.Context, duty string) context.Context {
	return context.WithValue(ctx, poolDutyKey{}, duty)
}

// PoolDuty is the duty ctx names, or UnattributedPoolDuty.
func PoolDuty(ctx context.Context) string {
	if duty, ok := ctx.Value(poolDutyKey{}).(string); ok && duty != "" {
		return duty
	}
	return UnattributedPoolDuty
}

// poolAcquireFailureReason classifies an acquire error onto the closed set. A
// pool that is closed or cannot connect is unavailable; no error text leaves.
func poolAcquireFailureReason(err error) string {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return PoolAcquireFailureDeadline
	case errors.Is(err, context.Canceled):
		return PoolAcquireFailureCanceled
	default:
		return PoolAcquireFailureUnavailable
	}
}

var _ pgxpool.AcquireTracer = (*MetricsTracer)(nil)

// TraceAcquireStart implements pgxpool.AcquireTracer.
func (t *MetricsTracer) TraceAcquireStart(ctx context.Context, _ *pgxpool.Pool, _ pgxpool.TraceAcquireStartData) context.Context {
	return ctx
}

// TraceAcquireEnd counts an acquire the pool did not serve.
func (t *MetricsTracer) TraceAcquireEnd(ctx context.Context, _ *pgxpool.Pool, data pgxpool.TraceAcquireEndData) {
	if t == nil || data.Err == nil || t.pool == "" {
		return
	}
	if observer, ok := t.metrics.(DBPoolAcquireFailureObserver); ok {
		observer.ObserveDBPoolAcquireFailure(t.pool, PoolDuty(ctx), poolAcquireFailureReason(data.Err))
	}
}
