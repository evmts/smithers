package services

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
)

// GitHubAppInstallationReconcileInterval is how often the installation
// reconcile repairs mappings that missed a webhook.
const GitHubAppInstallationReconcileInterval = time.Hour

// githubAppReconcileLockSQL elects one worker replica per reconcile tick. The
// reconcile is idempotent, so the lock only avoids N replicas repeating the
// same GitHub walk; correctness never depends on it.
const githubAppReconcileLockSQL = "SELECT pg_try_advisory_xact_lock(hashtextextended('github_app_installation_reconcile', 0))"

// GitHubAppReconcileLocker runs fn only when this process wins the reconcile
// lock. ran reports whether fn was called.
type GitHubAppReconcileLocker interface {
	TryWithLock(ctx context.Context, fn func(context.Context) error) (ran bool, err error)
}

// githubAppReconcileLockBeginner is the narrow slice of *pgxpool.Pool this needs.
type githubAppReconcileLockBeginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// GitHubAppInstallationReconcileHoldBudget bounds how long ONE tick may hold
// the election connection.
//
// The election transaction is a core-pool connection, and everything the
// reconcile then does on the database — every installation upsert, every
// repository upsert, both prunes — is a SECOND acquire from the SAME pool made
// while this one is still held. Between those acquires it also makes GitHub
// round trips, which the reconciler's own context does not bound either: that
// context is the process's, so for the life of the process there was nothing
// that could end this hold. A closed read-only wait aggregate taken while the
// serving worker was stopped recorded this exact lock, idle_in_transaction and
// holding its advisory lock, at 6858 seconds — longer than the hourly interval
// that started it. Those rows are a SERVER-WIDE census, so they do not say
// which process held it or that it was one worker's pool; what they say is
// that this lock, which only this statement takes, was held that long with
// nothing in source able to end it. See core_pool_duty.go.
//
// Ten minutes is the budget because the reconcile is a repair, not a
// dependency: the table it fixes is written by webhooks, this sweep re-drives
// hourly, and every write it makes is an idempotent upsert that has already
// committed on its own connection. A tick that cannot walk the installations
// in ten minutes has not slowed down, and its partial progress is worth less
// to the process than the core-pool connection and the advisory lock it is
// sitting on. Releasing both costs one hour of mapping freshness.
//
// TEN MINUTES IS LONGER THAN A USER'S FAILED TURN, and this bound alone is NOT
// what keeps other duties progressing. A healthy ten-minute walk holds ONE
// connection; what used to absorb the rest was every other duty's own
// unbounded acquire parking behind it. Those are bounded and admitted on
// measured headroom now (see corePoolHeadroom, insideClaim and the loop's own
// list/row bounds), so a long walk is a long walk: the provisioning reconciler
// keeps ticking, a claim the pool can serve whole still runs, and one it
// cannot is refused finitely and named. This budget's job is narrower — to
// stop an UNBOUNDED hold from outliving the process — and lowering a healthy
// sweep's time budget would not have been the fix.
const GitHubAppInstallationReconcileHoldBudget = 10 * time.Minute

// PgGitHubAppReconcileLocker implements GitHubAppReconcileLocker with a
// transaction-scoped Postgres advisory lock. The reconcile's own writes go
// through the ordinary pool, so they commit independently of the lock
// transaction, and the deferred rollback (or a dead backend) always releases it.
type PgGitHubAppReconcileLocker struct {
	pool githubAppReconcileLockBeginner
	hold time.Duration
	duty CorePoolDutyObserver
}

// GitHubAppReconcileLockerOption configures the locker.
type GitHubAppReconcileLockerOption func(*PgGitHubAppReconcileLocker)

// WithGitHubAppReconcileCorePoolObserver attributes this duty's core-pool hold
// and its refusals, so a full pool names the duty sitting on it.
func WithGitHubAppReconcileCorePoolObserver(observer CorePoolDutyObserver) GitHubAppReconcileLockerOption {
	return func(l *PgGitHubAppReconcileLocker) { l.duty = observer }
}

