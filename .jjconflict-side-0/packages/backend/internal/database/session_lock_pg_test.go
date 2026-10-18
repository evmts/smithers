package database

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
)

// sessionLockFixture is one test database, a small pool under test, and a
// session outside that pool which plays the other replica and observes.
type sessionLockFixture struct {
	pool    *pgxpool.Pool
	foreign *pgx.Conn
	duties  *recordedDuties
}

func newSessionLockFixture(t *testing.T) *sessionLockFixture {
	t.Helper()
	url := testdb.New(t).URL
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	config, err := pgxpool.ParseConfig(url)
	require.NoError(t, err)
	config.MaxConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, config)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	foreign, err := pgx.Connect(ctx, url)
	require.NoError(t, err)
	t.Cleanup(func() { _ = foreign.Close(context.Background()) })
	return &sessionLockFixture{pool: pool, foreign: foreign, duties: newRecordedDuties()}
}

func (f *sessionLockFixture) request(key string, wait time.Duration) SessionLockRequest {
	return SessionLockRequest{Duty: "test_duty", Key: key, Seed: 2099, Wait: wait, Observer: f.duties}
}

// foreignLock takes key with the BLOCKING statement the helper replaced, as a
// replica still running the old code would.
func (f *sessionLockFixture) foreignLock(t *testing.T, key string) {
	t.Helper()
	_, err := f.foreign.Exec(t.Context(), `SELECT pg_advisory_lock(hashtextextended($1, 2099))`, key)
	require.NoError(t, err)
}

