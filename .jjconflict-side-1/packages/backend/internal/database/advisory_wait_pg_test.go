package database

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
)

// plue#839: a blocking pg_advisory_lock kept its pooled connection and its
// snapshot for as long as another session held the lock. The wait now ends
// at its own lock_timeout with a definite refusal, and the connection holds
// nothing and keeps no lock_timeout of its own.
func TestWaitSessionAdvisoryLock_RefusesAfterItsWaitAndHoldsNothing(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	url := testdb.New(t).URL
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	holder, err := pgx.Connect(ctx, url)
	require.NoError(t, err)
	t.Cleanup(func() { _ = holder.Close(context.Background()) })
	_, err = holder.Exec(ctx, `SELECT pg_advisory_lock(839, 18)`)
	require.NoError(t, err)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	began := time.Now()
	err = WaitSessionAdvisoryLock(ctx, conn, 300*time.Millisecond, `SELECT pg_advisory_lock($1, $2)`, 839, 18)
	require.ErrorIs(t, err, ErrSessionLockBusy)
	require.Less(t, time.Since(began), 5*time.Second, "the wait outlived its bound")
	require.GreaterOrEqual(t, time.Since(began), 300*time.Millisecond)
	require.Zero(t, sessionAdvisoryLocks(t, conn), "a refused wait holds a lock")
	requireDefaultLockTimeout(t, conn)

	// Released by the holder, the same connection takes it, and the lock
	// outlives the transaction that waited for it.
	_, err = holder.Exec(ctx, `SELECT pg_advisory_unlock(839, 18)`)
	require.NoError(t, err)
	require.NoError(t, WaitSessionAdvisoryLock(ctx, conn, 300*time.Millisecond, `SELECT pg_advisory_lock($1, $2)`, 839, 18))
	require.Equal(t, 1, sessionAdvisoryLocks(t, conn))
	requireDefaultLockTimeout(t, conn)
	var unlocked bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT pg_advisory_unlock(839, 18)`).Scan(&unlocked))
	require.True(t, unlocked)
}

func sessionAdvisoryLocks(t *testing.T, conn *pgxpool.Conn) int {
	t.Helper()
	var n int
	require.NoError(t, conn.QueryRow(context.Background(),
		`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted`).Scan(&n))
	return n
}

func requireDefaultLockTimeout(t *testing.T, conn *pgxpool.Conn) {
	t.Helper()
	var timeout string
	require.NoError(t, conn.QueryRow(context.Background(), `SELECT current_setting('lock_timeout')`).Scan(&timeout))
	require.Equal(t, "0", timeout, "the wait's bound leaked onto the pooled session")
}
