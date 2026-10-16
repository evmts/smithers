package services

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A GENERAL NESTED-ACQUIRE HAZARD in the provisioning claim path, reproduced
// at the shipped core-pool size — and NOT a reproduction of the operation that
// was measured holding the serving worker's pool.
//
// Both statements matter, so both are written down.
//
// What this file proves. withWorkspaceProvisionLock needs TWO core-pool
// connections at once and holds the first while it waits for the second: it
// begins a transaction (connection one), takes pg_try_advisory_xact_lock on
// it, and then every read and fenced write inside the callback goes through
// s.q, which compose hands the SAME pool. Held under an unbounded acquire that
// is an absorbing state rather than a slow one, because pgxpool.Acquire waits
// until its context is done and a reconciler tick's context is the process's.
// These cases hold that against real PostgreSQL at MaxConns = 4, with the real
// advisory locks and real concurrent duty, and assert that the claim refuses
// finitely, names the acquire, releases its transaction and its advisory lock,
// and stays retryable.
//
// What this file does NOT prove, and must not be read as proving. The closed
// read-only wait aggregate taken while the serving worker was stopped names
// the long-held operations, and NONE of them is this one: there is no
// TryLockWorkspaceProvisioning row in it at all. Its four interesting
// connections are a SERVER-WIDE census — every process on that server — so
// they cannot be mapped onto one worker's pool, and an observed lock is not
// evidence of which goroutine owns it. The operation the aggregate did name,
// with its own literal, is the installation reconcile's election lock at 5043
// seconds; that one is bounded in source and regressed against the real
// product store in core_pool_duty_progress_pg_test.go, which is where the
// production claim lives.
//
// The store below is likewise a probe and not the product store: its
// GetWorkspace makes a real, contending core-pool acquire and then answers
// from memory, which states the ACQUIRE exactly and states nothing about the
// row. The real rows, the real shipped SQL and the real fenced receipt are in
// core_pool_duty_progress_pg_test.go.

// shippedWorkerCorePoolMaxConns is the serving worker's measured core pool:
// smithers_db_connections_max read 4 on both worker replicas at 20:21:52Z and
// again at 20:24:19Z. The private connection-budget change that produced it is
// Root-owned and read-only here; this is the number the source must be correct
// at, not a number this test is free to raise.
const shippedWorkerCorePoolMaxConns = 4

// shippedWorkerLongLivedPooledConnections is how many core-pool connections
// this probe parks on session-level advisory locks, in the shape flowhost's
// binding lease and the journal session locks are written in: one holder and
// one caller blocked behind it, each holding a pooled connection across a wait
// nothing in this package can shorten.
//
// It is what the probe DOES, not a number the source reserves. The source
// subtracts no guess at what other duties hold; it measures the pool instead.
// See workspaceProvisionClaimBudget and admitProvisionClaim.
const shippedWorkerLongLivedPooledConnections = 2

// budgetProgressBound is how long a reconcile pass gets to move a backlog that
// is entirely ready to move. The production loop re-drives every 5s, so a pass
// that cannot finish in several multiples of that has not slowed down, it has
// stopped.
const budgetProgressBound = 20 * time.Second

// budgetTestPool opens a pool at the composition under test's real capacity on
// the shared product database, so acquires contend exactly as the worker's do.
func budgetTestPool(t *testing.T, maxConns int32) *pgxpool.Pool {
	t.Helper()
	url := servicesSuite.URL(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := postgresfixture.Open(ctx, url, maxConns)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))
	require.Equal(t, maxConns, pool.Stat().MaxConns())
	return pool
}

// parkLongLivedSessionLocks reproduces the SHAPE flowhost's binding lease and
// PostgresJournals.lockJournal give the core pool, with their real SQL: one
// caller holds a pooled connection for the life of a session-level
// pg_advisory_lock, and a second caller holds ANOTHER pooled connection while
// it blocks in pg_advisory_lock on the same key. Both are ordinary background
// duty on this pool, and the second one's wait is the unbounded one. Which
// process owned the session locks the production aggregate recorded is not
// established by this or by them.
func parkLongLivedSessionLocks(t *testing.T, pool *pgxpool.Pool, key string) {
	t.Helper()
	ctx := context.Background()
	holder, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = holder.Exec(ctx, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, key)
	require.NoError(t, err)

	waiter, err := pool.Acquire(ctx)
	require.NoError(t, err)
	blocked := make(chan struct{})
	waiting, cancelWaiting := context.WithCancel(ctx)
	go func() {
		defer close(blocked)
		_, _ = waiter.Exec(waiting, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, key)
	}()
	// The waiter must actually be inside the lock wait before the test reads
	// the pool as absorbed, or this would race the measurement.
	require.Eventually(t, func() bool {
		var waits int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity
			WHERE wait_event_type = 'Lock' AND state = 'active' AND pid <> pg_backend_pid()`).Scan(&waits); err != nil {
			return false
		}
		return waits > 0
	}, 10*time.Second, 20*time.Millisecond, "the second session-lock caller never reached its unbounded wait")

	t.Cleanup(func() {
		cancelWaiting()
		<-blocked
		_, _ = holder.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtextextended($1, 0))`, key)
		waiter.Release()
		holder.Release()
	})
	require.Equal(t, int32(shippedWorkerLongLivedPooledConnections), pool.Stat().AcquiredConns(),
		"the parked session-lock pair must hold exactly two pooled connections")
}

