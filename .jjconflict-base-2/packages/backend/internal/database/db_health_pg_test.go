package database

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
)

// dbHealthMetrics is the product registry's surface the collector needs: a
// registry to publish on and the shared collection failure counter.
type dbHealthMetrics struct {
	registry *prometheus.Registry
	mu       sync.Mutex
	failures map[string]int
}

func (m *dbHealthMetrics) MustRegister(collectors ...prometheus.Collector) {
	m.registry.MustRegister(collectors...)
}

func (m *dbHealthMetrics) ObserveRuntimeMetricsCollectionFailure(collector string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.failures[collector]++
}

func (m *dbHealthMetrics) failed(collector string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.failures[collector]
}

// series returns every sample of one family by its label, or "" unlabeled.
func (m *dbHealthMetrics) series(t *testing.T, name string) map[string]float64 {
	t.Helper()
	families, err := m.registry.Gather()
	require.NoError(t, err)
	out := map[string]float64{}
	for _, family := range families {
		if family.GetName() != name {
			continue
		}
		for _, metric := range family.GetMetric() {
			key := ""
			for _, label := range metric.GetLabel() {
				key = label.GetValue()
			}
			out[key] = gaugeValue(metric)
		}
	}
	return out
}

func gaugeValue(metric *dto.Metric) float64 { return metric.GetGauge().GetValue() }

type dbHealthFixture struct {
	url     string
	metrics *dbHealthMetrics
	health  *DBHealth
	ctx     context.Context
}

func newDBHealthFixture(t *testing.T) *dbHealthFixture {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	url := testdb.New(t).URL
	pool, err := NewHealthPool(ctx, config.DatabaseConfig{URL: url, MaxConnLifetime: 60, MaxConnIdleTime: 30})
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.Equal(t, int32(1), pool.Config().MaxConns, "the health collector must cost the server one connection")
	metrics := &dbHealthMetrics{registry: prometheus.NewRegistry(), failures: map[string]int{}}
	health := NewDBHealth(pool)
	metrics.MustRegister(health.Collectors()...)
	return &dbHealthFixture{url: url, metrics: metrics, health: health, ctx: ctx}
}

func (f *dbHealthFixture) conn(t *testing.T) *pgx.Conn {
	t.Helper()
	conn, err := pgx.Connect(f.ctx, f.url)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close(context.Background()) })
	return conn
}

func (f *dbHealthFixture) refresh(t *testing.T) {
	t.Helper()
	f.health.Refresh(f.ctx, f.metrics)
	require.Zero(t, f.metrics.failed(DBHealthCollector), "a health read failed")
}

// plue#839: the deadlock pinned the server's xmin and sandbox_instances
// filled with 453,784 dead rows while nothing a scrape could read moved. The
// collector publishes the oldest transaction holding the horizon back, the
// oldest lock wait by lock type, and the hot tables' live and dead tuples.
func TestDBHealth_PublishesThePinnedHorizonTheLockWaitAndTheDeadTuples(t *testing.T) {
	f := newDBHealthFixture(t)
	writer := f.conn(t)
	_, err := writer.Exec(f.ctx, `CREATE TABLE sandbox_instances (id int PRIMARY KEY); CREATE TABLE workspaces (id int PRIMARY KEY)`)
	require.NoError(t, err)

	// Nothing holds the horizon back yet, and the collector's own snapshot is
	// not counted as one.
	f.refresh(t)
	require.Equal(t, 0.0, f.metrics.series(t, "smithers_db_oldest_xmin_age_seconds")[""])
	require.Equal(t, 0.0, f.metrics.series(t, "smithers_db_oldest_xmin_transactions")[""])
	waits := f.metrics.series(t, "smithers_db_lock_wait_oldest_seconds")
	require.ElementsMatch(t, DBHealthLockTypes, keys(waits), "every lock type is published, zero when none waits")
	for locktype, seconds := range waits {
		require.Zero(t, seconds, locktype)
	}

	// A repeatable-read transaction holds its snapshot, and three writes
	// after it age that snapshot by three transactions.
	pinned := f.conn(t)
	pin, err := pinned.Begin(f.ctx)
	require.NoError(t, err)
	_, err = pin.Exec(f.ctx, `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`)
	require.NoError(t, err)
	require.NoError(t, pin.QueryRow(f.ctx, `SELECT 1`).Scan(new(int)))
	for id := range 3 {
		_, err = writer.Exec(f.ctx, `INSERT INTO sandbox_instances VALUES ($1)`, id)
		require.NoError(t, err)
	}

	// Another session waits on an advisory lock the writer holds.
	_, err = writer.Exec(f.ctx, `SELECT pg_advisory_lock(839)`)
	require.NoError(t, err)
	waiter := f.conn(t)
	waited := make(chan error, 1)
	go func() {
		_, err := waiter.Exec(f.ctx, `SELECT pg_advisory_lock(839)`)
		waited <- err
	}()
	time.Sleep(1200 * time.Millisecond)

	f.refresh(t)
	require.GreaterOrEqual(t, f.metrics.series(t, "smithers_db_oldest_xmin_age_seconds")[""], 1.0)
	require.GreaterOrEqual(t, f.metrics.series(t, "smithers_db_oldest_xmin_transactions")[""], 3.0)
	waits = f.metrics.series(t, "smithers_db_lock_wait_oldest_seconds")
	require.GreaterOrEqual(t, waits["advisory"], 1.0, "the advisory waiter is not published")
	require.Zero(t, waits["relation"])

	// The waiter is granted and the snapshot ends: both read zero again.
	_, err = writer.Exec(f.ctx, `SELECT pg_advisory_unlock(839)`)
	require.NoError(t, err)
	require.NoError(t, <-waited)
	require.NoError(t, pin.Rollback(f.ctx))
	f.refresh(t)
	require.Equal(t, 0.0, f.metrics.series(t, "smithers_db_lock_wait_oldest_seconds")["advisory"])
	require.Less(t, f.metrics.series(t, "smithers_db_oldest_xmin_age_seconds")[""], 1.0)

	// Dead tuples: two deleted rows of three, flushed to the statistics.
	_, err = writer.Exec(f.ctx, `DELETE FROM sandbox_instances WHERE id < 2`)
	require.NoError(t, err)
	_, err = writer.Exec(f.ctx, `SELECT pg_stat_force_next_flush()`)
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		f.refresh(t)
		return f.metrics.series(t, "smithers_db_table_dead_tuples")["sandbox_instances"] == 2
	}, 10*time.Second, 100*time.Millisecond, "sandbox_instances dead tuples are not published")
	require.Equal(t, 1.0, f.metrics.series(t, "smithers_db_table_live_tuples")["sandbox_instances"])
	// Only the fixed tables, and only those this database has.
	require.ElementsMatch(t, []string{"sandbox_instances", "workspaces"}, keys(f.metrics.series(t, "smithers_db_table_live_tuples")))
	_, err = writer.Exec(f.ctx, `CREATE TABLE not_watched (id int); INSERT INTO not_watched VALUES (1)`)
	require.NoError(t, err)
	f.refresh(t)
	require.NotContains(t, f.metrics.series(t, "smithers_db_table_live_tuples"), "not_watched")
	for table := range f.metrics.series(t, "smithers_db_table_dead_tuples") {
		require.True(t, slices.Contains(DBHealthTables, table), table)
	}
}

