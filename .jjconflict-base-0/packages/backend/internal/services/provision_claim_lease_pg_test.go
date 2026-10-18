package services

import (
	"context"
	"errors"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/database"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A PROVISIONING CLAIM IS A COMMITTED LEASE (smithersai/smithers#4294).
//
// The claim used to be pg_try_advisory_xact_lock on a transaction that stayed
// open, idle, while its work booted a guest and cloned the repository: up to
// half an hour per claim. In production on 2026-10-18 each in-flight lane held
// one core-pool connection that way, a few concurrent starts exhausted the
// pool, the failed-start reap was refused core_pool_exhausted, and the idle
// transaction pinned backend_xmin. If PostgreSQL ended that idle session, the
// lock went with it and another replica claimed a row whose guest was still
// booting.
//
// The claim is now a row in workspace_provisioning_leases, committed in one
// short transaction and renewed by a heartbeat. These tests run on real
// PostgreSQL with each replica's core pool built by database.NewPool, so
// every session carries the idle bound the test names.

// provisionLeasePool is one replica's core pool on the test database. Its
// sessions carry name as their application_name, so pg_stat_activity can say
// whose they are, and idleSecs as their idle_in_transaction_session_timeout.
func provisionLeasePool(t *testing.T, databaseURL, name string, maxConns int32, idleSecs int) *pgxpool.Pool {
	t.Helper()
	named, err := url.Parse(databaseURL)
	require.NoError(t, err)
	query := named.Query()
	query.Set("application_name", name)
	named.RawQuery = query.Encode()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	pool, err := database.NewPool(ctx, config.DatabaseConfig{URL: named.String(), MaxConns: maxConns, MinConns: 0,
		MaxConnLifetime: 600, MaxConnIdleTime: 600, StatementTimeout: 900, IdleInTransactionSessionTimeout: idleSecs})
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// seedStartingWorkspace writes one real workspace row that is starting with a
// guest bound, the shape a lane start claims.
func seedStartingWorkspace(t *testing.T, pool *pgxpool.Pool, slug string) db.Workspace {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	repository := realRepository(t, pool, slug)
	id := uuid.NewString()
	_, err := pool.Exec(ctx, `INSERT INTO workspaces(id, repository_id, user_id, name, status, vm_id) VALUES ($1,$2,$3,$4,'starting',$5)`,
		id, repository.ID, repository.UserID.Int64, slug, "vm-"+slug)
	require.NoError(t, err)
	row, err := db.New(pool).GetWorkspace(ctx, id)
	require.NoError(t, err)
	return row
}

// openTransactions counts the sessions named name that have a transaction
// open right now, read from outside their pool.
func openTransactions(t *testing.T, observer *pgx.Conn, name string) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var open int
	require.NoError(t, observer.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity
		WHERE datname = current_database() AND application_name = $1 AND xact_start IS NOT NULL`, name).Scan(&open))
	return open
}

// terminateSessions ends every session named name, the way a dead process's
// sessions end.
func terminateSessions(t *testing.T, observer *pgx.Conn, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	_, err := observer.Exec(ctx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
		WHERE datname = current_database() AND application_name = $1`, name)
	require.NoError(t, err)
}

func bootingGuestRuntime() *interruptedReleaseRuntime {
	return &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceStarting}}
}

// startClaimedBoot starts one claim whose work blocks like a booting guest
// until finish closes. booting closes once the claim is admitted; the claim's
// result arrives on done.
func startClaimedBoot(svc *WorkspaceService, row db.Workspace, finish <-chan struct{}) (booting <-chan struct{}, done <-chan error) {
	admitted, result := make(chan struct{}), make(chan error, 1)
	go func() {
		_, err := svc.withWorkspaceProvisionLock(context.Background(), workspaceClaimStart, row, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
			close(admitted)
			<-finish
			return current, nil
		})
		result <- err
	}()
	return admitted, result
}

func awaitClosed(t *testing.T, ch <-chan struct{}, what string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(corePoolObserveBound):
		t.Fatalf("%s did not happen within %s", what, corePoolObserveBound)
	}
}