// nestedAcquireBarrier lines the claims up where the production census caught
// them: each one holding its provisioning transaction's core-pool connection
// and about to acquire a SECOND one for the read nested inside it. It opens
// when parties callers are there together, or after grace when fewer ever
// arrive — so the same test states the defect without also assuming it. Under
// a budget that admits two, two arrive and the pool has nothing left for
// either; under one that admits one, the grace elapses and the single claim
// acquires normally.
type nestedAcquireBarrier struct {
	parties int
	grace   time.Duration
	mu      sync.Mutex
	arrived int
	peak    int
	open    chan struct{}
}

func newNestedAcquireBarrier(parties int, grace time.Duration) *nestedAcquireBarrier {
	return &nestedAcquireBarrier{parties: parties, grace: grace, open: make(chan struct{})}
}

func (b *nestedAcquireBarrier) wait() {
	b.mu.Lock()
	b.arrived++
	if b.arrived > b.peak {
		b.peak = b.arrived
	}
	if b.arrived >= b.parties {
		select {
		case <-b.open:
		default:
			close(b.open)
		}
	}
	b.mu.Unlock()
	select {
	case <-b.open:
	case <-time.After(b.grace):
	}
	b.mu.Lock()
	b.arrived--
	b.mu.Unlock()
}

// concurrentNestedHolds is the most claims this barrier ever saw holding a
// transaction while reaching for a second connection.
func (b *nestedAcquireBarrier) concurrentNestedHolds() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.peak
}

// budgetTransactions is the pooled transaction source compose/main.go hands
// the service, with one thing added: it knows how many provisioning
// transactions are open right now, each of which is holding a core-pool
// connection. That is what makes a read NESTED, and the nested reads are the
// only ones this reproduction lines up.
//
// It keeps Stat() so the service can still read the pool's real capacity; a
// source that hid it would be testing a different composition.
type budgetTransactions struct {
	pool *pgxpool.Pool
	open atomic.Int32
	peak atomic.Int32
}

func (s *budgetTransactions) Stat() *pgxpool.Stat { return s.pool.Stat() }

func (s *budgetTransactions) Begin(ctx context.Context) (pgx.Tx, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	live := s.open.Add(1)
	for {
		was := s.peak.Load()
		if live <= was || s.peak.CompareAndSwap(was, live) {
			break
		}
	}
	return &budgetTx{Tx: tx, source: s}, nil
}

// openTransactions is how many core-pool connections provisioning claims hold
// in transactions at this instant.
func (s *budgetTransactions) openTransactions() int { return int(s.open.Load()) }

// peakTransactions is the most it ever held at once.
func (s *budgetTransactions) peakTransactions() int { return int(s.peak.Load()) }

type budgetTx struct {
	pgx.Tx
	source *budgetTransactions
	done   atomic.Bool
}

func (t *budgetTx) release() {
	if t.done.CompareAndSwap(false, true) {
		t.source.open.Add(-1)
	}
}

func (t *budgetTx) Rollback(ctx context.Context) error { defer t.release(); return t.Tx.Rollback(ctx) }
func (t *budgetTx) Commit(ctx context.Context) error   { defer t.release(); return t.Tx.Commit(ctx) }

// pooledReadQuerier is a PROBE of the claim's nested read, not the product
// store. The acquire is real and contends for real — GetWorkspace goes to the
// SAME core pool the provisioning transaction already holds a connection from,
// which is how compose composes it — and then the row is answered from memory.
// So these cases state the ACQUIRE exactly and state nothing at all about the
// shipped SQL, the real row or the real fenced write. Those are regressed on
// the real *db.Queries store in core_pool_duty_progress_pg_test.go.
type pooledReadQuerier struct {
	*interruptedReleaseQuerier
	pool         *pgxpool.Pool
	transactions *budgetTransactions
	barrier      *nestedAcquireBarrier
	reads        atomic.Int32
	nested       atomic.Int32
}

func (q *pooledReadQuerier) GetWorkspace(ctx context.Context, id string) (db.Workspace, error) {
	// Only a read made while a provisioning transaction is open is the nested
	// acquire under test. The reconcile loop's own pre-lock read holds nothing
	// and is left alone.
	if q.transactions != nil && q.transactions.openTransactions() > 0 {
		q.nested.Add(1)
		if q.barrier != nil {
			q.barrier.wait()
		}
	}
	connection, err := q.pool.Acquire(ctx)
	if err != nil {
		return db.Workspace{}, err
	}
	defer connection.Release()
	var one int
	if err := connection.QueryRow(ctx, `SELECT 1`).Scan(&one); err != nil {
		return db.Workspace{}, err
	}
	q.reads.Add(1)
	return q.interruptedReleaseQuerier.GetWorkspace(ctx, id)
}