// withGitHubAppReconcileHoldBudget shortens the hold for tests that have to
// prove the bound ends a hold rather than waiting out the production one.
func withGitHubAppReconcileHoldBudget(hold time.Duration) GitHubAppReconcileLockerOption {
	return func(l *PgGitHubAppReconcileLocker) { l.hold = hold }
}

func NewPgGitHubAppReconcileLocker(pool githubAppReconcileLockBeginner, opts ...GitHubAppReconcileLockerOption) *PgGitHubAppReconcileLocker {
	locker := &PgGitHubAppReconcileLocker{pool: pool, hold: GitHubAppInstallationReconcileHoldBudget}
	for _, opt := range opts {
		opt(locker)
	}
	return locker
}

func (l *PgGitHubAppReconcileLocker) TryWithLock(ctx context.Context, fn func(context.Context) error) (bool, error) {
	// Everything from the Begin below to the deferred rollback runs under a
	// written bound, including fn: fn is called SYNCHRONOUSLY on this
	// goroutine, so the transaction's connection is never returned to the pool
	// while the reconcile is still using it, and the bound reaches fn's own
	// acquires and GitHub round trips rather than only this frame.
	held, endHold := context.WithTimeout(ctx, l.hold)
	defer endHold()

	tx, err := l.pool.Begin(held)
	if err != nil {
		// Nothing is held yet, so this is the pool refusing to start the
		// election at all. Naming it separately keeps an exhausted pool from
		// reading as a reconcile that ran and failed.
		if held.Err() != nil && ctx.Err() == nil {
			corePoolDutyStall(l.duty, corePoolDutyGitHubAppReconcile, corePoolStageElectionLock)
		}
		return false, err
	}
	// releaseHeld is assigned once this tick actually wins the election; the
	// rollback has to run BEFORE it, because the duty is still holding the
	// connection and the advisory lock until the rollback returns. Deferring
	// the gauge separately would decrement it first (defers unwind last in,
	// first out) and publish a release the pool has not seen yet.
	releaseHeld := func() {}
	defer func() {
		release, cancel := corePoolRelease(ctx)
		defer cancel()
		_ = tx.Rollback(release)
		releaseHeld()
	}()

	var acquired bool
	if err := tx.QueryRow(held, githubAppReconcileLockSQL).Scan(&acquired); err != nil {
		return false, err
	}
	if !acquired {
		return false, nil
	}

	releaseHeld = corePoolDutyHold(l.duty, corePoolDutyGitHubAppReconcile)
	err = fn(held)
	if held.Err() != nil && ctx.Err() == nil {
		corePoolDutyStall(l.duty, corePoolDutyGitHubAppReconcile, corePoolStageLockedWork)
	}
	return true, err
}

// StartGitHubAppInstallationReconciler reconciles GitHub App installations now
// and then every interval until ctx is done. Webhooks are hints; this sweep is
// the only repair for a missed one. Run it as a goroutine.
func (s *RepoConnectionService) StartGitHubAppInstallationReconciler(ctx context.Context, locker GitHubAppReconcileLocker, interval time.Duration) {
	runGitHubAppInstallationReconcileLoop(ctx, locker, interval, s.ReconcileGitHubAppInstallations)
}

func runGitHubAppInstallationReconcileLoop(
	ctx context.Context,
	locker GitHubAppReconcileLocker,
	interval time.Duration,
	reconcile func(context.Context) error,
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		runGitHubAppInstallationReconcileOnce(ctx, locker, reconcile)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func runGitHubAppInstallationReconcileOnce(
	ctx context.Context,
	locker GitHubAppReconcileLocker,
	reconcile func(context.Context) error,
) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("github_app.reconcile.panic", "panic", r)
		}
	}()
	if ctx.Err() != nil {
		return
	}
	var err error
	if locker == nil {
		err = reconcile(ctx)
	} else {
		var ran bool
		ran, err = locker.TryWithLock(ctx, reconcile)
		if err == nil && !ran {
			slog.Debug("github_app.reconcile.skipped", "reason", "another replica holds the reconcile lock")
			return
		}
	}
	if err != nil && ctx.Err() == nil {
		slog.Error("github_app.reconcile.failed", "error", err)
	}
}