func awaitResult(t *testing.T, ch <-chan error, what string) error {
	t.Helper()
	select {
	case err := <-ch:
		return err
	case <-time.After(corePoolObserveBound):
		t.Fatalf("%s did not finish within %s", what, corePoolObserveBound)
		return nil
	}
}

// (1) While a claimed guest boots, no transaction of the claimer's is open,
// and its whole core pool serves other work at once.
func TestAClaimedBootHoldsNoTransactionAndLeavesThePoolWhole(t *testing.T) {
	databaseURL := testdb.NewFromTemplate(t, productTemplateName(t)).URL
	pool := provisionLeasePool(t, databaseURL, "claimed-boot", shippedWorkerCorePoolMaxConns, config.DefaultDatabaseIdleInTransactionSessionTimeoutSecs)
	observer := outOfPoolConn(t, databaseURL)
	svc := realStoreReconciler(t, pool, bootingGuestRuntime(), newCorePoolDutyRecorder())
	row := seedStartingWorkspace(t, pool, "claimed-boot")

	finish := make(chan struct{})
	var finishOnce sync.Once
	end := func() { finishOnce.Do(func() { close(finish) }) }
	defer end()
	booting, done := startClaimedBoot(svc, row, finish)
	awaitClosed(t, booting, "the claim's admission")

	assert.Zero(t, openTransactions(t, observer, "claimed-boot"),
		"the claim keeps a transaction open while its guest boots")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	held := make([]*pgxpool.Conn, 0, shippedWorkerCorePoolMaxConns)
	defer func() {
		for _, conn := range held {
			conn.Release()
		}
	}()
	for range shippedWorkerCorePoolMaxConns {
		conn, err := pool.Acquire(ctx)
		require.NoError(t, err, "the pool could not serve %d connections at once while a claimed guest boots", shippedWorkerCorePoolMaxConns)
		held = append(held, conn)
	}
	for _, conn := range held {
		var one int
		require.NoError(t, conn.QueryRow(ctx, `SELECT 1`).Scan(&one))
	}
	for _, conn := range held {
		conn.Release()
	}
	held = nil

	end()
	require.NoError(t, awaitResult(t, done, "the claimed boot"))
}

// (2) A claim whose holder is alive and heartbeating is never taken by a
// second replica, even after its work has run far past the idle-in-transaction
// bound every session carries and past several lease lifetimes. The claim
// therefore no longer depends on idle_in_transaction_session_timeout at all.
func TestAHeartbeatingClaimPastTheIdleBoundIsNeverTaken(t *testing.T) {
	databaseURL := testdb.NewFromTemplate(t, productTemplateName(t)).URL
	const idleSecs = 1
	poolA := provisionLeasePool(t, databaseURL, "replica-a", shippedWorkerCorePoolMaxConns, idleSecs)
	poolB := provisionLeasePool(t, databaseURL, "replica-b", shippedWorkerCorePoolMaxConns, idleSecs)
	runtime := bootingGuestRuntime()
	replicaA := realStoreReconciler(t, poolA, runtime, newCorePoolDutyRecorder())
	replicaB := realStoreReconciler(t, poolB, runtime, newCorePoolDutyRecorder())
	shortenProvisionLease(replicaA, time.Second, 200*time.Millisecond)
	shortenProvisionLease(replicaB, time.Second, 200*time.Millisecond)
	row := seedStartingWorkspace(t, poolA, "heartbeating-claim")

	const boot = 3500 * time.Millisecond
	booting, claimEnded := make(chan struct{}), make(chan error, 1)
	doneA := make(chan error, 1)
	go func() {
		_, err := replicaA.withWorkspaceProvisionLock(context.Background(), workspaceClaimStart, row, func(claim context.Context, current db.Workspace) (db.Workspace, error) {
			close(booting)
			select {
			case <-time.After(boot): // the guest is still booting, then cloning
			case <-claim.Done():
			}
			claimEnded <- claim.Err()
			return current, nil
		})
		doneA <- err
	}()
	awaitClosed(t, booting, "replica A's admission")

	admitted, attempts := 0, 0
	for started := time.Now(); time.Since(started) < boot-500*time.Millisecond; time.Sleep(250 * time.Millisecond) {
		attempts++
		_, err := replicaB.withWorkspaceProvisionLock(context.Background(), workspaceClaimStart, row, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
			admitted++
			return current, nil
		})
		if err != nil {
			require.True(t, errors.Is(err, errWorkspaceProvisionInProgress), "replica B was not refused as contended: %v", err)
		}
	}
	require.Greater(t, attempts, 8, "replica B did not keep trying across the boot")
	require.Zero(t, admitted, "replica B was admitted to a row whose claim was still booting past the %d s idle bound", idleSecs)
	require.NoError(t, awaitResult(t, claimEnded, "replica A's boot"), "replica A's claim context ended while its holder was alive")
	require.NoError(t, awaitResult(t, doneA, "replica A's claim"))

	// The finished claim leaves nothing behind: replica B is admitted at once.
	ran := false
	_, err := replicaB.withWorkspaceProvisionLock(context.Background(), workspaceClaimStart, row, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
		ran = true
		return current, nil
	})
	require.NoError(t, err)
	require.True(t, ran, "a finished claim still held its row")
}