// budgetReconcilerService composes the claim path over the probe store above:
// one core pool behind BOTH the provisioning transactions and the store's
// reads, which is the composition under test. The real-store composition is
// realStoreReconciler.
func budgetReconcilerService(t *testing.T, pool *pgxpool.Pool, row db.Workspace, runtime workspaceapi.WorkspaceRuntime, opts ...WorkspaceServiceOption) (*WorkspaceService, *pooledReadQuerier) {
	t.Helper()
	live := row
	rollout := &rolloutRecoveryQuerier{mockWorkspaceQuerier: provisioningTestQuerier(nil), workspace: row}
	rollout.getWorkspaceFn = func(context.Context, string) (db.Workspace, error) { return live, nil }
	inner := &interruptedReleaseQuerier{rolloutRecoveryQuerier: rollout, live: &live}
	transactions := &budgetTransactions{pool: pool}
	q := &pooledReadQuerier{interruptedReleaseQuerier: inner, pool: pool, transactions: transactions}
	svc := newWorkspaceServiceForTests(q, append([]WorkspaceServiceOption{
		WithWorkspaceRuntime(runtime),
		WithWorkspaceTransactions(transactions),
	}, opts...)...)
	return svc, q
}

// budgetNestedGrace is how long a claim alone at the barrier waits for a
// second one before reading normally. It only has to outlast the other
// goroutine's admission attempt.
const budgetNestedGrace = 250 * time.Millisecond

// THE STALL ITSELF. A retained-guest-stop backlog that is entirely ready to
// move, driven by the real reconciler at the shipped core-pool budget, under
// the real concurrent duty the production census recorded. Before the fix the
// pass never returns: it holds a provisioning transaction's connection and
// waits forever for a second one that the long-lived session locks and the
// other claimant already hold. After the fix the same pass, at the same pool
// size, with the same session locks still parked and the same concurrent
// claimant still running, stops the guest and records its receipt.
func TestRetainedGuestStopProgressesAtShippedConnectionBudget(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)
	parkLongLivedSessionLocks(t, pool, "flow-host-binding:connection-budget")

	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained", history: []string{"zzzzzzzzzzzz"}, snapshots: 1}
	runtime := &interruptedReleaseRuntime{guest: guest}
	listed := advertisementFailureRow("ws-budget-stall", "vm-budget-stall")
	// The second claimant is the worker's own other duty, not a test prop: the
	// four starting_provision rows beside this backlog each take a
	// provisioning claim of their own, on this same pool, from a detached
	// goroutine. It does an ordinary amount of work and finishes; what it must
	// not be able to do is park a core-pool connection forever.
	barrier := newNestedAcquireBarrier(2, budgetNestedGrace)
	svc, q := budgetReconcilerService(t, pool, listed, runtime)
	q.barrier = barrier

	claimant := sampleDBWorkspace("ws-budget-concurrent-claim")
	claimed := make(chan error, 1)
	go func() {
		_, err := svc.withWorkspaceProvisionLock(context.Background(), claimant, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
			return current, nil
		})
		claimed <- err
	}()

	// NO deadline, because production has none: RunProvisioningReconciler
	// hands the process context straight through, and the ticker is only read
	// after reconcile RETURNS. A pass that parks here is a pass that never
	// ends, and fifteen elapsed minutes were never 180 completed ticks.
	//
	// PROGRESS IS MEASURED ACROSS TICKS, not inside one, because admission is
	// now measured against the real pool: four connections with two parked on
	// session locks can serve exactly ONE claim whole, so when the concurrent
	// duty is holding it this tick's refusal is finite and named and the row
	// is left for the next tick. That is the production loop's own behaviour —
	// it re-drives every WorkspaceProvisioningReconcileInterval — and asserting
	// progress inside one arbitrary pass would be asserting which goroutine
	// won a race. What every pass must do, always, is RETURN.
	passes := 0
	deadline := time.Now().Add(budgetProgressBound)
	for guest.state != workspaceapi.WorkspaceStopped && time.Now().Before(deadline) {
		done := make(chan error, 1)
		go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
		var err error
		select {
		case err = <-done:
		case <-time.After(budgetProgressBound):
			t.Fatal("the reconcile pass never returned: with no caller deadline its core-pool acquire is unbounded")
		}
		passes++
		require.NoError(t, err, "the reconcile pass must complete at the shipped budget")
		require.False(t, errors.Is(err, context.DeadlineExceeded), "progress must not depend on any deadline")
		if guest.state == workspaceapi.WorkspaceStopped {
			break
		}
		// Shorter than production's interval only so the test is quick; the
		// loop's behaviour is the same re-drive.
		time.Sleep(50 * time.Millisecond)
	}
	require.Positive(t, passes, "no reconcile pass ran at all")

	select {
	case claimErr := <-claimed:
		// Admitted or refused are both fine; parked forever is not.
		if claimErr != nil {
			require.True(t, errors.Is(claimErr, errWorkspaceProvisionInProgress),
				"a refused concurrent claim must still be the retryable in-progress refusal")
		}
	case <-time.After(budgetProgressBound):
		t.Fatal("the concurrent provisioning claim neither ran nor refused: it parked a core-pool connection forever")
	}

	require.Positive(t, q.nested.Load(), "the reproduction never reached the nested acquire it is about")
	servable := int(pool.Stat().MaxConns()) - shippedWorkerLongLivedPooledConnections
	require.LessOrEqual(t, barrier.concurrentNestedHolds(), servable,
		"more claims held a transaction while reaching for a second connection than the pool could ever serve")
	require.LessOrEqual(t, q.transactions.peakTransactions(), servable,
		"admitted claims held more core-pool connections in transactions than the pool had left to serve their nested reads")

	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state, "the retained guest is still running, so its reservation never came back")
	require.Len(t, q.fence, 1, "exactly one fenced receipt records the confirmed stop")
	require.Equal(t, advertisementStopDoor(t).confirmed, q.fence[0].FailureMessage)

	// The things a stop must not take are still there, and nothing swept the
	// failed workspace.
	require.Equal(t, "retained", guest.disk)
	require.Equal(t, []string{"zzzzzzzzzzzz"}, guest.history)
	require.Equal(t, 1, guest.snapshots)
	require.Zero(t, runtime.deletes.Load(), "recovery stopped the guest; it never deleted one")
	require.Empty(t, q.stages, "no stage write")
	require.Empty(t, q.status, "no status move")
}