func (f *sessionLockFixture) foreignUnlock(t *testing.T, key string) {
	t.Helper()
	_, err := f.foreign.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtextextended($1, 2099))`, key)
	require.NoError(t, err)
}

// waiters counts sessions in this database blocked on an advisory lock.
func (f *sessionLockFixture) waiters(t *testing.T) int {
	t.Helper()
	var n int
	require.NoError(t, f.foreign.QueryRow(t.Context(), `SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING (pid)
		WHERE l.locktype = 'advisory' AND NOT l.granted AND a.datname = current_database()`).Scan(&n))
	return n
}

// The loser of a held lock holds no connection and no waiting statement while
// it waits, and refuses busy at its written bound.
func TestSessionLockWaiterHoldsNothingAndRefusesBusyAtItsBound(t *testing.T) {
	f := newSessionLockFixture(t)
	f.foreignLock(t, "contended")

	type result struct {
		lock *SessionLock
		err  error
	}
	done := make(chan result, 1)
	began := time.Now()
	go func() {
		lock, err := AcquireSessionLock(context.Background(), f.pool, f.request("contended", 600*time.Millisecond))
		done <- result{lock, err}
	}()
	worstAcquired, worstWaiters := int32(0), 0
	var got result
	for finished := false; !finished; {
		worstAcquired = max(worstAcquired, f.pool.Stat().AcquiredConns())
		worstWaiters = max(worstWaiters, f.waiters(t))
		select {
		case got = <-done:
			finished = true
		case <-time.After(20 * time.Millisecond):
		}
	}
	require.ErrorIs(t, got.err, ErrSessionLockBusy)
	require.Nil(t, got.lock)
	elapsed := time.Since(began)
	require.GreaterOrEqual(t, elapsed, 600*time.Millisecond, "the waiter gave up before its bound")
	require.Less(t, elapsed, 2*time.Second, "the waiter waited past its bound")
	require.Zero(t, worstWaiters, "a statement waited on the lock, holding a snapshot")
	require.LessOrEqual(t, worstAcquired, int32(1), "the waiter held more than its one attempt's connection")
	require.Zero(t, f.pool.Stat().AcquiredConns(), "the refused waiter kept a connection")
	require.Equal(t, 1, f.duties.waits("test_duty", AdvisoryLockBusy))
	require.Zero(t, f.duties.peak("test_duty"), "a waiter that never won was published as holding")
}

// A waiter takes the lock once the other replica lets go, and Release gives
// the lock and the connection back.
func TestSessionLockWaiterWinsWhenTheHolderLetsGoAndReleaseReturnsTheConnection(t *testing.T) {
	f := newSessionLockFixture(t)
	f.foreignLock(t, "handover")
	time.AfterFunc(300*time.Millisecond, func() { f.foreignUnlock(t, "handover") })

	lock, err := AcquireSessionLock(context.Background(), f.pool, f.request("handover", 10*time.Second))
	require.NoError(t, err)
	require.Equal(t, 1, f.duties.held("test_duty"), "the winner is not published as holding")
	require.Equal(t, int32(1), f.pool.Stat().AcquiredConns())

	var otherGot bool
	require.NoError(t, f.foreign.QueryRow(t.Context(), `SELECT pg_try_advisory_lock(hashtextextended($1, 2099))`, "handover").Scan(&otherGot))
	require.False(t, otherGot, "the helper's key is not the key the blocking statement takes")

	total := f.pool.Stat().TotalConns()
	require.NoError(t, lock.Release())
	require.NoError(t, lock.Release(), "a second release is not a no-op")
	require.Zero(t, f.pool.Stat().AcquiredConns())
	require.Equal(t, total, f.pool.Stat().TotalConns(), "a confirmed unlock closed its connection")
	require.Zero(t, f.duties.held("test_duty"))
	require.NoError(t, f.foreign.QueryRow(t.Context(), `SELECT pg_try_advisory_lock(hashtextextended($1, 2099))`, "handover").Scan(&otherGot))
	require.True(t, otherGot, "the lock was not given back")
	require.Equal(t, 1, f.duties.waits("test_duty", AdvisoryLockAcquired))
}

// An unlock PostgreSQL does not confirm closes the session instead of
// returning it to the pool. The fault is real: the session's lock is released
// behind the helper's back, so pg_advisory_unlock answers false.
func TestSessionLockUnconfirmedUnlockClosesTheSession(t *testing.T) {
	f := newSessionLockFixture(t)
	lock, err := AcquireSessionLock(context.Background(), f.pool, f.request("dirty", 0))
	require.NoError(t, err)
	_, err = lock.Conn().Exec(t.Context(), `SELECT pg_advisory_unlock(hashtextextended($1, 2099))`, "dirty")
	require.NoError(t, err)
	total := f.pool.Stat().TotalConns()

	require.ErrorIs(t, lock.Release(), ErrSessionUnlockReturnedFalse)
	require.Less(t, f.pool.Stat().TotalConns(), total, "the unconfirmed session went back to the pool")
	require.Zero(t, f.duties.held("test_duty"), "the closed session is still published as holding")
}

// A cancelled caller stops waiting between attempts and holds nothing.
func TestSessionLockCancelledWaiterHoldsNothing(t *testing.T) {
	f := newSessionLockFixture(t)
	f.foreignLock(t, "cancelled")
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(200*time.Millisecond, cancel)

	_, err := AcquireSessionLock(ctx, f.pool, f.request("cancelled", time.Minute))
	require.ErrorIs(t, err, context.Canceled)
	require.Zero(t, f.pool.Stat().AcquiredConns())
	require.Equal(t, 1, f.duties.waits("test_duty", AdvisoryLockCancelled))
}

// A pool that cannot serve the attempt inside the caller's bound is named as
// such, not as a busy lock.
func TestSessionLockFullPoolIsNoConnection(t *testing.T) {
	f := newSessionLockFixture(t)
	for range 2 {
		conn, err := f.pool.Acquire(t.Context())
		require.NoError(t, err)
		defer conn.Release()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, err := AcquireSessionLock(ctx, f.pool, f.request("starved", time.Minute))
	require.ErrorIs(t, err, ErrSessionLockNoConnection)
	require.False(t, errors.Is(err, ErrSessionLockBusy))
	require.Equal(t, 1, f.duties.waits("test_duty", AdvisoryLockNoConnection))
}

// The registry's gauges count live holds and age the oldest one.
func TestCorePoolDutyHoldsPublishesCountAndOldestAge(t *testing.T) {
	holds := NewCorePoolDutyHolds()
	now := time.Unix(1_800_000_000, 0)
	holds.now = func() time.Time { return now }
	endOld := holds.Begin("public_mirror_seed")
	now = now.Add(90 * time.Second)
	endNew := holds.Begin("public_mirror_seed")
	now = now.Add(10 * time.Second)

	require.Equal(t, map[string]float64{"held": 2, "oldest": 100}, scrapeHolds(t, holds, "public_mirror_seed"))
	endOld()
	endOld()
	require.Equal(t, map[string]float64{"held": 1, "oldest": 10}, scrapeHolds(t, holds, "public_mirror_seed"))
	endNew()
	require.Equal(t, map[string]float64{"held": 0, "oldest": 0}, scrapeHolds(t, holds, "public_mirror_seed"),
		"a duty that let go must read zero, not vanish")
}

func scrapeHolds(t *testing.T, holds *CorePoolDutyHolds, duty string) map[string]float64 {
	t.Helper()
	registry := prometheus.NewPedanticRegistry()
	require.NoError(t, registry.Register(holds))
	families, err := registry.Gather()
	require.NoError(t, err)
	got := map[string]float64{}
	for _, family := range families {
		for _, metric := range family.GetMetric() {
			if labelValue(metric, "duty") != duty {
				continue
			}
			switch family.GetName() {
			case "smithers_core_pool_duty_connections_held":
				got["held"] = metric.GetGauge().GetValue()
			case "smithers_core_pool_duty_oldest_hold_seconds":
				got["oldest"] = metric.GetGauge().GetValue()
			}
		}
	}
	return got
}

func labelValue(metric *dto.Metric, name string) string {
	for _, label := range metric.GetLabel() {
		if label.GetName() == name {
			return label.GetValue()
		}
	}
	return ""
}

type recordedDuties struct {
	mu       sync.Mutex
	holding  map[string]int
	peaks    map[string]int
	outcomes map[string]int
}

func newRecordedDuties() *recordedDuties {
	return &recordedDuties{holding: map[string]int{}, peaks: map[string]int{}, outcomes: map[string]int{}}
}

func (d *recordedDuties) BeginCorePoolDutyHold(duty string) func() {
	d.mu.Lock()
	d.holding[duty]++
	d.peaks[duty] = max(d.peaks[duty], d.holding[duty])
	d.mu.Unlock()
	return func() {
		d.mu.Lock()
		d.holding[duty]--
		d.mu.Unlock()
	}
}

func (*recordedDuties) ObserveCorePoolDutyStall(string, string) {}

func (d *recordedDuties) ObserveAdvisoryLockWait(duty, outcome string, _ float64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.outcomes[duty+"/"+outcome]++
}

func (d *recordedDuties) held(duty string) int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.holding[duty]
}

func (d *recordedDuties) peak(duty string) int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.peaks[duty]
}

func (d *recordedDuties) waits(duty, outcome string) int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.outcomes[duty+"/"+outcome]
}
