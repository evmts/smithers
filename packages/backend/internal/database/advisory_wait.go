package database

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdvisoryLockWait is the lock_timeout of a blocking session advisory lock
// statement (plue#839). A blocked statement keeps its pooled connection and a
// snapshot that holds the server's xmin back for as long as it waits, so it
// waits this long for another session and no longer.
const AdvisoryLockWait = 30 * time.Second

// WaitSessionAdvisoryLock runs lockSQL, a blocking pg_advisory_lock
// statement, on conn with its wait bounded by wait. The statement runs in its
// own transaction under SET LOCAL lock_timeout, so the bound ends with that
// transaction and the session lock it takes outlives the commit.
//
// ErrSessionLockBusy means another session held the lock for the whole wait
// and conn holds nothing. Any other error leaves the lock state unknown, so
// the caller must close conn rather than return it to the pool.
func WaitSessionAdvisoryLock(ctx context.Context, conn *pgxpool.Conn, wait time.Duration, lockSQL string, args ...any) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "SET LOCAL lock_timeout = "+strconv.FormatInt(max(wait.Milliseconds(), 1), 10)); err == nil {
		_, err = tx.Exec(ctx, lockSQL, args...)
	}
	if err != nil {
		_ = tx.Rollback(context.WithoutCancel(ctx))
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "55P03" {
			return ErrSessionLockBusy
		}
		return err
	}
	return tx.Commit(ctx)
}