// The budget is arithmetic over the pool the composition actually has, so it
// is stated here as the table it is rather than left to one live pool to
// imply. The shipped worker pool is the row that stalled.
func TestWorkspaceProvisionClaimBudgetFollowsTheRealPool(t *testing.T) {
	for _, tc := range []struct {
		name     string
		maxConns int32
		want     int
	}{
		{"the shipped worker core pool", shippedWorkerCorePoolMaxConns, 2},
		{"the pool size before the private connection-budget change", 9, workspaceProvisionMaxClaims},
		{"a pool that can serve exactly one claim", 2, 1},
		{"a pool smaller than one claim needs", 1, 1},
		{"the product default, where the old ceiling still applies", 25, workspaceProvisionMaxClaims},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, workspaceProvisionClaimBudget(tc.maxConns))
			// The gate must never close entirely: one claim at a time still
			// converges a backlog, and refusing every claim would strand it.
			require.GreaterOrEqual(t, workspaceProvisionClaimBudget(tc.maxConns), 1)
			// And above the floor it must never promise more connections than
			// the pool has, even with nothing else using it.
			if int(tc.maxConns) >= workspaceProvisionConnectionsPerClaim {
				require.LessOrEqual(t,
					workspaceProvisionClaimBudget(tc.maxConns)*workspaceProvisionConnectionsPerClaim,
					int(tc.maxConns), "the budget promised more connections than the pool has")
			}
		})
	}
}

// What the gate deliberately does NOT do is subtract a guess at the
// connections other duties hold. Root's review of the first attempt was right
// about this: a reserved count asserted from a server-wide census is an
// invented number, and the honest answer is to measure the pool. These are the
// two halves of that, stated against a real pool.
func TestClaimAdmissionIsMeasuredAgainstTheRealPoolNotAReservedGuess(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)
	svc := newWorkspaceServiceForTests(provisioningTestQuerier(nil), WithWorkspaceTransactions(pool))

	idle, admitted := svc.reserveProvisionClaim()
	require.True(t, admitted, "an idle pool can serve a whole claim")
	require.Equal(t, workspaceProvisionConnectionsPerClaim, svc.provisionTasks.reservedConnections(),
		"an admitted claim must reserve the connections it will need")
	idle.release()
	require.Zero(t, svc.provisionTasks.reservedConnections(), "a finished claim kept its reservation")

	// Other duty takes connections this package neither named nor reserved.
	// Admission has to see that, which a constant could not.
	var parked []*pgxpool.Conn
	t.Cleanup(func() {
		for _, conn := range parked {
			conn.Release()
		}
	})
	for taken := 1; taken <= shippedWorkerCorePoolMaxConns; taken++ {
		conn, err := pool.Acquire(context.Background())
		require.NoError(t, err)
		parked = append(parked, conn)
		headroom, measured := corePoolHeadroom(pool)
		require.True(t, measured, "a real pool must be measurable")
		require.Equal(t, shippedWorkerCorePoolMaxConns-taken, headroom)
		reservation, admitted := svc.reserveProvisionClaim()
		require.Equal(t, headroom >= workspaceProvisionConnectionsPerClaim, admitted,
			"admission must follow the pool's measured headroom, not a reserved constant")
		reservation.release()
	}

	// A source that cannot report its capacity is admitted on the gate alone,
	// exactly as it was before any of this: only a real pool is measurable.
	opaque := newWorkspaceServiceForTests(provisioningTestQuerier(nil), WithWorkspaceTransactions(opaqueTransactions{pool}))
	_, measured := corePoolHeadroom(opaqueTransactions{pool})
	require.False(t, measured)
	opaqueReservation, admitted := opaque.reserveProvisionClaim()
	require.True(t, admitted)
	opaqueReservation.release()
}

