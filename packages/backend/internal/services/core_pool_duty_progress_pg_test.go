package services

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// THE ACTUAL OBSERVED OPERATION, held against the real product store.
//
// The closed read-only wait aggregate taken while the serving background
// worker was stopped names the long-held core-pool operations by their own
// literals. The one this file is about is the first row:
//
//	github_app_reconcile_lock  idle_in_transaction  wait=Client  advisory held   6858s
//	GetRepoByID                idle_in_transaction  wait=Client  advisory held   6847s
//	                           namespace=repository_ownership   mode=ShareLock
//	session_advisory_lock      active  wait=Lock  pending=advisory  1 blocker    6859s
//	session_advisory_lock      idle    wait=Client  advisory held
//
// The first row's literal is
// pg_try_advisory_xact_lock(hashtextextended('github_app_installation_reconcile', 0)),
// and exactly one statement in this program issues it: see
// githubAppReconcileLockSQL. So a core-pool connection AND a
// transaction-scoped advisory lock were held for 6858 seconds — longer than
// the hourly interval that started the tick — by a duty whose hold had no
// bound at all: PgGitHubAppReconcileLocker calls fn while its election
// transaction is open, every database operation fn makes is a second acquire
// on the SAME pool, every GitHub round trip between them is unbounded too, and
// the context it all runs under is the process's.
//
// What these rows do NOT establish, and what this file does not assert: which
// process or goroutine owned any of those connections. pg_stat_activity is a
// server-wide census. It cannot be read as one worker's pool, and an observed
// lock is not evidence of who is parked where. No TryLockWorkspaceProvisioning
// row appears in the aggregate at all, so a provisioning claim is NOT the
// operation that was measured holding anything.
//
// So these tests state the two things that are actually provable at the
// shipped core pool of four, against real PostgreSQL, the real product schema,
// real rows and the real store:
//
//  1. the named election hold ends, releasing its connection and its advisory
//     lock, when it cannot finish; and
//  2. the provisioning reconciler keeps making progress on a real
//     retained-guest-stop row — writing its real fenced receipt — across a
//     pool that other real duties are holding, instead of parking silently.

// shippedCorePool is an isolated product-schema database at the serving
// worker's measured core-pool size. smithers_db_connections_max read 4 on both
// worker replicas; this is the number the source has to be correct at, not a
// number a test may raise. The database is its own clone so a backlog listing
// sees only this test's rows.
func shippedCorePool(t *testing.T) (*pgxpool.Pool, *corePoolObserver) {
	t.Helper()
	database := testdb.NewFromTemplate(t, productTemplateName(t))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := postgresfixture.Open(ctx, database.URL, shippedWorkerCorePoolMaxConns)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))
	require.Equal(t, int32(shippedWorkerCorePoolMaxConns), pool.Stat().MaxConns())
	return pool, newCorePoolObserver(t, database.URL)
}

// corePoolObserveBound is how long ANY observation in this file may take. An
// observer that can block forever is not an observer.
const corePoolObserveBound = 10 * time.Second

// corePoolObserver reads the real catalog from OUTSIDE the pool it is
// measuring.
//
// A DEBUGGER MUST NOT PARTICIPATE IN THE DEADLOCK IT MEASURES. These tests
// exist to hold all four of a shipped worker's core-pool connections, so an
// observer that asked that same pool for a connection needed a FIFTH one:
// against context.Background it then blocked forever, before the nested
// acquire under test, and turned a bounded assertion into a hang that had to
// be interrupted from outside to get a stack. Its own connection is opened
// once, outside the measured pool, and every statement it makes is bounded.
//
// It is also filtered to THIS database. Advisory locks live in one database's
// lock table but pg_locks is server-wide, so an unfiltered EXISTS over the
// same key could be satisfied by a concurrent package's test database and
// report a hold this test never took.
type corePoolObserver struct {
	conn *pgx.Conn
	url  string
}

func newCorePoolObserver(t *testing.T, databaseURL string) *corePoolObserver {
	t.Helper()
	return &corePoolObserver{conn: outOfPoolConn(t, databaseURL), url: databaseURL}
}

// outOfPoolConn opens one connection to the test database that does NOT come
// from the pool under test, bounded and closed with the test. Every
// observation and every out-of-pool duty in this file uses one: a connection
// taken from the measured pool would be the first thing to block.
func outOfPoolConn(t *testing.T, databaseURL string) *pgx.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	conn, err := pgx.Connect(ctx, databaseURL)
	require.NoError(t, err)
	t.Cleanup(func() {
		closing, cancelClosing := context.WithTimeout(context.Background(), corePoolObserveBound)
		defer cancelClosing()
		_ = conn.Close(closing)
	})
	return conn
}

// holdWorkspaceRowLock takes the real row lock a concurrent writer holds on
// one workspace, from OUTSIDE the pool under test, and returns the release.
// The claim's fenced receipt write is an UPDATE on that row, so it acquires a
// connection at once and then waits here — which is the state this file has to
// be able to tell apart from a pool that had nothing to give.
func (o *corePoolObserver) holdWorkspaceRowLock(t *testing.T, workspaceID string) (release func()) {
	t.Helper()
	conn := outOfPoolConn(t, o.url)
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	tx, err := conn.Begin(ctx)
	require.NoError(t, err)
	var locked string
	require.NoError(t, tx.QueryRow(ctx,
		`SELECT id FROM workspaces WHERE id = $1 FOR UPDATE`, workspaceID).Scan(&locked))
	require.Equal(t, workspaceID, locked, "the row this lock is for was never read")
	var once sync.Once
	release = func() {
		once.Do(func() {
			rollback, cancelRollback := context.WithTimeout(context.Background(), corePoolObserveBound)
			defer cancelRollback()
			_ = tx.Rollback(rollback)
		})
	}
	t.Cleanup(release)
	return release
}

// electionLockHeld reports whether the installation reconcile's own advisory
// lock is granted IN THIS DATABASE, matched on the exact key the shipped
// statement computes — not on a name, a count or another test's lock. It is
// how a released hold is proved released rather than assumed.
func (o *corePoolObserver) electionLockHeld(t *testing.T) bool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var held bool
	require.NoError(t, o.conn.QueryRow(ctx, `WITH key AS (
		SELECT hashtextextended('github_app_installation_reconcile', 0) AS value)
		SELECT EXISTS (
			SELECT 1 FROM pg_locks l, key
			WHERE l.locktype = 'advisory' AND l.granted
			  AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
			  AND l.classid = ((key.value >> 32) & 4294967295)::bigint::oid
			  AND l.objid = (key.value & 4294967295)::bigint::oid)`).Scan(&held))
	return held
}

// repoOwnershipShareLockHeld reports whether the repository's ownership lock
// is granted in SHARED mode in this database, matched on the exact key the
// shipped statement computes. This is the second hold the closed production
// aggregate named, and the mode is part of the identity: the exclusive form is
// the ownership mutator's, not a guarded write's.
func (o *corePoolObserver) repoOwnershipShareLockHeld(t *testing.T, repository int64) bool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var held bool
	require.NoError(t, o.conn.QueryRow(ctx, `WITH key AS (
		SELECT hashtextextended('repository_ownership:' || ($1::bigint)::text, 0) AS value)
		SELECT EXISTS (
			SELECT 1 FROM pg_locks l, key
			WHERE l.locktype = 'advisory' AND l.granted AND l.mode = 'ShareLock'
			  AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
			  AND l.classid = ((key.value >> 32) & 4294967295)::bigint::oid
			  AND l.objid = (key.value & 4294967295)::bigint::oid)`, repository).Scan(&held))
	return held
}

// advisoryLockWaiters counts backends blocked on an advisory lock in THIS
// database, which is how the parked session-lock pair is proved parked.
func (o *corePoolObserver) advisoryLockWaiters(t *testing.T) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var waiters int
	require.NoError(t, o.conn.QueryRow(ctx, `SELECT count(*) FROM pg_locks l
		JOIN pg_stat_activity a USING (pid)
		WHERE l.locktype = 'advisory' AND NOT l.granted
		  AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
		  AND a.pid <> pg_backend_pid()`).Scan(&waiters))
	return waiters
}

// rowLockWaiters counts backends blocked on a ROW lock in this database — a
// transactionid or tuple wait, which is what a statement that already has its
// connection and is executing against a contended row waits on. It is how a
// blocked query is proved blocked rather than assumed, from outside the pool.
func (o *corePoolObserver) rowLockWaiters(t *testing.T) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var waiters int
	require.NoError(t, o.conn.QueryRow(ctx, `SELECT count(*) FROM pg_locks l
		JOIN pg_stat_activity a USING (pid)
		WHERE NOT l.granted AND l.locktype IN ('transactionid', 'tuple')
		  AND a.datname = current_database() AND a.pid <> pg_backend_pid()`).Scan(&waiters))
	return waiters
}