// The default idle bound still outlasts the longest idle hold a member's start
// of a machine-owned branch makes: that start holds the member's mutation
// transaction (withBranchMachineMutation) across a boot within the
// provisioning budget and then a repository transfer. The provisioning claim
// no longer holds a transaction (see the test above), so lowering this bound
// waits only for that start.
func TestIdleTransactionTimeoutOutlastsAMemberStartTransaction(t *testing.T) {
	idle := time.Duration(config.DefaultDatabaseIdleInTransactionSessionTimeoutSecs) * time.Second
	hold := workspaceProvisionTimeout + workspaceCloneTimeout
	require.Greater(t, idle, hold, "an idle member-start transaction is closed before its boot and clone can finish")
}

// dyingTransactions is a replica's transaction source that stops reaching the
// database once die is called, as a crashed or partitioned process does.
type dyingTransactions struct {
	pool *pgxpool.Pool
	dead atomic.Bool
}

var errReplicaDied = errors.New("replica died")

func (d *dyingTransactions) Begin(ctx context.Context) (pgx.Tx, error) {
	if d.dead.Load() {
		return nil, errReplicaDied
	}
	return d.pool.Begin(ctx)
}

// (3) A dead holder's lease expires and a second replica claims the row. The
// dead holder's own work is fenced first: its claim context ends before the
// second replica is admitted, so two guests never boot for one row.
func TestADeadHoldersLeaseExpiresAndAnotherReplicaClaimsTheRow(t *testing.T) {
	databaseURL := testdb.NewFromTemplate(t, productTemplateName(t)).URL
	idle := config.DefaultDatabaseIdleInTransactionSessionTimeoutSecs
	poolA := provisionLeasePool(t, databaseURL, "dead-holder", shippedWorkerCorePoolMaxConns, idle)
	poolB := provisionLeasePool(t, databaseURL, "survivor", shippedWorkerCorePoolMaxConns, idle)
	observer := outOfPoolConn(t, databaseURL)
	runtime := bootingGuestRuntime()
	dying := &dyingTransactions{pool: poolA}
	replicaA := newWorkspaceServiceForTests(db.New(poolA), WithWorkspaceRuntime(runtime),
		WithWorkspaceTransactions(dying), WithWorkspaceSandboxMetrics(newCorePoolDutyRecorder()))
	replicaB := realStoreReconciler(t, poolB, runtime, newCorePoolDutyRecorder())
	shortenProvisionLease(replicaA, time.Second, 200*time.Millisecond)
	shortenProvisionLease(replicaB, time.Second, 200*time.Millisecond)
	row := seedStartingWorkspace(t, poolA, "dead-holder")

	booting, fenced := make(chan struct{}), make(chan time.Time, 1)
	doneA := make(chan error, 1)
	go func() {
		_, err := replicaA.withWorkspaceProvisionLock(context.Background(), workspaceClaimStart, row, func(claim context.Context, current db.Workspace) (db.Workspace, error) {
			close(booting)
			select {
			case <-claim.Done():
				fenced <- time.Now()
			case <-time.After(corePoolObserveBound):
				fenced <- time.Time{}
			}
			return current, nil
		})
		doneA <- err
	}()
	awaitClosed(t, booting, "replica A's admission")

	// Replica A dies: it reaches the database no more, and its sessions end.
	dying.dead.Store(true)
	terminateSessions(t, observer, "dead-holder")

	var admittedAt time.Time
	require.Eventually(t, func() bool {
		_, err := replicaB.withWorkspaceProvisionLock(context.Background(), workspaceClaimStart, row, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
			admittedAt = time.Now()
			return current, nil
		})
		return err == nil && !admittedAt.IsZero()
	}, corePoolObserveBound, 100*time.Millisecond, "replica B never claimed the dead holder's row")

	var fencedAt time.Time
	select {
	case fencedAt = <-fenced:
	case <-time.After(2 * corePoolObserveBound):
		t.Fatal("replica A's boot never returned")
	}
	require.False(t, fencedAt.IsZero(), "the dead holder's boot kept its claim context after losing its lease")
	require.True(t, fencedAt.Before(admittedAt),
		"replica B was admitted at %s, before the dead holder's work was fenced at %s", admittedAt.Format(time.StampMilli), fencedAt.Format(time.StampMilli))
	_ = awaitResult(t, doneA, "replica A's claim")
}