// THE CHECK-TO-ACQUIRE RACE, against the real pool.
//
// A snapshot check cannot keep two of this process's OWN claimants out of the
// same two free connections: both read headroom 2, both pass, both begin a
// transaction, both take one, and then both wait for a second that the other
// is holding. The written bounds make that finite, but two claimants refusing
// together and being re-driven together by one ticker is a cycle that
// converges only by luck.
//
// So with the pool's remaining capacity sized to exactly ONE claim — two
// connections held by other real duty, two left — admission must let exactly
// one claimant through. The other must be refused BEFORE it holds anything,
// with the measured-headroom reason, and must be admitted once the first one
// finishes. Fair progress, not two deadlines.
func TestTwoClaimantsAreNeverAdmittedAgainstTheSameFreeConnections(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)
	parkLongLivedSessionLocks(t, pool, "flow-host-binding:admission-race")
	svc := newWorkspaceServiceForTests(provisioningTestQuerier(nil), WithWorkspaceTransactions(pool))

	headroom, measured := corePoolHeadroom(pool)
	require.True(t, measured)
	require.Equal(t, workspaceProvisionConnectionsPerClaim, headroom,
		"this case is about a pool that can serve exactly one claim")

	// Both claimants decide at once, which is the race. Exactly one may win.
	claimants := 2
	start := make(chan struct{})
	type attempt struct {
		reservation *provisionClaimReservation
		admitted    bool
	}
	results := make(chan attempt, claimants)
	for range claimants {
		go func() {
			<-start
			reservation, admitted := svc.reserveProvisionClaim()
			results <- attempt{reservation: reservation, admitted: admitted}
		}()
	}
	close(start)

	var winners []*provisionClaimReservation
	for range claimants {
		got := <-results
		if got.admitted {
			winners = append(winners, got.reservation)
		}
	}
	require.Len(t, winners, 1,
		"both claimants were admitted against the same two connections, so each will hold one and wait for the other")
	require.Equal(t, workspaceProvisionConnectionsPerClaim, svc.provisionTasks.reservedConnections())

	// A claim that has actually taken its transaction's connection converts
	// one reservation into a measured one, because the pool counts it from
	// then on. Counting it twice would refuse the next claimant a connection
	// the pool can serve.
	conn, err := pool.Acquire(context.Background())
	require.NoError(t, err)
	winners[0].acquired()
	require.Equal(t, workspaceProvisionConnectionsPerClaim-1, svc.provisionTasks.reservedConnections(),
		"an acquired connection is still reserved as well as counted by the pool")

	// While that claim runs there is still nothing left for a second one.
	refused, admitted := svc.reserveProvisionClaim()
	require.False(t, admitted, "a second claim was admitted into a pool with one connection left")
	refused.release()

	// ... and once it finishes, the next tick's claimant is admitted. That is
	// convergence, with no deadline involved.
	conn.Release()
	winners[0].release()
	require.Zero(t, svc.provisionTasks.reservedConnections())
	next, admitted := svc.reserveProvisionClaim()
	require.True(t, admitted, "the backlog cannot converge if the next claim is refused after the first one let go")
	next.release()
}

// The gate has to be sized from the pool the service was composed with, not
// from the constant it was built with, or the arithmetic above never reaches
// production.
func TestWorkspaceProvisionGateIsSizedFromTheComposedPool(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)
	svc := newWorkspaceServiceForTests(provisioningTestQuerier(nil), WithWorkspaceTransactions(&budgetTransactions{pool: pool}))
	require.Equal(t, workspaceProvisionClaimBudget(shippedWorkerCorePoolMaxConns), svc.provisionTasks.limit)
	require.Equal(t, 2, svc.provisionTasks.limit, "the shipped pool of four admits two claims of two connections")
	require.Equal(t, svc.provisionTasks.limit, cap(svc.provisionTasks.slots))

	// A transaction source that cannot report capacity keeps the ceiling
	// rather than guessing a pool it cannot see.
	opaque := newWorkspaceServiceForTests(provisioningTestQuerier(nil), WithWorkspaceTransactions(opaqueTransactions{pool}))
	require.Equal(t, workspaceProvisionMaxClaims, opaque.provisionTasks.limit)
}

// opaqueTransactions is a pooled source that does not publish its capacity.
type opaqueTransactions struct{ pool *pgxpool.Pool }

func (o opaqueTransactions) Begin(ctx context.Context) (pgx.Tx, error) { return o.pool.Begin(ctx) }

