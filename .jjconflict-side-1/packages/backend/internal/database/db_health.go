package database

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/smithersai/smithers/packages/backend/internal/config"
)

// THE SERVER'S HEALTH, read from its own catalog (plue#839).
//
// On 2026-10-18 blocked statements pinned the server's xmin for hours,
// sandbox_instances collected 453,784 dead rows, its heartbeat query slowed
// to 6-20 s and the fleet's host leases expired. Pool gauges cannot show any
// of that. This collector reads three cheap catalog views on a pool of ONE
// connection of its own, so a full core pool cannot silence it and the
// server pays for one session per worker process:
//
//   - the oldest client transaction holding this database's xmin horizon
//     back, in seconds and in transactions;
//   - the oldest ungranted lock wait, by lock type;
//   - live and dead tuples of a fixed list of hot tables.
//
// Every label is a closed source constant: a lock type outside the
// PostgreSQL set is "other", and only tables in DBHealthTables are read.

// DBHealthCollector is the collector label of a failed health read.
const DBHealthCollector = "db_health"

// DBHealthInterval is how often a worker refreshes the health gauges.
const DBHealthInterval = 30 * time.Second

// dbHealthReadBound bounds one catalog read, beside the session's own 5 s
// statement_timeout.
const dbHealthReadBound = 5 * time.Second

// DBHealthLockTypes is the closed locktype label set: pg_locks' documented
// values and "other".
var DBHealthLockTypes = []string{
	"relation", "extend", "frontier", "page", "tuple", "transactionid", "virtualxid",
	"spectoken", "object", "userlock", "advisory", "applytransaction", "other",
}

// DBHealthTables are the tables whose tuples are published. sandbox_instances
// and sandbox_hosts belong to the hosted deployment; a database without one
// publishes no series for it.
var DBHealthTables = []string{
	"sandbox_instances", "sandbox_hosts", "workspaces", "workspace_sessions", "agent_sessions",
}

// DBHealthObserver counts a failed health read.
type DBHealthObserver interface {
	ObserveRuntimeMetricsCollectionFailure(collector string)
}

// DBHealthMetrics is the product registry: where the gauges are published
// and the shared collection failure counter.
type DBHealthMetrics interface {
	DBHealthObserver
	MustRegister(...prometheus.Collector)
}

// DBHealth holds the gauges and the one-connection pool they are read on.
type DBHealth struct {
	pool             *pgxpool.Pool
	xminSeconds      prometheus.Gauge
	xminTransactions prometheus.Gauge
	lockWait         *prometheus.GaugeVec
	deadTuples       *prometheus.GaugeVec
	liveTuples       *prometheus.GaugeVec
}

func NewDBHealth(pool *pgxpool.Pool) *DBHealth {
	return &DBHealth{
		pool: pool,
		xminSeconds: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_db_oldest_xmin_age_seconds",
			Help: "Age of the oldest client transaction holding this database's xmin horizon back; zero when none does.",
		}),
		xminTransactions: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_db_oldest_xmin_transactions",
			Help: "Transactions since the oldest xmin or xid a client session holds in this database; zero when none does.",
		}),
		lockWait: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "smithers_db_lock_wait_oldest_seconds",
			Help: "Age of the oldest ungranted lock wait in this database, by lock type; zero when none waits.",
		}, []string{"locktype"}),
		deadTuples: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "smithers_db_table_dead_tuples",
			Help: "Estimated dead tuples in each watched table.",
		}, []string{"table"}),
		liveTuples: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "smithers_db_table_live_tuples",
			Help: "Estimated live tuples in each watched table.",
		}, []string{"table"}),
	}
}

func (h *DBHealth) Collectors() []prometheus.Collector {
	return []prometheus.Collector{h.xminSeconds, h.xminTransactions, h.lockWait, h.deadTuples, h.liveTuples}
}

// NewHealthPool opens the collector's pool: one connection, opened on first
// use, whose session is named, read-only and bounded so the collector can
// never be the long statement it reports.
func NewHealthPool(ctx context.Context, cfg config.DatabaseConfig) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("parse database config: %w", err)
	}
	poolCfg.MaxConns, poolCfg.MinConns = 1, 0
	if cfg.MaxConnLifetime > 0 {
		poolCfg.MaxConnLifetime = time.Duration(cfg.MaxConnLifetime) * time.Second
	}
	if cfg.MaxConnIdleTime > 0 {
		poolCfg.MaxConnIdleTime = time.Duration(cfg.MaxConnIdleTime) * time.Second
	}
	for name, value := range map[string]string{
		"application_name":              "smithers_db_health",
		"statement_timeout":             "5s",
		"lock_timeout":                  "1s",
		"default_transaction_read_only": "on",
	} {
		poolCfg.ConnConfig.RuntimeParams[name] = value
	}
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create health pool: %w", err)
	}
	return pool, nil
}

