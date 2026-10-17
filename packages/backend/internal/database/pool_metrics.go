package database

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

// WAIT ACCOUNTING, which "4 of 4" cannot express.
//
// smithers_db_connections_active over _max says a pool is full. It cannot say
// anything about waiting on it, and waiting is the difference between the two
// failures a saturated core pool produces:
//
//   - full and PARKED: a duty is blocked inside pgxpool.Acquire holding
//     whatever it already took, so nothing is released and no refusal is ever
//     recorded. That is the absorbing state the bounds in
//     services/core_pool_duty.go exist to end.
//   - full and REFUSING: every bound fired, every duty gave its connections
//     back, and the pool is simply occupied by holders that are not going to
//     let go. Nothing hangs, and nothing converges either.
//
// Both read 4 of 4 forever. The pool keeps accounting that StartPoolStatsCollector
// threw away, so it is published here from the pool's own numbers.
//
// READ THESE EXACTLY AS pgx DEFINES THEM. In pgx v5.10.0 pgxpool/stat.go,
// EmptyAcquireCount is "the cumulative count of SUCCESSFUL acquires ... that
// waited", and EmptyAcquireWaitTime is the cumulative wait of those same
// successful acquires. Both are completed-acquire counters: an acquire parked
// in the pool right now has contributed to NEITHER, and will only do so if it
// eventually succeeds. So these cumulative totals cannot report how many
// acquires are pending, and flat totals beside a full pool do not mean nothing
// is parked — they mean nothing has completed a wait since the last sample.
// CanceledAcquireCount is the one that moves for an acquire that gave up,
// which is what a written bound refusing looks like from the pool's side.
// Separating parked from refusing needs the per-duty held and stall series in
// services/core_pool_duty.go, not these totals alone.
//
// There is no sampling of anything a connection carried: no SQL text, no
// parameter, no identifier, no error and no customer value is in a connection
// count.
func PoolMetricsCollectors(pool *pgxpool.Pool) []prometheus.Collector {
	if pool == nil {
		return nil
	}
	return []prometheus.Collector{
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name: "smithers_db_pool_connections_idle",
			Help: "Pooled connections open and not handed out right now. Zero beside a full pool means every connection is held, not merely constructed.",
		}, func() float64 { return float64(pool.Stat().IdleConns()) }),
		prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name: "smithers_db_pool_acquires_total",
			Help: "Connection acquires this process has completed successfully, the denominator for the wait counters below.",
		}, func() float64 { return float64(pool.Stat().AcquireCount()) }),
		prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name: "smithers_db_pool_acquire_waits_total",
			Help: "Acquires that found no free connection, waited, and then SUCCEEDED. An acquire parked right now is not counted here until it completes, so this total says nothing about how many are pending.",
		}, func() float64 { return float64(pool.Stat().EmptyAcquireCount()) }),
		prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name: "smithers_db_pool_acquire_wait_seconds_total",
			Help: "Time spent waiting by those completed acquires. Time being spent by an acquire that is still parked is not in it yet.",
		}, func() float64 { return pool.Stat().EmptyAcquireWaitTime().Seconds() }),
		prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name: "smithers_db_pool_acquire_cancellations_total",
			Help: "Acquires cancelled while waiting. This is what a written acquire bound refusing looks like from the pool's side.",
		}, func() float64 { return float64(pool.Stat().CanceledAcquireCount()) }),
	}
}