// (4) N claimed boots in flight at once hold no core-pool connection, no
// reservation and no held-duty gauge between their lease renewals. These are
// what refused the failed-start reap core_pool_exhausted in production.
func TestConcurrentClaimedBootsHoldNoCorePoolConnection(t *testing.T) {
	databaseURL := testdb.NewFromTemplate(t, productTemplateName(t)).URL
	const apiCorePoolMaxConns = 10
	pool := provisionLeasePool(t, databaseURL, "concurrent-boots", apiCorePoolMaxConns, config.DefaultDatabaseIdleInTransactionSessionTimeoutSecs)
	observer := outOfPoolConn(t, databaseURL)
	recorder := newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, pool, bootingGuestRuntime(), recorder)
	boots := svc.provisionTasks.limit
	require.GreaterOrEqual(t, boots, 2, "the gate admits too few claims for this test to mean anything")

	finish := make(chan struct{})
	var finishOnce sync.Once
	end := func() { finishOnce.Do(func() { close(finish) }) }
	defer end()
	dones := make([]<-chan error, 0, boots)
	for i := range boots {
		row := seedStartingWorkspace(t, pool, "concurrent-boot-"+string(rune('a'+i)))
		booting, done := startClaimedBoot(svc, row, finish)
		awaitClosed(t, booting, "a claimed boot's admission")
		dones = append(dones, done)
	}

	var acquired int32
	var reserved int
	var heldDuty float64
	for sampled := time.Now(); time.Since(sampled) < time.Second; time.Sleep(50 * time.Millisecond) {
		acquired = max(acquired, pool.Stat().AcquiredConns())
		reserved = max(reserved, svc.provisionTasks.reservedConnections())
		heldDuty = max(heldDuty, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim))
	}
	assert.Zero(t, acquired, "%d claimed boots hold core-pool connections", boots)
	assert.Zero(t, reserved, "%d claimed boots keep core-pool reservations", boots)
	assert.Zero(t, heldDuty, "%d claimed boots report a held core-pool duty", boots)
	assert.Zero(t, openTransactions(t, observer, "concurrent-boots"), "claimed boots keep transactions open")

	end()
	for _, done := range dones {
		require.NoError(t, awaitResult(t, done, "a claimed boot"))
	}
}

// shortenProvisionLease gives svc a short lease and heartbeat, so a test can
// outlive several lease lifetimes in seconds.
func shortenProvisionLease(svc *WorkspaceService, ttl, heartbeat time.Duration) {
	svc.provisionLeaseTTL = ttl
	svc.provisionLeaseHeartbeat = heartbeat
}