// StartDBHealthCollector opens the health pool, publishes the gauges on
// metrics and refreshes them every DBHealthInterval until stop, which waits
// for the refresh in flight and closes the pool.
func StartDBHealthCollector(ctx context.Context, cfg config.DatabaseConfig, metrics DBHealthMetrics) (stop func(), err error) {
	pool, err := NewHealthPool(ctx, cfg)
	if err != nil {
		return nil, err
	}
	health := NewDBHealth(pool)
	metrics.MustRegister(health.Collectors()...)
	runCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		health.Run(runCtx, metrics, DBHealthInterval)
	}()
	return func() {
		cancel()
		<-done
		pool.Close()
	}, nil
}

// Run refreshes at once and then every interval until ctx ends.
func (h *DBHealth) Run(ctx context.Context, observer DBHealthObserver, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for ctx.Err() == nil {
		h.Refresh(ctx, observer)
		select {
		case <-ctx.Done():
		case <-ticker.C:
		}
	}
}

// Refresh runs each read once. A failed read counts one collection failure
// and keeps its gauges' last values rather than publishing a false zero.
func (h *DBHealth) Refresh(ctx context.Context, observer DBHealthObserver) {
	for _, read := range []struct {
		name string
		run  func(context.Context) error
	}{
		{"oldest_xmin", h.readOldestXmin},
		{"lock_waits", h.readLockWaits},
		{"table_tuples", h.readTableTuples},
	} {
		bounded, cancel := context.WithTimeout(ctx, dbHealthReadBound)
		err := read.run(bounded)
		cancel()
		if err != nil && ctx.Err() == nil {
			observer.ObserveRuntimeMetricsCollectionFailure(DBHealthCollector)
			slog.Warn("runtime metrics collection failed", "metric", DBHealthCollector+"_"+read.name, "error", err)
		}
	}
}

// readOldestXmin reads client sessions of this database whose xid or xmin
// holds the horizon back. The collector's own session is excluded, and so are
// vacuum and other server processes.
func (h *DBHealth) readOldestXmin(ctx context.Context) error {
	var seconds float64
	var transactions int64
	if err := h.pool.QueryRow(ctx, `
		SELECT COALESCE(max(EXTRACT(EPOCH FROM clock_timestamp() - xact_start)), 0)::float8,
		       COALESCE(max(GREATEST(age(backend_xid), age(backend_xmin))), 0)::bigint
		FROM pg_stat_activity
		WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()
		  AND (backend_xid IS NOT NULL OR backend_xmin IS NOT NULL)`).Scan(&seconds, &transactions); err != nil {
		return err
	}
	h.xminSeconds.Set(seconds)
	h.xminTransactions.Set(float64(transactions))
	return nil
}

// readLockWaits reads the oldest ungranted lock of each type held by a
// session of this database. Every type is published, zero when none waits.
func (h *DBHealth) readLockWaits(ctx context.Context) error {
	rows, err := h.pool.Query(ctx, `
		SELECT l.locktype, max(EXTRACT(EPOCH FROM clock_timestamp() - l.waitstart))::float8
		FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
		WHERE NOT l.granted AND l.waitstart IS NOT NULL AND a.datname = current_database()
		GROUP BY l.locktype`)
	if err != nil {
		return err
	}
	defer rows.Close()
	oldest := make(map[string]float64, len(DBHealthLockTypes))
	for rows.Next() {
		var locktype string
		var seconds float64
		if err := rows.Scan(&locktype, &seconds); err != nil {
			return err
		}
		if !slices.Contains(DBHealthLockTypes, locktype) {
			locktype = "other"
		}
		oldest[locktype] = max(oldest[locktype], seconds)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, locktype := range DBHealthLockTypes {
		h.lockWait.WithLabelValues(locktype).Set(oldest[locktype])
	}
	return nil
}

// readTableTuples reads the statistics of the watched tables this database
// has; a watched table it does not have publishes no series.
func (h *DBHealth) readTableTuples(ctx context.Context) error {
	rows, err := h.pool.Query(ctx, `
		SELECT relname, n_live_tup, n_dead_tup FROM pg_stat_user_tables
		WHERE schemaname = 'public' AND relname = ANY($1::text[])`, DBHealthTables)
	if err != nil {
		return err
	}
	defer rows.Close()
	type tuples struct{ live, dead int64 }
	seen := make(map[string]tuples, len(DBHealthTables))
	for rows.Next() {
		var table string
		var row tuples
		if err := rows.Scan(&table, &row.live, &row.dead); err != nil {
			return err
		}
		seen[table] = row
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, table := range DBHealthTables {
		row, ok := seen[table]
		if !ok {
			h.liveTuples.DeleteLabelValues(table)
			h.deadTuples.DeleteLabelValues(table)
			continue
		}
		h.liveTuples.WithLabelValues(table).Set(float64(row.live))
		h.deadTuples.WithLabelValues(table).Set(float64(row.dead))
	}
	return nil
}