// A read that fails counts one collection failure per read and keeps every
// gauge's last value rather than publishing a false zero.
func TestDBHealth_AFailedReadCountsAndKeepsTheLastValue(t *testing.T) {
	f := newDBHealthFixture(t)
	writer := f.conn(t)
	_, err := writer.Exec(f.ctx, `CREATE TABLE workspaces (id int PRIMARY KEY); INSERT INTO workspaces VALUES (1), (2)`)
	require.NoError(t, err)
	_, err = writer.Exec(f.ctx, `SELECT pg_stat_force_next_flush()`)
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		f.refresh(t)
		return f.metrics.series(t, "smithers_db_table_live_tuples")["workspaces"] == 2
	}, 10*time.Second, 100*time.Millisecond)

	f.health.pool.Close()
	f.health.Refresh(f.ctx, f.metrics)
	require.Equal(t, 3, f.metrics.failed(DBHealthCollector), "each failed read counts once")
	require.Equal(t, 2.0, f.metrics.series(t, "smithers_db_table_live_tuples")["workspaces"], "a failed read published a false value")
	require.Len(t, f.metrics.series(t, "smithers_db_lock_wait_oldest_seconds"), len(DBHealthLockTypes))
}

// Run refreshes at once and then on its interval, and returns with its context.
func TestDBHealth_RunRefreshesUntilCancelled(t *testing.T) {
	f := newDBHealthFixture(t)
	ctx, cancel := context.WithCancel(f.ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		f.health.Run(ctx, f.metrics, 20*time.Millisecond)
	}()
	require.Eventually(t, func() bool {
		return len(f.metrics.series(t, "smithers_db_lock_wait_oldest_seconds")) == len(DBHealthLockTypes)
	}, 10*time.Second, 10*time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Run did not return after its context ended")
	}
}

// The health pool's own sessions are bounded, named and read-only, so the
// collector can never be the long statement it reports.
func TestNewHealthPool_BoundsItsOneSession(t *testing.T) {
	f := newDBHealthFixture(t)
	var statement, lock, name, readOnly string
	require.NoError(t, f.health.pool.QueryRow(f.ctx, `SELECT current_setting('statement_timeout'), current_setting('lock_timeout'),
		current_setting('application_name'), current_setting('default_transaction_read_only')`).Scan(&statement, &lock, &name, &readOnly))
	require.Equal(t, "5s", statement)
	require.Equal(t, "1s", lock)
	require.Equal(t, "smithers_db_health", name)
	require.Equal(t, "on", readOnly)
}

func keys(m map[string]float64) []string {
	out := make([]string, 0, len(m))
	for key := range m {
		out = append(out, key)
	}
	return out
}

// The worker's entry point publishes on the product registry, and stop waits
// for the refresh in flight and closes the pool without counting a failure.
func TestStartDBHealthCollector_PublishesUntilStopped(t *testing.T) {
	metrics := &dbHealthMetrics{registry: prometheus.NewRegistry(), failures: map[string]int{}}
	stop, err := StartDBHealthCollector(context.Background(), config.DatabaseConfig{URL: testdb.New(t).URL}, metrics)
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		return len(metrics.series(t, "smithers_db_lock_wait_oldest_seconds")) == len(DBHealthLockTypes)
	}, 10*time.Second, 10*time.Millisecond)
	stop()
	require.Zero(t, metrics.failed(DBHealthCollector))

	_, err = StartDBHealthCollector(context.Background(), config.DatabaseConfig{URL: "postgres://localhost:abc/db"}, metrics)
	require.ErrorContains(t, err, "parse database config")
}
