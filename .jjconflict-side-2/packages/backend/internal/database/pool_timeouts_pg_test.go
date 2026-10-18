package database

import (
	"context"
	"errors"
	"net/url"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
)

// plue#839: production ran with statement_timeout and
// idle_in_transaction_session_timeout at 0, so a blocked statement or an
// abandoned transaction pinned the server's xmin for 26 hours. Every core-pool
// session now carries both bounds from configuration.
func TestPool_EverySessionCarriesTheConfiguredTimeouts(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := NewPool(ctx, config.DatabaseConfig{
		URL: testdb.New(t).URL, MaxConns: 2, MinConns: 1, MaxConnLifetime: 60, MaxConnIdleTime: 30,
		StatementTimeout: 900, IdleInTransactionSessionTimeout: 900,
	})
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	held, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer held.Release()
	// Both connections, not only the first one the pool opened.
	for range 2 {
		conn, err := pool.Acquire(ctx)
		require.NoError(t, err)
		var statement, idle string
		require.NoError(t, conn.QueryRow(ctx, `SELECT current_setting('statement_timeout'), current_setting('idle_in_transaction_session_timeout')`).Scan(&statement, &idle))
		conn.Release()
		require.Equal(t, "15min", statement)
		require.Equal(t, "15min", idle)
		held.Release()
		held = conn
	}
}

// The bounds act: a statement past statement_timeout is cancelled, and a
// transaction left idle past idle_in_transaction_session_timeout loses its
// session, which releases its locks and its snapshot.
func TestPool_TimeoutsEndALongStatementAndAnAbandonedTransaction(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := NewPool(ctx, config.DatabaseConfig{
		URL: testdb.New(t).URL, MaxConns: 2, MinConns: 1, MaxConnLifetime: 60, MaxConnIdleTime: 30,
		StatementTimeout: 1, IdleInTransactionSessionTimeout: 1,
	})
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	_, err = pool.Exec(ctx, `SELECT pg_sleep(3)`)
	var pgErr *pgconn.PgError
	require.True(t, errors.As(err, &pgErr), "a statement past its bound was not cancelled: %v", err)
	require.Equal(t, "57014", pgErr.Code, "query_canceled")

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(839)`)
	require.NoError(t, err)
	time.Sleep(2500 * time.Millisecond)
	_, err = tx.Exec(ctx, `SELECT 1`)
	require.Error(t, err, "a transaction idle past its bound kept its session")
	_ = tx.Rollback(ctx)

	// Its advisory lock went with the session.
	var locked bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT pg_try_advisory_lock(839)`).Scan(&locked))
	require.True(t, locked, "the abandoned transaction's lock outlived its session")
}

// A zero bound is not sent, so a pool built without configuration keeps the
// server's own setting rather than disabling it.
func TestPool_ZeroTimeoutLeavesTheServerSetting(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	raw, err := url.Parse(testdb.New(t).URL)
	require.NoError(t, err)
	query := raw.Query()
	query.Set("statement_timeout", "7s")
	raw.RawQuery = query.Encode()
	pool, err := NewPool(ctx, config.DatabaseConfig{
		URL: raw.String(), MaxConns: 1, MinConns: 1, MaxConnLifetime: 60, MaxConnIdleTime: 30,
	})
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	var statement string
	require.NoError(t, pool.QueryRow(ctx, `SELECT current_setting('statement_timeout')`).Scan(&statement))
	require.Equal(t, "7s", statement)
}