// parkSessionAdvisoryPair reproduces the aggregate's last two rows with their
// real SQL: one pooled connection holding a session-level advisory lock, and a
// SECOND pooled connection blocked in pg_advisory_lock on the same key. Both
// shapes are ordinary background duty on this pool — flowhost's binding lease
// and the journal session locks are written exactly this way — and the
// blocked one's wait is itself unbounded.
//
// It returns nothing: the point is the two core-pool connections it removes
// from the pool for the life of the test.
func parkSessionAdvisoryPair(t *testing.T, pool *pgxpool.Pool, observer *corePoolObserver, key string) {
	t.Helper()
	ctx := context.Background()
	holder, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = holder.Exec(ctx, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, key)
	require.NoError(t, err)

	waiter, err := pool.Acquire(ctx)
	require.NoError(t, err)
	waiting, cancelWaiting := context.WithCancel(ctx)
	blocked := make(chan struct{})
	go func() {
		defer close(blocked)
		_, _ = waiter.Exec(waiting, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, key)
	}()
	// Read through the observer's own connection: this pool is being drained
	// on purpose, and a check that needed a connection from it would be the
	// first thing to block.
	require.Eventually(t, func() bool { return observer.advisoryLockWaiters(t) > 0 },
		20*time.Second, 20*time.Millisecond, "the blocked session-lock caller never reached its wait")

	t.Cleanup(func() {
		cancelWaiting()
		<-blocked
		_, _ = holder.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtextextended($1, 0))`, key)
		waiter.Release()
		holder.Release()
	})
	require.Equal(t, int32(2), pool.Stat().AcquiredConns(),
		"the session-lock pair must hold exactly two core-pool connections")
}

// corePoolDutyRecorder is the metrics surface an operator reads, recording the
// SERIES rather than that a call happened: a dashboard and an alert are built
// on the series.
type corePoolDutyRecorder struct {
	mu     sync.Mutex
	budget float64
	held   map[string]float64
	peak   map[string]float64
	stalls map[string]map[string]int
}

func newCorePoolDutyRecorder() *corePoolDutyRecorder {
	return &corePoolDutyRecorder{
		held:   map[string]float64{},
		peak:   map[string]float64{},
		stalls: map[string]map[string]int{},
	}
}

func (r *corePoolDutyRecorder) SetWorkspaceProvisionClaimBudget(claims float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.budget = claims
}

func (r *corePoolDutyRecorder) AddCorePoolDutyHeld(duty string, delta float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.held[duty] += delta
	if r.held[duty] > r.peak[duty] {
		r.peak[duty] = r.held[duty]
	}
}

func (r *corePoolDutyRecorder) ObserveCorePoolDutyStall(duty, stage string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stalls[duty] == nil {
		r.stalls[duty] = map[string]int{}
	}
	r.stalls[duty][stage]++
}

// The rest of SandboxMetricsRecorder, which these tests say nothing about: the
// duty series ride the same observer the composition already hands the
// service, so the double has to satisfy that whole surface.
func (r *corePoolDutyRecorder) ObserveSandboxVMCreate(string, string, float64) {}
func (r *corePoolDutyRecorder) AddSandboxActiveVMs(string, float64)            {}
func (r *corePoolDutyRecorder) ObserveSandboxVMSuspend(float64)                {}

func (r *corePoolDutyRecorder) heldNow(duty corePoolDuty) float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.held[string(duty)]
}

func (r *corePoolDutyRecorder) peakHeld(duty corePoolDuty) float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.peak[string(duty)]
}

func (r *corePoolDutyRecorder) stallCount(duty corePoolDuty, stage corePoolStage) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.stalls[string(duty)][string(stage)]
}

func (r *corePoolDutyRecorder) publishedLabels() map[string][]string {
	r.mu.Lock()
	defer r.mu.Unlock()
	labels := map[string][]string{}
	for duty, stages := range r.stalls {
		for stage := range stages {
			labels[duty] = append(labels[duty], stage)
		}
	}
	return labels
}

// THE ELECTION HOLD, ended. This is the operation the aggregate named.
//
// Three core-pool connections are already held by real duty, so the election
// transaction takes the fourth and the reconcile's very first database
// operation — a second acquire on the SAME pool — has nothing to acquire. That
// is the production shape exactly: a connection and a transaction-scoped
// advisory lock held while the goroutine is parked in Acquire, with
// idle_in_transaction and wait=Client on the server side because the backend
// has no query to run.
//
// Before, nothing could end it: pgxpool.Acquire waits until its context is
// done and that context was the process's. After, the written hold budget ends
// it, the connection goes back, the advisory lock is released, and the next
// hourly tick re-drives a reconcile every write of which is an idempotent
// upsert.
func TestGitHubAppReconcileElectionHoldReleasesItsCorePoolConnection(t *testing.T) {
	pool, observer := shippedCorePool(t)
	parkSessionAdvisoryPair(t, pool, observer, "flow-host-binding:election-hold")
	stray, err := pool.Acquire(context.Background())
	require.NoError(t, err)
	t.Cleanup(stray.Release)

	recorder := newCorePoolDutyRecorder()
	const hold = 2 * time.Second
	locker := NewPgGitHubAppReconcileLocker(pool,
		WithGitHubAppReconcileCorePoolObserver(recorder),
		withGitHubAppReconcileHoldBudget(hold))

	// The reconcile's own first core-pool operation, standing in for every
	// installation upsert ReconcileGitHubAppInstallations makes through
	// s.db: a second acquire from the pool the election transaction is
	// already holding a connection from.
	reconciled := make(chan error, 1)
	lockedWhileRunning := make(chan bool, 1)
	started := time.Now()
	ran, err := locker.TryWithLock(context.Background(), func(ctx context.Context) error {
		lockedWhileRunning <- observer.electionLockHeld(t)
		_, execErr := pool.Exec(ctx, `SELECT 1`)
		reconciled <- execErr
		return execErr
	})
	elapsed := time.Since(started)

	require.True(t, ran, "this process won the election, so the reconcile ran")
	require.True(t, <-lockedWhileRunning, "the election lock must be held for the reconcile that won it")
	require.Error(t, err, "a reconcile whose pool has nothing left must fail finitely, not park")
	require.ErrorIs(t, <-reconciled, context.DeadlineExceeded,
		"the nested acquire must end on the written hold budget")
	require.Less(t, elapsed, hold+15*time.Second, "the hold outlived its written budget")

	// The two things production could not get back: the connection and the
	// lock. Both are proved released through the real catalog and the real
	// pool, not inferred from the call returning.
	require.Eventually(t, func() bool { return !observer.electionLockHeld(t) }, 10*time.Second, 50*time.Millisecond,
		"the election advisory lock is still granted after its hold ended")
	require.Eventually(t, func() bool { return pool.Stat().AcquiredConns() == 3 }, 10*time.Second, 50*time.Millisecond,
		"the election connection never went back to the pool")
	require.Zero(t, recorder.heldNow(corePoolDutyGitHubAppReconcile), "the held gauge leaked")
	require.Equal(t, float64(1), recorder.peakHeld(corePoolDutyGitHubAppReconcile),
		"one tick holds exactly one core-pool connection")
	require.Equal(t, 1, recorder.stallCount(corePoolDutyGitHubAppReconcile, corePoolStageLockedWork),
		"the refusal must name the hold that ended, so an operator sees which duty was sitting on the pool")
}

// Shutdown is shutdown. The hold budget is an upper limit on a tick, never a
// floor under cancellation, and a redeploy must not read as a duty that could
// not finish — an operator sent to look at the pool on every rollout stops
// believing the series.
func TestGitHubAppReconcileHoldUnwindsOnShutdownWithoutAStall(t *testing.T) {
	pool, observer := shippedCorePool(t)
	parkSessionAdvisoryPair(t, pool, observer, "flow-host-binding:election-shutdown")
	stray, err := pool.Acquire(context.Background())
	require.NoError(t, err)
	t.Cleanup(stray.Release)

	recorder := newCorePoolDutyRecorder()
	locker := NewPgGitHubAppReconcileLocker(pool,
		WithGitHubAppReconcileCorePoolObserver(recorder),
		withGitHubAppReconcileHoldBudget(time.Hour))

	ctx, cancel := context.WithCancel(context.Background())
	entered := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		_, err := locker.TryWithLock(ctx, func(inner context.Context) error {
			close(entered)
			_, execErr := pool.Exec(inner, `SELECT 1`)
			return execErr
		})
		done <- err
	}()
	<-entered
	time.Sleep(200 * time.Millisecond)
	stopped := time.Now()
	cancel()

	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled, "a cancelled tick reports cancellation")
		require.Less(t, time.Since(stopped), 15*time.Second, "shutdown waited out the hold budget")
	case <-time.After(30 * time.Second):
		t.Fatal("a cancelled reconcile tick never unwound")
	}
	require.Zero(t, recorder.stallCount(corePoolDutyGitHubAppReconcile, corePoolStageLockedWork),
		"shutdown was published as a duty that could not finish")
	require.Zero(t, recorder.heldNow(corePoolDutyGitHubAppReconcile), "the held gauge leaked on shutdown")
	require.Eventually(t, func() bool { return !observer.electionLockHeld(t) }, 10*time.Second, 50*time.Millisecond,
		"a cancelled tick kept the election advisory lock")
}

// The election still elects. A second replica that does not win the lock runs
// nothing, holds nothing and publishes nothing — the bound above must not have
// turned a refused election into a hold or a stall.
func TestGitHubAppReconcileElectionStillRefusesTheSecondReplica(t *testing.T) {
	pool, _ := shippedCorePool(t)
	recorder := newCorePoolDutyRecorder()
	winner := NewPgGitHubAppReconcileLocker(pool, WithGitHubAppReconcileCorePoolObserver(recorder))
	loser := NewPgGitHubAppReconcileLocker(pool, WithGitHubAppReconcileCorePoolObserver(recorder))

	holding, release := make(chan struct{}), make(chan struct{})
	held := make(chan error, 1)
	go func() {
		_, err := winner.TryWithLock(context.Background(), func(context.Context) error {
			close(holding)
			<-release
			return nil
		})
		held <- err
	}()
	<-holding

	var secondRan bool
	secondRan, err := loser.TryWithLock(context.Background(), func(context.Context) error {
		t.Error("a replica that lost the election ran the reconcile anyway")
		return nil
	})
	require.NoError(t, err)
	require.False(t, secondRan, "two replicas walked the same installations")
	require.Equal(t, float64(1), recorder.heldNow(corePoolDutyGitHubAppReconcile),
		"a refused election must hold no core-pool connection of its own")
	require.Zero(t, recorder.stallCount(corePoolDutyGitHubAppReconcile, corePoolStageLockedWork))
	require.Zero(t, recorder.stallCount(corePoolDutyGitHubAppReconcile, corePoolStageElectionLock))

	close(release)
	require.NoError(t, <-held)
	require.Zero(t, recorder.heldNow(corePoolDutyGitHubAppReconcile))
}

// realRetainedGuestStopRow seeds the production cohort as REAL rows: a real
// owner, a real repository and a real workspace written off `failed` with the
// repository-advertisement sentence, NO cleanup stage, and the placement whose
// guest the failed start had already brought up. The disk marker, the retained
// head and capture, and the pending capture are the things a delete would take
// and a stop must not.
//
// Everything about it is read back through the real store afterwards, so the
// test states the ROW rather than a double's memory.
func realRetainedGuestStopRow(t *testing.T, pool *pgxpool.Pool, slug string) db.Workspace {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)
	owner, err := q.CreateUser(ctx, db.CreateUserParams{
		Username: slug + "-owner", LowerUsername: slug + "-owner", DisplayName: "Owner"})
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{
		UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: slug, LowerName: slug, DefaultBookmark: "main"})
	require.NoError(t, err)

	id := uuid.NewString()
	_, err = pool.Exec(ctx, `INSERT INTO workspaces
		(id, repository_id, user_id, name, kind, vm_id, provisioning_generation, status,
		 failure_code, failure_message, provisioning_stage,
		 cleanup_pending_head, cleanup_pending_capture_id, capture_pending, disk_reclaimed_at)
		VALUES ($1,$2,$3,$4,'container',$5,3,'failed',$6,$7,'','zzzzzzzzzzzz','capture-advertisement',
		        '{"pending":true}'::jsonb, now() - interval '8 days')`,
		id, repo.ID, owner.ID, slug, "vm-"+slug,
		string(pkgerrors.CodeConflict), workspaceRepositoryAdvertisementUnverifiedMessage)
	require.NoError(t, err)

	// The row the backlog will actually hand the reconciler, read through the
	// real query rather than constructed.
	row, err := q.GetWorkspace(ctx, id)
	require.NoError(t, err)
	door, listed := retainedGuestStopPending(row)
	require.True(t, listed, "the seeded row is not in the retained-guest-stop cohort")
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, door.reason)

	rows, err := q.ListWorkspaceProvisioningRecovery(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1, "the shipped backlog query must list exactly this row")
	require.Equal(t, id, rows[0].ID)
	return row
}

// realStoreReconciler composes the worker's recovery reconciler the way
// compose/main.go does, and with the SAME parts: the real *db.Queries store
// (so GetWorkspace, ListWorkspaceProvisioningRecovery and the fenced
// FailWorkspaceIfUnchanged are the shipped SQL) and the real pool behind BOTH
// that store and the provisioning transactions. Only the guest runtime is a
// double, because a test cannot boot a microVM.
func realStoreReconciler(t *testing.T, pool *pgxpool.Pool, runtime workspaceapi.WorkspaceRuntime, recorder *corePoolDutyRecorder) *WorkspaceService {
	t.Helper()
	return newWorkspaceServiceForTests(db.New(pool),
		WithWorkspaceRuntime(runtime),
		WithWorkspaceTransactions(pool),
		WithWorkspaceSandboxMetrics(recorder))
}

// THE STALL AND THE PROGRESS, on the real store at the shipped core pool,
// under the TWO duties production actually recorded.
//
// No invented holder appears here. Every one of the four core-pool
// connections is held by one of the two operations the closed read-only wait
// aggregate named by its own source literal, each in the shape its source
// gives it:
//
//	github_app_installation_reconcile  election transaction  + its reconcile's
//	                                   SECOND acquire on the SAME pool
//	repository_ownership (ShareLock)   guard transaction     + the guarded
//	                                   write's SECOND acquire on the SAME pool
//
// That second acquire is the real chain, not a prop: compose launches
// StartSyncWebhookReconciler(workerCtx, 10m) -> EnsureSyncWebhooks ->
// EnsureSystemWebhook -> guardedRepoWrite -> WithRepoOwnershipShared, which
// begins its transaction, takes the ShareLock, re-validates with GetRepoByID
// and then calls write() = EnsureWebhookAtURL, an ordinary row write on the
// same pool. The installation reconcile is written the same way: every
// installation and repository upsert it makes is a second acquire under its
// held election transaction.
//
// NOTHING HERE IS DRIVEN BY A DEADLINE. Both hold budgets are far longer than
// this test, and every transition is a connection this test gives back. That
// is the point: an earlier version of this case set the election's budget to
// four seconds, which is shorter than the fifteen-second listing bound it then
// asserted a refusal against, so the hold ended at 4s, the listing succeeded
// and the assertion failed on a pool that was no longer exhausted. The
// assertion was right; the arrangement could not hold the pool exhausted for
// as long as the refusal needed. Convergence is now demonstrated with BOTH
// named locks still held.
//
// OLD: the reconcile pass never returns. Its FIRST acquire —
// ListWorkspaceProvisioningRecovery, before the claim gate, before any
// advisory lock, before any fence that could log — waits until its context is
// done, and a reconciler tick's context is the process's.
// RunProvisioningReconciler reads its ticker only after reconcile RETURNS, so
// that pass is the last iteration the loop ever runs: fifteen elapsed minutes
// were never 180 completed ticks, and nothing was ever recorded.
//
// NEW: every pass returns, and each refusal names the step that refused in
// the order the pool recovers — the loop's own listing read while nothing is
// free, then the claim's measured headroom while one connection is free and a
// claim needs two, then real progress and the real fenced receipt once two
// are. Nothing is decided about a guest until the pool can serve the whole
// claim. An operator who sees list_backlog is looking at a tick that reached
// no row at all; one who sees pool_headroom is looking at a tick that listed
// rows and declined to half-claim one.
func TestRetainedGuestStopProgressesOnceTheElectionHoldReleases(t *testing.T) {
	pool, observer := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-progress")
	guarded := realRepository(t, pool, "corepool-progress-guard")

	guest := &interruptedReleaseGuest{
		state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy",
		history: []string{"change-a", "change-b"}, snapshots: 2}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, pool, runtime, recorder)

	// DUTY ONE: the installation reconcile's election, holding its
	// transaction's connection and the real advisory lock, with its own
	// reconcile holding a SECOND connection from the same pool. Its budget is
	// an hour, so nothing in this test depends on it ending.
	election := newNestedPoolHold(t)
	locker := NewPgGitHubAppReconcileLocker(pool,
		WithGitHubAppReconcileCorePoolObserver(recorder),
		withGitHubAppReconcileHoldBudget(time.Hour))
	go func() {
		_, err := locker.TryWithLock(context.Background(), func(held context.Context) error {
			return election.holdSecondConnection(held, pool, func(ctx context.Context, conn *pgxpool.Conn) error {
				var one int
				return conn.QueryRow(ctx, `SELECT 1`).Scan(&one)
			})
		})
		election.returned <- err
	}()
	<-election.holding
	require.True(t, observer.electionLockHeld(t), "the election is not holding the lock it won")

	// DUTY TWO: the ownership fence, holding its guard transaction's
	// connection and the repository's ownership lock in SHARED mode, with the
	// guarded write holding a SECOND connection from the same pool and making
	// the real re-validating read on it.
	ownership := newNestedPoolHold(t)
	fence := NewRepoOwnershipFence(pool,
		WithRepoOwnershipCorePoolObserver(recorder),
		withRepoOwnershipHoldBudget(time.Hour))
	go func() {
		ownership.returned <- fence.WithRepoOwnershipShared(context.Background(), guarded,
			func(held context.Context) error {
				return ownership.holdSecondConnection(held, pool, func(ctx context.Context, conn *pgxpool.Conn) error {
					_, err := db.New(conn).GetRepoByID(ctx, guarded.ID)
					return err
				})
			})
	}()
	<-ownership.holding
	require.True(t, observer.repoOwnershipShareLockHeld(t, guarded.ID),
		"the guarded write is not holding the repository's ownership lock shared")

	require.Equal(t, int32(shippedWorkerCorePoolMaxConns), pool.Stat().AcquiredConns(),
		"the two recorded duties did not fill the shipped core pool, so no acquire is starved")
	require.Equal(t, float64(1), recorder.heldNow(corePoolDutyGitHubAppReconcile))
	require.Equal(t, float64(1), recorder.heldNow(corePoolDutyRepositoryOwnershipGuard))

	// NO caller deadline, because production has none: the pass must return on
	// the source's own written bounds or not at all.
	pass := func() error {
		done := make(chan error, 1)
		go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
		select {
		case err := <-done:
			return err
		case <-time.After(4 * workspaceProvisionAcquireTimeout):
			t.Fatal("the reconcile pass never returned: with no caller deadline its core-pool acquire is unbounded")
			return nil
		}
	}

	// NOTHING FREE, and nothing about to become free: the loop's own listing
	// read is the FIRST acquire a tick makes, so this is where a fully held
	// pool used to park the whole loop, with nothing held and no fence ahead
	// of it to record a reason.
	listErr := pass()
	require.Error(t, listErr, "a listing read the pool cannot serve must refuse, not park")
	stage, named := workspaceProvisionClaimStage(listErr)
	require.True(t, named, "the refusal must name the step that refused")
	require.Equal(t, interruptedReleaseStageListBacklog, stage)
	require.Equal(t, interruptedReleaseReasonDeadline, interruptedReleaseStopReasonFor(listErr),
		"an opaque query deadline must not be published as a measured pool refusal")
	require.Equal(t, 1, recorder.stallCount(corePoolDutyWorkspaceProvisionBacklog, corePoolStageListBacklog),
		"the refusal must name the loop's own listing, not a claim it never reached")
	require.Equal(t, workspaceapi.WorkspaceRunning, guest.state, "nothing was decided while the pool was held")
	require.Zero(t, runtime.stops.Load())

	// ONE FREE, and a claim needs two: the guarded write gives its nested
	// connection back, the tick now reaches the row, and declines to
	// half-claim it. A different stage, named, measured against the real pool,
	// and still nothing decided about the guest.
	ownership.freeSecondConnection()
	require.Eventually(t, func() bool { return pool.Stat().AcquiredConns() == shippedWorkerCorePoolMaxConns-1 },
		corePoolObserveBound, 20*time.Millisecond, "the guarded write's nested connection never came back")
	require.NoError(t, pass(), "a pool another duty is holding is not a tick-level failure")
	require.Positive(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
		"the refusal must name the duty and the stage, or a full pool is silent again")
	require.Equal(t, interruptedReleaseReasonPoolExhausted,
		interruptedReleaseStopReasonFor(workspaceProvisionInProgress(workspaceProvisionClaimStall{
			stage: interruptedReleaseStageAcquireConnection, cause: errCorePoolHeadroom})),
		"the measured-headroom refusal is the one refusal that does name the pool")
	require.Equal(t, workspaceapi.WorkspaceRunning, guest.state, "a claim the pool could not serve whole ran anyway")
	require.Zero(t, runtime.stops.Load())

	// ... and once the pool can serve a whole claim, the very next pass makes
	// real progress through the real store — WITH BOTH RECORDED LOCKS STILL
	// HELD. No hold budget expired, no caller deadline existed, and neither
	// duty was asked to finish: convergence comes from the bounded nested
	// acquires and the measured admission, not from a timer.
	election.freeSecondConnection()
	require.Eventually(t, func() bool { return pool.Stat().AcquiredConns() <= shippedWorkerCorePoolMaxConns-2 },
		corePoolObserveBound, 20*time.Millisecond, "the reconcile's nested connection never came back")
	require.NoError(t, pass())
	require.True(t, observer.electionLockHeld(t), "the election lock was released by someone else's bound")
	require.True(t, observer.repoOwnershipShareLockHeld(t, guarded.ID),
		"the ownership lock was released by someone else's bound")
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state,
		"the retained guest is still running, so its compute reservation never came back")
	require.Equal(t, int32(1), runtime.stops.Load(), "exactly one stop per confirmed row")
	require.Zero(t, runtime.deletes.Load(), "recovery stopped the guest; it never deleted one")

	// THE REAL FENCED RECEIPT, read back through the real store. Status stays
	// failed, the placement stays bound, no cleanup stage appears, and the
	// retained disk, head and capture are exactly as the failed start left
	// them: the compute came back because the guest is down, not because its
	// owner failed.
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no fenced receipt records the confirmed stop")
	require.Equal(t, "failed", after.Status)
	require.Equal(t, listed.VmID, after.VmID, "the placement moved")
	require.Equal(t, "", after.ProvisioningStage, "a cleanup stage appeared, which routes the row into the deleting backlog")
	require.Equal(t, listed.ProvisioningGeneration, after.ProvisioningGeneration)
	require.Equal(t, "zzzzzzzzzzzz", after.CleanupPendingHead)
	require.Equal(t, "capture-advertisement", after.CleanupPendingCaptureID)
	require.NotEmpty(t, after.CapturePending)
	require.False(t, after.DeletedAt.Valid, "the row was swept")
	require.True(t, after.UpdatedAt.After(listed.UpdatedAt), "the fenced write never landed")
	require.Equal(t, "retained-working-copy", guest.disk)
	require.Equal(t, []string{"change-a", "change-b"}, guest.history)
	require.Equal(t, 2, guest.snapshots)

	// The row leaves the backlog for good once its receipt lands, so the next
	// tick does not re-drive a confirmed stop.
	remaining, err := db.New(pool).ListWorkspaceProvisioningRecovery(context.Background())
	require.NoError(t, err)
	require.Empty(t, remaining, "a confirmed stop is still listed, so the reconciler will re-drive it forever")

	// Both duties then finish normally and give back everything they held, so
	// neither hold is reported as one that could not finish.
	election.finish()
	ownership.finish()
	require.NoError(t, <-election.returned)
	require.NoError(t, <-ownership.returned)
	require.Eventually(t, func() bool { return !observer.electionLockHeld(t) },
		corePoolObserveBound, 50*time.Millisecond, "the finished reconcile kept its election lock")
	require.Eventually(t, func() bool { return !observer.repoOwnershipShareLockHeld(t, guarded.ID) },
		corePoolObserveBound, 50*time.Millisecond, "the finished guarded write kept the ownership lock")
	require.Zero(t, recorder.heldNow(corePoolDutyGitHubAppReconcile), "the held gauge leaked")
	require.Zero(t, recorder.heldNow(corePoolDutyRepositoryOwnershipGuard), "the held gauge leaked")
	require.Zero(t, recorder.stallCount(corePoolDutyGitHubAppReconcile, corePoolStageLockedWork),
		"a reconcile that finished was published as one that could not")
	require.Zero(t, recorder.stallCount(corePoolDutyRepositoryOwnershipGuard, corePoolStageLockedCallback),
		"a guarded write that finished was published as one that could not")

	// Finite, written labels only: no identifier, no error prose, no SQL.
	for duty, stages := range recorder.publishedLabels() {
		require.Contains(t, []string{
			string(corePoolDutyGitHubAppReconcile),
			string(corePoolDutyWorkspaceProvisionBacklog),
			string(corePoolDutyWorkspaceProvisionClaim),
			string(corePoolDutyRepositoryOwnershipGuard),
		}, duty, "an unwritten duty label reached the metric")
		for _, stage := range stages {
			require.Regexp(t, `^[a-z_]+$`, stage, "an unwritten stage label reached the metric")
		}
	}
	// The gate this pass was admitted through is the one the pool's own size
	// sizes. (The PUBLISHED budget series is asserted where the worker's
	// reconciler actually starts: see
	// TestClaimMetricsNameTheStallDBGaugesCannotExplain. These passes drive
	// ReconcileWorkspaceProvisioning directly so that every transition here
	// is one this test makes, not one a ticker makes.)
	require.Equal(t, workspaceProvisionClaimBudget(shippedWorkerCorePoolMaxConns), svc.provisionTasks.limit,
		"the gate must be the one the shipped pool's size sizes")
	require.Zero(t, svc.provisionTasks.reservedConnections(),
		"a finished claim kept its core-pool reservation, so the next tick is refused forever")
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim), "the claim's held gauge leaked")
}

// realRepository seeds one owner and one repository through the shipped
// queries, so the ownership fence guards a real row rather than a struct.
func realRepository(t *testing.T, pool *pgxpool.Pool, slug string) db.Repository {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)
	owner, err := q.CreateUser(ctx, db.CreateUserParams{
		Username: slug + "-owner", LowerUsername: slug + "-owner", DisplayName: "Owner"})
	require.NoError(t, err)
	repository, err := q.CreateRepo(ctx, db.CreateRepoParams{
		UserID: pgtype.Int8{Int64: owner.ID, Valid: true},
		Name:   slug, LowerName: slug, DefaultBookmark: "main"})
	require.NoError(t, err)
	return repository
}

// nestedPoolHold drives one recorded duty's own shape: it holds the
// connection its transaction took AND a SECOND connection its callback
// acquires from the SAME pool, and it gives each of them back only when the
// test says so.
//
// That second acquire is the hazard the whole change is about, and it is the
// real one: the installation reconcile's upserts and the guarded write's row
// write both go through the same pool their caller is already holding a
// connection from. Making it a channel rather than a timeout is what lets a
// test prove progress WITHOUT a deadline being the mechanism.
type nestedPoolHold struct {
	holding  chan struct{}
	freeConn chan struct{}
	done     chan struct{}
	returned chan error
	freeOnce sync.Once
	doneOnce sync.Once
}

func newNestedPoolHold(t *testing.T) *nestedPoolHold {
	t.Helper()
	hold := &nestedPoolHold{
		holding:  make(chan struct{}),
		freeConn: make(chan struct{}),
		done:     make(chan struct{}),
		returned: make(chan error, 1),
	}
	// Registered before the duty starts: a callback parked on these channels
	// is holding core-pool connections, so nothing may return without
	// releasing them.
	t.Cleanup(func() {
		hold.freeSecondConnection()
		hold.finish()
	})
	return hold
}

// holdSecondConnection is the duty's callback body: acquire a second
// connection from the pool the caller is already holding one from, do real
// work on it, then hold both until released. It returns errors rather than
// asserting, because it does not run on the test's goroutine.
func (h *nestedPoolHold) holdSecondConnection(ctx context.Context, pool *pgxpool.Pool,
	work func(context.Context, *pgxpool.Conn) error) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	if err := work(ctx, conn); err != nil {
		conn.Release()
		return err
	}
	close(h.holding)
	<-h.freeConn
	conn.Release()
	<-h.done
	return nil
}

// freeSecondConnection gives the nested connection back while the duty keeps
// its transaction, its own connection and its advisory lock.
func (h *nestedPoolHold) freeSecondConnection() {
	h.freeOnce.Do(func() { close(h.freeConn) })
}

func (h *nestedPoolHold) finish() { h.doneOnce.Do(func() { close(h.done) }) }

// A row that MOVED between the backlog listing and the claim belongs to
// whatever wrote it. The bounds above must not have loosened that: a stop is
// refused on the real store's own row, and the real fenced write refuses too.
func TestForeignTransitionIsNeverStoppedAtTheShippedCorePool(t *testing.T) {
	pool, _ := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-foreign")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, pool, runtime, recorder)

	// Another writer advances the row after the listing this attempt holds.
	_, err := pool.Exec(context.Background(),
		`UPDATE workspaces SET provisioning_generation = provisioning_generation + 1, updated_at = now() WHERE id = $1`,
		listed.ID)
	require.NoError(t, err)

	outcome, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
	require.NoError(t, err, "a row that moved is not an error; it is not this attempt's row")
	require.Equal(t, interruptedReleaseStageClaim, outcome.stage)
	require.Equal(t, workspaceapi.WorkspaceRunning, guest.state, "a foreign transition's guest was stopped")
	require.Zero(t, runtime.stops.Load())

	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, after.FailureMessage.String,
		"this attempt overwrote another writer's row")
	require.Equal(t, listed.ProvisioningGeneration+1, after.ProvisioningGeneration)

	// A stop that a foreign transition refused writes nothing, so the stall
	// series must not rise either: an operator reading it has to be able to
	// trust that a count means the pool.
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom))
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageAcquireConnection))
}

// The loop's own acquires are bounded BEFORE any claim exists, and that is the
// part a claim-only bound could not repair: when every core-pool connection is
// held by other duty the tick used to park in its listing read, with nothing
// held, nothing to release and no fence ahead of it to record a reason.
func TestProvisioningBacklogListingRefusesFinitelyOnAFullCorePool(t *testing.T) {
	pool, observer := shippedCorePool(t)
	realRetainedGuestStopRow(t, pool, "corepool-listing")
	parkSessionAdvisoryPair(t, pool, observer, "flow-host-binding:corepool-listing")
	for range shippedWorkerCorePoolMaxConns - 2 {
		stray, err := pool.Acquire(context.Background())
		require.NoError(t, err)
		t.Cleanup(stray.Release)
	}
	require.Equal(t, int32(shippedWorkerCorePoolMaxConns), pool.Stat().AcquiredConns(),
		"the pool must have nothing left for the loop's own listing read")

	recorder := newCorePoolDutyRecorder()
	runtime := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}}
	svc := realStoreReconciler(t, pool, runtime, recorder)

	// No caller deadline, production-exact.
	done := make(chan error, 1)
	started := time.Now()
	go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
	select {
	case err := <-done:
		require.Error(t, err, "a listing the pool cannot serve must refuse, not park")
		require.Less(t, time.Since(started), workspaceProvisionAcquireTimeout+15*time.Second,
			"the listing is not bounded by the loop's own written budget")
		// The tick-level log names the step, which is what fifteen silent
		// minutes could not. It does NOT claim the pool: a bounded query
		// deadline cannot tell an acquire that never completed from a query
		// that acquired and then waited, and reading the pool's Stat after
		// the fact would make that coincidence look like evidence. The duty
		// and stage series below are where a full pool is visible.
		require.Equal(t, interruptedReleaseReasonDeadline, interruptedReleaseStopReasonFor(err))
		stage, named := workspaceProvisionClaimStage(err)
		require.True(t, named)
		require.Equal(t, interruptedReleaseStageListBacklog, stage,
			"the refusal must name the loop's own listing read, not an acquire it cannot prove")
	case <-time.After(4 * workspaceProvisionAcquireTimeout):
		t.Fatal("the reconcile pass never returned: its listing acquire is unbounded")
	}

	require.Equal(t, 1, recorder.stallCount(corePoolDutyWorkspaceProvisionBacklog, corePoolStageListBacklog),
		"the stall must name the loop's own listing, not a claim it never reached")
	require.Zero(t, runtime.stops.Load(), "nothing was decided about a guest")
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim))

	// Nothing a store, an adapter or a customer supplied reaches the record.
	outcome, _ := interruptedReleaseStopOutcome{stage: interruptedReleaseStageClaim}.failed(
		workspaceProvisionClaimStall{stage: interruptedReleaseStageAcquireConnection,
			cause: errors.New("postgres://smithers:hunter2@db.internal:5432/product")})
	for _, arg := range outcome.logArgs(strings.TrimSpace("ws-corepool-listing")) {
		rendered, ok := arg.(string)
		require.True(t, ok, "every published field is a written string")
		require.NotContains(t, rendered, "hunter2")
		require.NotContains(t, rendered, "db.internal")
		require.NotContains(t, rendered, "ws-corepool-listing")
	}
}

// drainCorePool takes every connection the pool has left and returns the
// release. It is how exhaustion is forced AT an exact stage rather than waited
// for: the production stall happened because other duties filled the pool
// between one step of a claim and the next, and a regression that can only
// exhaust the pool before a claim starts cannot reach the steps that park
// while HOLDING.
func drainCorePool(t *testing.T, pool *pgxpool.Pool) func() {
	t.Helper()
	var taken []*pgxpool.Conn
	for pool.Stat().AcquiredConns() < pool.Stat().MaxConns() {
		ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
		conn, err := pool.Acquire(ctx)
		cancel()
		require.NoError(t, err, "the pool could not be drained, so this test proves nothing")
		taken = append(taken, conn)
	}
	var once sync.Once
	release := func() {
		once.Do(func() {
			for _, conn := range taken {
				conn.Release()
			}
		})
	}
	t.Cleanup(release)
	return release
}

// starvedProductStore is the REAL product store — the shipped *db.Queries,
// the shipped SQL, real rows — with ONE timing seam: it can drain the core
// pool in the instant before a chosen step issues its query. The step itself
// is not stubbed, intercepted or answered from memory; it runs against real
// PostgreSQL and parks in the pool exactly as production did.
type starvedProductStore struct {
	*db.Queries
	t    *testing.T
	pool *pgxpool.Pool

	mu sync.Mutex
	// starveRead is which GetWorkspace call to starve, counted from one. The
	// claim's own fenced re-read is the first; the one INSIDE the callback,
	// which is the acquire that used to park forever while holding the
	// transaction and the advisory lock, is the second.
	starveRead int
	reads      int
	// starveWrite starves the fenced receipt write, which runs AFTER the
	// guest is already physically stopped.
	starveWrite bool
	released    func()
}

func (s *starvedProductStore) GetWorkspace(ctx context.Context, id string) (db.Workspace, error) {
	s.mu.Lock()
	s.reads++
	if s.starveRead == s.reads {
		s.released = drainCorePool(s.t, s.pool)
	}
	s.mu.Unlock()
	return s.Queries.GetWorkspace(ctx, id)
}

func (s *starvedProductStore) FailWorkspaceIfUnchanged(ctx context.Context, arg db.FailWorkspaceIfUnchangedParams) (db.Workspace, error) {
	s.mu.Lock()
	if s.starveWrite {
		s.starveWrite = false
		s.released = drainCorePool(s.t, s.pool)
	}
	s.mu.Unlock()
	return s.Queries.FailWorkspaceIfUnchanged(ctx, arg)
}

// release gives the drained connections back, so the next attempt runs against
// a pool that has recovered — which is what a production tick does once the
// duty that filled the pool lets go.
func (s *starvedProductStore) release() {
	s.mu.Lock()
	release := s.released
	s.released = nil
	s.mu.Unlock()
	if release != nil {
		release()
	}
}

func starvedProductReconciler(t *testing.T, pool *pgxpool.Pool, runtime workspaceapi.WorkspaceRuntime,
	recorder *corePoolDutyRecorder, store *starvedProductStore) *WorkspaceService {
	t.Helper()
	return newWorkspaceServiceForTests(store,
		WithWorkspaceRuntime(runtime),
		WithWorkspaceTransactions(pool),
		WithWorkspaceSandboxMetrics(recorder))
}

// EXHAUSTION AFTER THE INITIAL FENCED READ, which is the gap a bound on the
// claim's entry could not close.
//
// The claim is admitted against measured headroom, begins its transaction,
// takes the advisory lock and reads the row it will fence on. Only THEN does
// the pool fill — in production, because other duties took the rest of it
// between those two steps. The next read the claim makes is its own, made
// while the transaction, the connection and the advisory lock are all still
// held.
//
// OLD: that read carried the reconciler's process-lifetime context, so it
// waited forever. The claim never returned, never released its lock, and the
// loop never ran another tick: there is no refusal to find in a log because no
// fence was ever reached.
//
// NEW: the read is bounded on the claim's own written budget, the refusal says
// which acquire failed, everything the claim held is released, and the row is
// untouched for the next tick — which, once the pool recovers, records the
// real fenced receipt.
func TestRetainedGuestStopReleasesItsClaimWhenTheCallbackReadStarves(t *testing.T) {
	pool, _ := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-callback-read")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	store := &starvedProductStore{Queries: db.New(pool), t: t, pool: pool, starveRead: 2}
	svc := starvedProductReconciler(t, pool, runtime, recorder, store)

	// NO caller deadline: production's tick has none, so the bound has to be
	// the source's own.
	done := make(chan error, 1)
	started := time.Now()
	go func() {
		_, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
		done <- err
	}()
	var err error
	select {
	case err = <-done:
	case <-time.After(4 * workspaceProvisionAcquireTimeout):
		t.Fatal("the claim never returned: its read inside the hold is unbounded, and it is holding the advisory lock")
	}
	require.Error(t, err, "a read the pool cannot serve must refuse, not park")
	require.Less(t, time.Since(started), workspaceProvisionAcquireTimeout+15*time.Second)
	require.Equal(t, interruptedReleaseReasonDeadline, interruptedReleaseStopReasonFor(err),
		"a whole-query deadline was published as a measured pool refusal")
	stalledStage, named := workspaceProvisionClaimStage(err)
	require.True(t, named)
	require.Equal(t, interruptedReleaseStageClaimRowRead, stalledStage,
		"the refusal must name the read INSIDE the hold, not the entry acquire that succeeded")
	require.Equal(t, 1, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageClaimRowRead),
		"the refusal must name the read INSIDE the hold, not the entry acquire that succeeded")
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim),
		"the claim is still counted as holding a core-pool connection")

	// Nothing was decided: no stop, no receipt, and the row is still the one
	// the next tick will list.
	require.Equal(t, workspaceapi.WorkspaceRunning, guest.state)
	require.Zero(t, runtime.stops.Load())
	stalled, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, stalled.FailureMessage.String)
	require.Equal(t, listed.UpdatedAt, stalled.UpdatedAt, "a refused claim wrote to the row")

	// The advisory lock went back too, so the next tick can claim the row. If
	// the claim had parked holding it, this second attempt would be refused
	// as in-progress forever.
	store.release()
	outcome, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
	require.NoError(t, err, "the row is still claimable once the pool recovers")
	require.Equal(t, interruptedReleaseStageRecord, outcome.stage)
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state, "the retained guest never stopped, so its compute never came back")
	require.Equal(t, int32(1), runtime.stops.Load())
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no fenced receipt records the confirmed stop")
	require.Equal(t, "failed", after.Status)
	require.Equal(t, listed.VmID, after.VmID, "the placement moved")
	require.Equal(t, listed.ProvisioningGeneration, after.ProvisioningGeneration)
	require.Equal(t, "", after.ProvisioningStage)
	require.False(t, after.DeletedAt.Valid)
}

// EXHAUSTION AT THE RECEIPT WRITE, which is the worst stage to park in.
//
// By this point the physical stop has ALREADY happened and been confirmed: the
// guest is down and its compute is back. The only thing left is the fenced
// write that records it. Unbounded, that write parked while the claim held its
// transaction and its advisory lock, so the process had a stopped guest, no
// record of it, and a claim that could never be re-driven.
//
// Bounded, the write refuses, the claim releases everything, the row stays in
// the cohort with its original sentence, and the next tick re-confirms the
// stop and records the real receipt. A stop is never decided twice from a
// guess: the receipt is written only after a confirming read.
func TestRetainedGuestStopRecordsItsReceiptAfterTheWriteStarves(t *testing.T) {
	pool, _ := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-receipt-write")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy",
		history: []string{"change-a"}, snapshots: 1}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	store := &starvedProductStore{Queries: db.New(pool), t: t, pool: pool, starveWrite: true}
	svc := starvedProductReconciler(t, pool, runtime, recorder, store)

	done := make(chan error, 1)
	go func() {
		_, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
		done <- err
	}()
	var err error
	select {
	case err = <-done:
	case <-time.After(4 * workspaceProvisionAcquireTimeout):
		t.Fatal("the receipt write never returned: a stopped guest has no record and the claim still holds its lock")
	}
	require.Error(t, err)
	require.Equal(t, interruptedReleaseReasonDeadline, interruptedReleaseStopReasonFor(err),
		"a whole-query deadline was published as a measured pool refusal")
	stage, named := workspaceProvisionClaimStage(err)
	require.True(t, named, "the refusal must carry which step failed")
	require.Equal(t, interruptedReleaseStageClaimReceiptWrite, stage,
		"the refusal must name the receipt write, not an acquire it never made")
	require.Equal(t, 1, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageClaimReceiptWrite),
		"the stall must name the receipt write, which is the stage that already stopped a guest")
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim))

	// The physical effect landed and the record did not. That is the state the
	// cohort exists to re-drive, so the row must still carry its original
	// sentence and still be listed.
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state, "the stop this receipt was for never happened")
	require.Equal(t, int32(1), runtime.stops.Load())
	unrecorded, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, unrecorded.FailureMessage.String,
		"a refused write recorded a receipt anyway")
	backlog, err := db.New(pool).ListWorkspaceProvisioningRecovery(context.Background())
	require.NoError(t, err)
	require.Len(t, backlog, 1, "a stop with no receipt left the backlog, so nothing will re-confirm it")

	// The next tick, against a recovered pool, records it.
	store.release()
	outcome, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
	require.NoError(t, err)
	require.Equal(t, interruptedReleaseStageRecord, outcome.stage)
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String)
	require.Equal(t, "failed", after.Status)
	require.Equal(t, listed.VmID, after.VmID)
	require.Equal(t, "retained-working-copy", guest.disk, "the retained disk was taken")
	require.Equal(t, []string{"change-a"}, guest.history)
	require.Zero(t, runtime.deletes.Load(), "recovery stopped the guest; it never deleted one")
	remaining, err := db.New(pool).ListWorkspaceProvisioningRecovery(context.Background())
	require.NoError(t, err)
	require.Empty(t, remaining, "a confirmed stop is still listed, so the reconciler will re-drive it forever")
}

// A BOUND THAT REFUSED IS NOT A POOL THAT RAN OUT, and the record must not
// say it was.
//
// Every refusal in this claim path used to be wrapped as
// workspaceProvisionClaimStall{stage: acquire_connection} and classified as
// core_pool_exhausted, whatever had actually refused. That is a false causal
// diagnostic twice over: the advisory lock statement runs on the connection
// the claim's transaction already holds and asks the pool for nothing at all,
// and a step that does ask the pool can acquire at once and then wait on SQL,
// a row lock or the network. An operator reading core_pool_exhausted goes to
// the connection gauges, and for a contended row there is nothing there.
//
// So here the pool has REAL headroom — nothing is drained, nothing is parked —
// and the real fenced receipt write is blocked on the real row lock a
// concurrent writer holds, taken from outside the pool. The write is the
// shipped FailWorkspaceIfUnchanged against the real row, and it acquires a
// connection immediately. What it cannot do is finish, until its own written
// bound ends it.
//
// The claim must still release everything, the record must still name the
// actual step, and the reason must be the ordinary deadline. core_pool_exhausted
// and acquire_connection must not appear anywhere, and the pool's own stall
// series must stay at zero.
func TestClaimDeadlineWithPoolHeadroomIsNeverReportedAsPoolExhaustion(t *testing.T) {
	pool, observer := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-rowlock")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy",
		history: []string{"change-a"}, snapshots: 1}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, pool, runtime, recorder)

	// The pool is NOT the constraint when the claim starts, and that is the
	// whole point: the write gets its connection at once and then waits here.
	releaseRow := observer.holdWorkspaceRowLock(t, listed.ID)
	headroom, measured := corePoolHeadroom(pool)
	require.True(t, measured, "the real pool must report its own capacity")
	require.GreaterOrEqual(t, headroom, workspaceProvisionConnectionsPerClaim,
		"this case proves nothing unless the pool could serve a whole claim")

	// NO caller deadline: production's tick has none, so the bound has to be
	// the source's own.
	done := make(chan error, 1)
	started := time.Now()
	go func() {
		_, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
		done <- err
	}()

	// The real UPDATE is executing and blocked on the real row lock, proved
	// through the catalog from outside the pool.
	require.Eventually(t, func() bool { return observer.rowLockWaiters(t) > 0 },
		2*workspaceProvisionAcquireTimeout, 20*time.Millisecond,
		"the fenced receipt write never reached its row-lock wait, so this case is not about a blocked query")

	// ... and NOW other duty fills the rest of the pool, so that at the moment
	// the bound refuses, the pool's own Stat reads full. THIS is why a
	// post-deadline snapshot cannot label a cause: the pool is full and the
	// pool is not why this write waited. The old classification would have
	// published core_pool_exhausted and sent an operator to the connection
	// gauges for a contended row.
	releaseDrain := drainCorePool(t, pool)
	require.Equal(t, pool.Stat().MaxConns(), pool.Stat().AcquiredConns(),
		"the pool must read full at the refusal, or this case does not state the trap")

	var err error
	select {
	case err = <-done:
	case <-time.After(4 * workspaceProvisionAcquireTimeout):
		t.Fatal("the receipt write never returned: a blocked row lock parked the claim with its own lock held")
	}
	require.Error(t, err, "a write that cannot finish inside its bound must refuse, not park")
	require.Less(t, time.Since(started), workspaceProvisionAcquireTimeout+15*time.Second,
		"the write is not bounded by the claim's own written budget")

	// THE CORRECTION: the actual step, and an ordinary deadline.
	stage, named := workspaceProvisionClaimStage(err)
	require.True(t, named, "the refusal must carry which step failed")
	require.Equal(t, interruptedReleaseStageClaimReceiptWrite, stage,
		"a blocked row lock was reported as a connection acquire")
	require.NotEqual(t, interruptedReleaseStageAcquireConnection, stage)
	require.Equal(t, interruptedReleaseReasonDeadline, interruptedReleaseStopReasonFor(err),
		"a pool with headroom left was published as an exhausted pool")
	require.NotEqual(t, interruptedReleaseReasonPoolExhausted, interruptedReleaseStopReasonFor(err))

	// The series an operator alerts on says the same thing: the step, not the
	// pool.
	require.Equal(t, 1, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageClaimReceiptWrite),
		"the stall must name the receipt write")
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
		"a pool with headroom refused a claim for want of headroom")
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageAcquireConnection),
		"a blocked row lock rose on the pool's own acquire series")
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim),
		"the claim is still counted as holding a core-pool connection")

	// Everything the claim held went back, including its advisory lock, and
	// the physical effect that already landed is still unrecorded — which is
	// the state the next tick re-confirms.
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state, "the stop this receipt was for never happened")
	require.Equal(t, int32(1), runtime.stops.Load())
	unrecorded, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, unrecorded.FailureMessage.String,
		"a refused write recorded a receipt anyway")
	backlog, err := db.New(pool).ListWorkspaceProvisioningRecovery(context.Background())
	require.NoError(t, err)
	require.Len(t, backlog, 1, "a stop with no receipt left the backlog, so nothing will re-confirm it")

	// And once the pool recovers and the concurrent writer lets go, the next
	// attempt records the real fenced receipt against the real row.
	releaseDrain()
	releaseRow()
	outcome, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
	require.NoError(t, err, "the row is still claimable once the concurrent writer lets go")
	require.Equal(t, interruptedReleaseStageRecord, outcome.stage)
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no fenced receipt records the confirmed stop")
	require.Equal(t, "failed", after.Status)
	require.Equal(t, listed.VmID, after.VmID, "the placement moved")
	require.Equal(t, listed.ProvisioningGeneration, after.ProvisioningGeneration)
	require.Equal(t, "", after.ProvisioningStage)
	require.False(t, after.DeletedAt.Valid)
	require.Equal(t, "retained-working-copy", guest.disk, "the retained disk was taken")
	require.Equal(t, []string{"change-a"}, guest.history)
	require.Zero(t, runtime.deletes.Load(), "recovery stopped the guest; it never deleted one")
}

// THE SECOND ACTUALLY OBSERVED HELD PATH, ended.
//
// The closed read-only wait aggregate's other long hold was a GetRepoByID
// transaction holding the repository_ownership namespace in ShareLock mode:
// that transaction is RepoOwnershipFence.WithRepoOwnershipShared's own
// re-validating read, and the only reason a connection sits idle in that
// transaction is that the guarded write it called has not come back.
//
// The reachable caller that runs on a worker's process-lifetime context is
// compose's StartSyncWebhookReconciler(workerCtx, 10m) ->
// EnsureSyncWebhooks -> EnsureSystemWebhook -> guardedRepoWrite, whose write
// is an ordinary row write on the SAME pool. So the guarded write is a second
// acquire made while a core-pool connection and the repository's ownership
// lock are both held, and before this change nothing could end it.
//
// This test is the fence itself, against the real pool and the real catalog: a
// guarded write whose own acquire cannot be served must refuse on the written
// hold budget and give BOTH the connection and the ownership lock back. The
// fence's purpose is untouched — the write still ran with ownership held
// shared, after the snapshot was re-validated.
func TestRepoOwnershipGuardReleasesItsShareLockWhenTheGuardedWriteStarves(t *testing.T) {
	pool, observer := shippedCorePool(t)
	ctx := context.Background()
	q := db.New(pool)
	owner, err := q.CreateUser(ctx, db.CreateUserParams{
		Username: "ownership-hold-owner", LowerUsername: "ownership-hold-owner", DisplayName: "Owner"})
	require.NoError(t, err)
	repository, err := q.CreateRepo(ctx, db.CreateRepoParams{
		UserID: pgtype.Int8{Int64: owner.ID, Valid: true},
		Name:   "ownership-hold", LowerName: "ownership-hold", DefaultBookmark: "main"})
	require.NoError(t, err)

	recorder := newCorePoolDutyRecorder()
	const hold = 3 * time.Second
	fence := NewRepoOwnershipFence(pool,
		WithRepoOwnershipCorePoolObserver(recorder),
		withRepoOwnershipHoldBudget(hold))

	// The guarded write's own database work, with the pool filled underneath
	// it exactly as other duties fill it in production. NO caller deadline:
	// the background sweep that reaches this fence has none.
	fenced := make(chan bool, 1)
	writeErr := make(chan error, 1)
	done := make(chan error, 1)
	started := time.Now()
	go func() {
		done <- fence.WithRepoOwnershipShared(ctx, repository, func(held context.Context) error {
			fenced <- observer.repoOwnershipShareLockHeld(t, repository.ID)
			drainCorePool(t, pool)
			_, err := db.New(pool).GetRepoByID(held, repository.ID)
			writeErr <- err
			return err
		})
	}()

	require.True(t, <-fenced, "the guarded write ran without the repository's ownership lock held shared")
	select {
	case err := <-done:
		require.Error(t, err, "a guarded write whose pool has nothing left must refuse, not park")
		require.ErrorIs(t, <-writeErr, context.DeadlineExceeded,
			"the write's own acquire must end on the written hold budget")
		require.Less(t, time.Since(started), hold+15*time.Second, "the hold outlived its written budget")
	case <-time.After(hold + 30*time.Second):
		t.Fatal("the guarded write never returned: it is holding a core-pool connection and the ownership lock")
	}

	// The two things production could not get back, proved through the real
	// catalog and the real pool rather than inferred from the call returning.
	require.Eventually(t, func() bool { return !observer.repoOwnershipShareLockHeld(t, repository.ID) },
		10*time.Second, 50*time.Millisecond, "the ownership lock is still granted after its hold ended")
	require.Eventually(t, func() bool { return pool.Stat().AcquiredConns() <= shippedWorkerCorePoolMaxConns-1 },
		10*time.Second, 50*time.Millisecond, "the guard transaction's connection never went back to the pool")
	require.Zero(t, recorder.heldNow(corePoolDutyRepositoryOwnershipGuard), "the held gauge leaked")
	require.Equal(t, float64(1), recorder.peakHeld(corePoolDutyRepositoryOwnershipGuard),
		"one guarded write holds exactly one core-pool connection")
	require.Equal(t, 1, recorder.stallCount(corePoolDutyRepositoryOwnershipGuard, corePoolStageLockedCallback),
		"the refusal must name the duty holding the ownership lock, or a full pool names nobody again")
}

// The fence still fences. A bound on the hold must not have turned the
// ownership guard into a write that runs without it, or into one that stops
// re-validating the snapshot it was authorized against.
func TestRepoOwnershipGuardStillFencesAndStillRevalidates(t *testing.T) {
	pool, observer := shippedCorePool(t)
	ctx := context.Background()
	q := db.New(pool)
	owner, err := q.CreateUser(ctx, db.CreateUserParams{
		Username: "ownership-fence-owner", LowerUsername: "ownership-fence-owner", DisplayName: "Owner"})
	require.NoError(t, err)
	repository, err := q.CreateRepo(ctx, db.CreateRepoParams{
		UserID: pgtype.Int8{Int64: owner.ID, Valid: true},
		Name:   "ownership-fence", LowerName: "ownership-fence", DefaultBookmark: "main"})
	require.NoError(t, err)

	recorder := newCorePoolDutyRecorder()
	fence := NewRepoOwnershipFence(pool, WithRepoOwnershipCorePoolObserver(recorder))

	ran := false
	require.NoError(t, fence.WithRepoOwnershipShared(ctx, repository, func(held context.Context) error {
		ran = true
		require.True(t, observer.repoOwnershipShareLockHeld(t, repository.ID),
			"the guarded write ran without the ownership lock")
		require.NoError(t, held.Err(), "the guarded write received an already-cancelled context")
		return nil
	}))
	require.True(t, ran, "the guarded write never ran")
	require.Eventually(t, func() bool { return !observer.repoOwnershipShareLockHeld(t, repository.ID) },
		10*time.Second, 50*time.Millisecond, "a finished guarded write kept the ownership lock")
	require.Zero(t, recorder.stallCount(corePoolDutyRepositoryOwnershipGuard, corePoolStageLockedCallback),
		"a guarded write that finished was published as one that could not")

	// A snapshot whose ownership moved is still refused, and the refusal still
	// happens before the write.
	moved := repository
	moved.UserID = pgtype.Int8{Int64: owner.ID + 1, Valid: true}
	err = fence.WithRepoOwnershipShared(ctx, moved, func(context.Context) error {
		t.Error("a write authorized against a stale owner ran anyway")
		return nil
	})
	require.Error(t, err, "a concurrent ownership change must refuse the write")
	require.Zero(t, recorder.heldNow(corePoolDutyRepositoryOwnershipGuard))
}

// A HEALTHY LONG WALK IS NOT A STALL, and the two must not look alike.
//
// The installation reconcile may legitimately hold its election connection for
// minutes: it walks every installation over the network. Root's question is
// whether a ten-minute bound alone leaves a user's three-minute turn waiting,
// and the answer in source is that the bound is not what keeps other duties
// moving. A healthy walk holds ONE connection of the pool. What used to absorb
// the rest was every other duty's own unbounded acquire parking behind it.
//
// So with a long walk in progress and real headroom left, the provisioning
// reconciler must complete a real retained-guest stop and write its real
// fenced receipt — while the election lock stays held, because the walk is
// still walking. That is the difference between a long HTTP walk and a nested
// acquire with no headroom, stated as a test rather than as a comment.
func TestRetainedGuestStopProgressesWhileAHealthyWalkHoldsOneConnection(t *testing.T) {
	pool, observer := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-healthy-walk")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, pool, runtime, recorder)

	// A walk that is working, not parked: it holds the election connection and
	// its advisory lock for the whole test, and asks the pool for nothing
	// while it does. Its budget is far longer than this test, so nothing here
	// depends on the hold ending.
	locker := NewPgGitHubAppReconcileLocker(pool,
		WithGitHubAppReconcileCorePoolObserver(recorder),
		withGitHubAppReconcileHoldBudget(time.Hour))
	walking, finishWalk := make(chan struct{}), make(chan struct{})
	walked := make(chan error, 1)
	go func() {
		_, err := locker.TryWithLock(context.Background(), func(context.Context) error {
			close(walking)
			<-finishWalk
			return nil
		})
		walked <- err
	}()
	<-walking
	require.True(t, observer.electionLockHeld(t), "the walk is not holding the election lock it won")
	require.Equal(t, float64(1), recorder.heldNow(corePoolDutyGitHubAppReconcile),
		"a healthy walk must be attributed as exactly one held core-pool connection")

	// NO caller deadline: production's tick has none.
	done := make(chan error, 1)
	go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
	select {
	case err := <-done:
		require.NoError(t, err, "a long walk with headroom left is not a tick-level failure")
	case <-time.After(4 * workspaceProvisionAcquireTimeout):
		t.Fatal("the reconcile pass never returned while a healthy walk held one connection")
	}

	// Real progress, with the walk still holding its connection and its lock.
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state,
		"the retained guest never stopped, so a healthy walk still blocks recovery")
	require.Equal(t, int32(1), runtime.stops.Load())
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no fenced receipt records the confirmed stop")
	require.Equal(t, "failed", after.Status)
	require.Equal(t, listed.VmID, after.VmID)
	require.True(t, observer.electionLockHeld(t), "the walk's own lock was released by someone else's bound")
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
		"a pool with real headroom refused a claim anyway")
	require.Zero(t, recorder.stallCount(corePoolDutyGitHubAppReconcile, corePoolStageLockedWork),
		"a walk that is working was published as one that could not finish")

	close(finishWalk)
	require.NoError(t, <-walked)
	require.Eventually(t, func() bool { return !observer.electionLockHeld(t) }, 10*time.Second, 50*time.Millisecond,
		"the finished walk kept its election lock")
	require.Zero(t, recorder.heldNow(corePoolDutyGitHubAppReconcile), "the held gauge leaked")
}