// THE ANTI-ABSORBING FENCE, which is the part that actually ends the stall.
//
// The budget can be wrong — another subsystem can take a connection this
// process did not reserve — and then a correctly admitted claim still cannot
// get its nested connection. What must never happen again is what production
// did: hold the transaction, and with it the advisory lock, forever, in
// silence. So with the pool deliberately over-subscribed the claim must refuse
// INSIDE a written bound, say which acquire it was, release its transaction
// and its lock, and stay retryable.
func TestClaimRefusesFinitelyWhenTheCorePoolCannotServeIt(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)
	parkLongLivedSessionLocks(t, pool, "flow-host-binding:over-subscribed")

	// One more connection than this process reserved for long-lived duty, so
	// a single admitted claim's transaction leaves nothing for its own
	// nested read. This is the budget being WRONG, on purpose.
	stray, err := pool.Acquire(context.Background())
	require.NoError(t, err)
	t.Cleanup(stray.Release)

	listed := advertisementFailureRow("ws-budget-oversubscribed", "vm-budget-oversubscribed")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	svc, q := budgetReconcilerService(t, pool, listed, runtime)

	started := time.Now()
	outcome, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
	elapsed := time.Since(started)

	require.Error(t, err, "an unservable claim must refuse, not park")
	// Bounded by the written acquire budget at worst, and in fact faster: a
	// pool measured too small for a whole claim refuses BEFORE the Begin, so
	// the claim never holds one connection while waiting for a second.
	require.Less(t, elapsed, workspaceProvisionAcquireTimeout*workspaceProvisionConnectionsPerClaim+5*time.Second,
		"the refusal is not bounded by its own written acquire budget")
	require.Equal(t, interruptedReleaseStageAcquireConnection, outcome.stage,
		"the refusal must name the acquire it stalled in, not the whole claim")
	require.Equal(t, interruptedReleaseReasonPoolExhausted, outcome.reason)
	require.True(t, errors.Is(err, errWorkspaceProvisionInProgress), "the refusal stays retryable")
	require.True(t, isWorkspaceGuestNotReady(err), "callers still get a retryable guest_not_ready")

	// The transaction and its advisory lock are released, so the row is not
	// stranded behind this process the way production's was.
	require.Zero(t, q.transactions.openTransactions(), "the refused claim left a transaction open")
	require.Eventually(t, func() bool {
		var held int
		if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM pg_locks
			WHERE locktype = 'advisory' AND granted`).Scan(&held); err != nil {
			return false
		}
		return held <= shippedWorkerLongLivedPooledConnections
	}, 10*time.Second, 50*time.Millisecond, "a refused claim is still holding its provisioning advisory lock")

	// Nothing was decided about the guest. No stop, no delete, no write.
	require.Equal(t, workspaceapi.WorkspaceRunning, guest.state)
	require.Zero(t, runtime.stops.Load())
	require.Zero(t, runtime.deletes.Load())
	require.Empty(t, q.fence, "a claim that never owned the row wrote no receipt")
	require.Empty(t, q.stages)
	require.Empty(t, q.status)
}

// Shutdown still reaches a claim waiting on the gate or the pool: the bound is
// an upper limit on the wait, never a floor under cancellation.
func TestClaimUnwindsPromptlyOnShutdown(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)
	parkLongLivedSessionLocks(t, pool, "flow-host-binding:shutdown")
	stray, err := pool.Acquire(context.Background())
	require.NoError(t, err)
	t.Cleanup(stray.Release)

	listed := advertisementFailureRow("ws-budget-shutdown", "vm-budget-shutdown")
	svc, _ := budgetReconcilerService(t, pool, listed, &interruptedReleaseRuntime{
		guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := svc.withWorkspaceProvisionLock(ctx, listed, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
			return current, nil
		})
		done <- err
	}()
	time.Sleep(100 * time.Millisecond)
	started := time.Now()
	cancel()
	select {
	case err := <-done:
		require.Error(t, err)
		require.Less(t, time.Since(started), workspaceProvisionAcquireTimeout,
			"shutdown waited out the acquire bound instead of unwinding")
	case <-time.After(workspaceProvisionAcquireTimeout + 5*time.Second):
		t.Fatal("a cancelled claim never unwound")
	}
}

// The new stages are diagnosis, so they are held to the same opacity the rest
// of this recovery's records are: a non-resolvable correlation token, a
// written stage, a written reason, and nothing an adapter, a store or a
// customer ever supplied.
func TestClaimRefusalPublishesOnlyTheFiniteShape(t *testing.T) {
	secret := "postgres://smithers:hunter2@db.internal:5432/product?sslmode=require"
	stall := workspaceProvisionClaimStall{
		stage: interruptedReleaseStageAcquireConnection,
		cause: fmt.Errorf("%s: %w", secret, errCorePoolHeadroom),
	}
	refusal := workspaceProvisionInProgress(stall)

	require.Equal(t, interruptedReleaseReasonPoolExhausted, interruptedReleaseStopReasonFor(refusal),
		"a measured pool refusal is classified by what ran out, not by the sentence underneath it")

	// The SAME stage without that evidence is an ordinary deadline. The stage
	// says which step refused; only a measured pool says the pool did.
	unproved := workspaceProvisionInProgress(workspaceProvisionClaimStall{
		stage: interruptedReleaseStageClaimReceiptWrite,
		cause: fmt.Errorf("blocked: %w", context.DeadlineExceeded),
	})
	require.Equal(t, interruptedReleaseReasonDeadline, interruptedReleaseStopReasonFor(unproved),
		"a bounded step that refused with pool headroom left was published as an exhausted pool")
	unprovedStage, named := workspaceProvisionClaimStage(unproved)
	require.True(t, named, "the refusal must still name the step it stalled in")
	require.Equal(t, interruptedReleaseStageClaimReceiptWrite, unprovedStage)

	outcome, _ := interruptedReleaseStopOutcome{stage: interruptedReleaseStageClaim}.failed(refusal)
	args := outcome.logArgs("ws-budget-opaque")
	require.Equal(t, []any{
		"workspace", workspaceCorrelationToken("ws-budget-opaque"),
		"stage", string(interruptedReleaseStageAcquireConnection),
		"reason", string(interruptedReleaseReasonPoolExhausted),
	}, args)
	for _, arg := range args {
		rendered, ok := arg.(string)
		require.True(t, ok, "every published field is a written string")
		require.NotContains(t, rendered, "hunter2")
		require.NotContains(t, rendered, "db.internal")
		require.NotContains(t, rendered, "ws-budget-opaque", "the owner row is a correlation token, never its id")
	}

	// Every stage and reason this budget introduces is a written constant, so
	// the label sets stay finite.
	for _, stage := range []interruptedReleaseStopStage{
		interruptedReleaseStageAwaitClaimSlot,
		interruptedReleaseStageAcquireConnection,
		interruptedReleaseStageClaimLock,
		interruptedReleaseStageClaimRowRead,
		interruptedReleaseStageClaimReceiptWrite,
	} {
		require.Regexp(t, `^[a-z_]+$`, string(stage))
	}
	for _, reason := range []interruptedReleaseStopReason{
		interruptedReleaseReasonPoolExhausted,
		interruptedReleaseReasonDeadline,
	} {
		require.Regexp(t, `^[a-z_]+$`, string(reason))
	}
}

// THE OBSERVABILITY THE STALL DID NOT HAVE. Root's in-pod read of
// smithers_db_connections_active 4 of max 4, twice, is the whole of what
// production could say, and it cannot distinguish a worker doing four things
// from a worker holding four connections it will never return — nor name a
// single duty. These do: the budget says what this process believes it can
// serve, the held gauge says which duty is sitting on the pool right now, and
// a stall counter rises with the duty and stage that could not be served.
func TestClaimMetricsNameTheStallDBGaugesCannotExplain(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)
	parkLongLivedSessionLocks(t, pool, "flow-host-binding:metrics")
	stray, err := pool.Acquire(context.Background())
	require.NoError(t, err)
	t.Cleanup(stray.Release)

	recorder := newCorePoolDutyRecorder()
	listed := advertisementFailureRow("ws-budget-metrics", "vm-budget-metrics")
	svc, _ := budgetReconcilerService(t, pool, listed,
		&interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}},
		WithWorkspaceSandboxMetrics(recorder))

	// The budget is published when the worker's reconciler starts.
	reconciler, stopReconciler := context.WithCancel(context.Background())
	started := make(chan struct{})
	go func() { close(started); svc.RunProvisioningReconciler(reconciler) }()
	<-started

	require.Eventually(t, func() bool {
		return recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom)+
			recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageAcquireConnection) > 0
	}, 2*workspaceProvisionAcquireTimeout+10*time.Second, 100*time.Millisecond,
		"no series rose while the pool could not serve a claim")
	stopReconciler()

	require.Equal(t, float64(workspaceProvisionClaimBudget(shippedWorkerCorePoolMaxConns)), recorder.budget,
		"the published budget must be the one the gate enforces")
	require.LessOrEqual(t, recorder.peakHeld(corePoolDutyWorkspaceProvisionClaim), recorder.budget,
		"more claims held a core-pool connection than the published budget")

	// Finite, written label set: nothing an adapter or a row supplied.
	for duty, stages := range recorder.publishedLabels() {
		require.Equal(t, string(corePoolDutyWorkspaceProvisionClaim), duty)
		for _, stage := range stages {
			require.Contains(t, []string{
				string(corePoolStageAwaitClaimSlot),
				string(corePoolStagePoolHeadroom),
				string(corePoolStageAcquireConnection),
			}, stage, "an unwritten stage label reached the metric")
		}
	}

	// The held gauge returns to zero, so it measures live holds rather than
	// accumulating: a gauge that leaked would read like a deadlock.
	require.Eventually(t, func() bool {
		return recorder.heldNow(corePoolDutyWorkspaceProvisionClaim) == 0
	}, 2*workspaceProvisionAcquireTimeout+10*time.Second, 100*time.Millisecond,
		"the held gauge leaked, so it cannot distinguish a busy worker from a stuck one")
}

// The acquire budget is derived from the caller's context, so a cancelled
// caller expires both at once and the gate's branch can win the race.
// Shutdown must still read as shutdown: an operator sent to look at the pool
// every time a worker is redeployed would stop believing the series, and the
// stall counter would rise on every rollout.
// THE GATE IS FILLED DETERMINISTICALLY, and the holders are released whatever
// happens next. An earlier version of this case parked the long-lived session
// pair first, which left one free connection in a pool of four while a claim
// needs two: only one of the gate's two slots could ever be admitted, the fill
// wait then expired into t.Skip — BEFORE the cleanup that closes releaseHold
// was registered — and budgetTestPool's own earlier pool.Close cleanup waited
// forever for the connection the still-parked claim was holding. The required
// cancellation regression is not skippable, so the release is registered
// BEFORE the fill, the fill failing is a failure rather than a skip, and the
// gate is sized from real headroom at the shipped pool instead of hoping for
// it. The pool, its size and the source's bounds are unchanged.
func TestShutdownIsNeverReportedAsACorePoolStall(t *testing.T) {
	pool := budgetTestPool(t, shippedWorkerCorePoolMaxConns)

	recorder := newCorePoolDutyRecorder()
	listed := advertisementFailureRow("ws-budget-shutdown-class", "vm-budget-shutdown-class")
	svc, _ := budgetReconcilerService(t, pool, listed,
		&interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}},
		WithWorkspaceSandboxMetrics(recorder))

	// A claim needs workspaceProvisionConnectionsPerClaim connections and the
	// gate admits workspaceProvisionClaimBudget of them, so a pool that can
	// serve the whole gate is what the gate's own arithmetic says it is. If
	// that ever stops being true the fill below fails loudly rather than
	// skipping the regression.
	require.GreaterOrEqual(t, int(shippedWorkerCorePoolMaxConns),
		svc.provisionTasks.limit*workspaceProvisionConnectionsPerClaim,
		"the shipped pool cannot admit the gate its own budget sizes, so this case cannot fill it")

	holding := make(chan struct{}, svc.provisionTasks.limit)
	releaseHold := make(chan struct{})
	held := make(chan error, svc.provisionTasks.limit)

	// REGISTERED BEFORE THE FILL, and before any branch that can fail: a
	// holder parked in its callback is holding a core-pool connection, so a
	// test that returns without closing this channel hangs the pool's own
	// cleanup instead of reporting anything.
	var releaseOnce sync.Once
	release := func() {
		releaseOnce.Do(func() {
			close(releaseHold)
			for range svc.provisionTasks.limit {
				select {
				case <-held:
				case <-time.After(workspaceProvisionAcquireTimeout + 10*time.Second):
					t.Error("a released gate holder never returned its core-pool connection")
					return
				}
			}
		})
	}
	t.Cleanup(release)

	// ONE AT A TIME, waiting for each holder to be parked in its callback
	// before the next one asks for admission. A claim that is parked holds
	// exactly its transaction's connection and nothing transient, so the next
	// claim's measured admission is deterministic. Starting them together
	// would race the in-flight fenced read of the one before it, and a
	// reservation that correctly declines to over-commit the pool would then
	// refuse a holder this case needs — a flake in the arrangement, not in the
	// source.
	for slot := range svc.provisionTasks.limit {
		go func(slot int) {
			_, err := svc.withWorkspaceProvisionLock(context.Background(),
				sampleDBWorkspace("ws-budget-gate-holder-"+string(rune('a'+slot))),
				func(_ context.Context, current db.Workspace) (db.Workspace, error) {
					holding <- struct{}{}
					<-releaseHold
					return current, nil
				})
			held <- err
		}(slot)
		select {
		case <-holding:
		case <-time.After(workspaceProvisionAcquireTimeout + 10*time.Second):
			// Not a skip: a gate that cannot be filled means the claim path no
			// longer admits what its own budget sizes, which is the defect a
			// skip here used to hide. held is read with len rather than
			// received from, so the cleanup above still drains every holder.
			require.FailNowf(t, "the gate never filled",
				"claim %d of %d never reached the callback at the shipped pool, %d returned early",
				slot+1, svc.provisionTasks.limit, len(held))
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	waiting := make(chan error, 1)
	go func() {
		_, err := svc.withWorkspaceProvisionLock(ctx, listed, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
			return current, nil
		})
		waiting <- err
	}()
	time.Sleep(200 * time.Millisecond)
	cancel()

	select {
	case err := <-waiting:
		require.ErrorIs(t, err, context.Canceled, "a cancelled claim reports cancellation")
		require.Equal(t, interruptedReleaseReasonCanceled, interruptedReleaseStopReasonFor(err))
		_, named := workspaceProvisionClaimStage(err)
		require.False(t, named, "shutdown was dressed up as a pool stall")
	case <-time.After(workspaceProvisionAcquireTimeout):
		t.Fatal("a cancelled claim waited out the acquire budget instead of unwinding")
	}

	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageAwaitClaimSlot),
		"shutdown incremented the stall counter")
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageAcquireConnection),
		"shutdown incremented the stall counter")
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
		"shutdown incremented the stall counter")

	// The gate's own holders are released here rather than only in cleanup, so
	// the held gauge is proved to come back down: a gauge that leaked would
	// read like the deadlock this case exists to tell apart from one.
	release()
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim),
		"the held gauge leaked, so a redeployed worker reads as a stuck one")
	require.Equal(t, float64(svc.provisionTasks.limit), recorder.peakHeld(corePoolDutyWorkspaceProvisionClaim),
		"the gate admitted a different number of claims than its published budget")
}
