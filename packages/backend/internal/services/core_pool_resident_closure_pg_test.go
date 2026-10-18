package services

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/database"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/revocation"
	"github.com/smithersai/smithers/packages/backend/internal/sse"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// CORE-POOL OWNERS THIS PACKAGE'S DUTY GAUGES DO NOT NAME, at the serving
// worker's measured pool size of four.
//
// Two of them are process-lifetime residents: compose starts sse.NewBroker and
// revocation.NewBus before any topology branch and with no condition on
// whether the process serves HTTP, and each holds one pooled connection from
// Start to Stop. The third is the public mirror seeder, which compose starts
// under topology.workers(): each pass tries the mirror's SESSION-level
// advisory lock once (database.AcquireSessionLock), and the pass that wins
// makes its service-account, organization, repository, source and pull reads
// through the same pool while it holds the lock and its connection.
//
// WHAT THESE CASES PROVE, and only this:
//
//   - the residents' own cost, measured, and the margin it leaves a claim;
//   - a seed pass that cannot win the lock skips at once holding nothing, so
//     a real claim converges with the foreign lock STILL held and both
//     residents still resident — automatic progress, nothing released by hand;
//   - a seed pass that WINS the lock and then cannot get its nested read
//     refuses finitely too, releases the lock and the connection, and never
//     calls an exhausted pool the cause of a lock or query wait.
//
// The unlock that is not confirmed, and so closes its session, is proved with
// a real fault in internal/database/session_lock_pg_test.go.
//
// WHAT THEY DO NOT PROVE. Replicas have DISTINCT pools, so the foreign session
// here is deliberately OUTSIDE the pool under test and these cases make no
// claim about any production connection's owner: production's census is
// server-wide, and the fourth connection each serving worker was measured
// holding is still unattributed. No physical VM stop, capacity or deployment
// fact is established either: the guest runtime is a controlled double, and
// only the rows, locks, pool and SQL are real.

// residentCorePoolConnections is what the two residents hold between them
// while they are merely resident: one each, asserted below rather than
// assumed. Nothing in packages/backend subtracts a resident count from the
// pool; admission measures the pool instead.
const residentCorePoolConnections = 2

// residentPair is the two process-lifetime residents.
type residentPair struct {
	broker *sse.Broker
	bus    *revocation.Bus
}

// startProcessLifetimeResidents starts both residents over the pool under test
// and waits until each holds its connection.
//
// The bus's poll interval is set beyond this test so the resident is purely
// resident here: its nested catch-up acquire is a core-pool duty of its own and
// is regressed in internal/revocation/core_pool_nested_catch_up_pg_test.go.
// broker.Start's context is startup-only by construction — dispatch derives its
// own context from context.Background() and is cancelled only by Stop (see
// sse.Broker.dispatch) — so cancelling the start context does not stop it.
func startProcessLifetimeResidents(t *testing.T, pool *pgxpool.Pool) *residentPair {
	t.Helper()
	acquiredBefore := pool.Stat().AcquiredConns()

	broker := sse.NewBroker(pool)
	t.Cleanup(broker.Stop)
	startCtx, cancelStart := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancelStart()
	require.NoError(t, broker.Start(startCtx))

	bus := revocation.NewBus(pool, db.New(pool))
	bus.PollInterval = time.Hour
	busCtx, cancelBus := context.WithCancel(context.Background())
	t.Cleanup(func() {
		cancelBus()
		select {
		case <-bus.Done():
		case <-time.After(corePoolObserveBound):
			t.Error("the revocation bus did not stop, so it is still holding a pooled connection")
		}
	})
	require.NoError(t, bus.Start(busCtx))

	require.Eventually(t, func() bool {
		return pool.Stat().AcquiredConns() == acquiredBefore+residentCorePoolConnections
	}, corePoolObserveBound, 5*time.Millisecond,
		"the two residents are not holding exactly two pooled connections")
	return &residentPair{broker: broker, bus: bus}
}

// residentGaugeValue scrapes one named gauge out of a resident's own
// collectors. A pool that reads full needs its residents named: active over max
// reads four of four for a worker that is working and for one that is starved,
// and names neither.
func residentGaugeValue(t *testing.T, resident interface {
	MetricsCollectors() []prometheus.Collector
}, name string) float64 {
	t.Helper()
	for _, collector := range resident.MetricsCollectors() {
		metrics := make(chan prometheus.Metric, 1)
		collector.Collect(metrics)
		close(metrics)
		for metric := range metrics {
			if !strings.Contains(metric.Desc().String(), name) {
				continue
			}
			var out dto.Metric
			require.NoError(t, metric.Write(&out))
			if out.Gauge != nil {
				return out.Gauge.GetValue()
			}
		}
	}
	t.Fatalf("no resident gauge named %s is published", name)
	return 0
}

// holdOnePooledConnection takes one connection and keeps it for the test, in
// the shape of any ordinary duty that holds one. The release is registered as
// cleanup before it is returned, so a failing assertion cannot leave the pool
// unable to close.
func holdOnePooledConnection(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	var once sync.Once
	t.Cleanup(func() { once.Do(conn.Release) })
}

// TestTheProcessLifetimeResidentsLeaveNoMarginAtTheShippedCorePool measures
// what the residents cost and what that leaves. It is an arithmetic and
// attribution case: the third holder here is released by hand, so it proves
// admission accounting and diagnostic fidelity, NOT a production repair.
func TestTheProcessLifetimeResidentsLeaveNoMarginAtTheShippedCorePool(t *testing.T) {
	pool, observer := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-residents")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, pool, runtime, recorder)

	residents := startProcessLifetimeResidents(t, pool)
	headroom, measured := corePoolHeadroom(pool)
	require.True(t, measured, "a real pool must be measurable")
	require.Equal(t, shippedWorkerCorePoolMaxConns-residentCorePoolConnections, headroom)
	require.Equal(t, workspaceProvisionConnectionsPerClaim, headroom,
		"the residents no longer leave exactly one claim's worth of pool, so this accounting needs re-deriving")

	// One more real holder, with an hour's budget so no bound anywhere is what
	// this case turns on. The callback is unblocked and joined from cleanup
	// registered BEFORE the goroutine starts, so a failing assertion below
	// cannot leave it parked on a connection the pool is waiting to close.
	locker := NewPgGitHubAppReconcileLocker(pool,
		WithGitHubAppReconcileCorePoolObserver(recorder),
		withGitHubAppReconcileHoldBudget(time.Hour))
	holding, finishHold := make(chan struct{}), make(chan struct{})
	held := make(chan error, 1)
	var closeOnce sync.Once
	endHold := func() { closeOnce.Do(func() { close(finishHold) }) }
	t.Cleanup(func() {
		endHold()
		select {
		case <-held:
		case <-time.After(corePoolObserveBound):
			t.Error("the election hold never returned, so it is still holding a pooled connection")
		}
	})
	go func() {
		_, err := locker.TryWithLock(context.Background(), func(context.Context) error {
			close(holding)
			<-finishHold
			return nil
		})
		// Closed as well as sent, so the cleanup above can observe completion
		// after the body has already taken the value.
		held <- err
		close(held)
	}()
	select {
	case <-holding:
	case err := <-held:
		t.Fatalf("the holder returned before it held anything: %v", err)
	case <-time.After(corePoolObserveBound):
		t.Fatal("the holder never reached its callback")
	}
	require.True(t, observer.electionLockHeld(t), "the third holder never won its election lock")
	require.Equal(t, float64(1), recorder.heldNow(corePoolDutyGitHubAppReconcile))
	headroom, measured = corePoolHeadroom(pool)
	require.True(t, measured)
	require.Less(t, headroom, workspaceProvisionConnectionsPerClaim,
		"one more holder beside the residents did not take the pool below one claim")

	// Every pass refuses at the measured headroom, and the loop still reaches
	// rows. No caller deadline: production's tick has none.
	for pass := 1; pass <= 3; pass++ {
		done := make(chan error, 1)
		go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
		select {
		case err := <-done:
			require.NoError(t, err, "a refused claim is not a tick-level failure")
		case <-time.After(4 * workspaceProvisionAcquireTimeout):
			t.Fatalf("pass %d never returned, so a refusal became a hang", pass)
		}
		require.Equal(t, pass, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
			"a pass that could not serve a whole claim did not refuse at the measured headroom")
	}
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStageAcquireConnection),
		"a measured admission refusal was published as an acquire that waited")
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionBacklog, corePoolStageListBacklog),
		"the listing refused too, so the loop reached no row and this is a different failure")
	require.Equal(t, workspaceapi.WorkspaceRunning, guest.state, "a refused claim stopped a guest anyway")
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim), "a refused claim held a connection")
	require.Zero(t, svc.provisionTasks.reservedConnections(), "a refused claim kept its reservation")

	// The hand-released holder finishes and the next pass does the real work.
	endHold()
	select {
	case err := <-held:
		require.NoError(t, err)
	case <-time.After(corePoolObserveBound):
		t.Fatal("the holder never returned after it was released")
	}
	require.Eventually(t, func() bool { return !observer.electionLockHeld(t) }, corePoolObserveBound, 50*time.Millisecond,
		"the finished holder kept its election lock")
	headroom, measured = corePoolHeadroom(pool)
	require.True(t, measured)
	require.Equal(t, workspaceProvisionConnectionsPerClaim, headroom,
		"the pool did not come back to one claim's worth after the third holder let go")

	done := make(chan error, 1)
	go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(4 * workspaceProvisionAcquireTimeout):
		t.Fatal("the pass after the third holder released never returned")
	}

	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state, "the retained guest never stopped")
	require.Equal(t, int32(1), runtime.stops.Load())
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no fenced receipt records the confirmed stop")
	require.Equal(t, "failed", after.Status, "the fences this claim runs under were not preserved")
	require.Equal(t, listed.VmID, after.VmID)
	require.Equal(t, listed.ProvisioningGeneration, after.ProvisioningGeneration,
		"the generation fence moved under a claim that only recorded a stop")
	require.Equal(t, 3, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
		"the converging pass refused as well")
	require.Zero(t, recorder.heldNow(corePoolDutyWorkspaceProvisionClaim), "the claim's held gauge leaked")
	require.Zero(t, svc.provisionTasks.reservedConnections(), "the converged claim kept its reservation")

	// The residents never let go, and they say so.
	require.Equal(t, int32(residentCorePoolConnections), pool.Stat().AcquiredConns(),
		"the converged pass left connections behind, or a resident let go")
	require.Equal(t, float64(1), residentGaugeValue(t, residents.broker, "smithers_sse_broker_pooled_connections_held"),
		"the broker is not publishing the pooled connection it is still holding")
	require.Equal(t, float64(1), residentGaugeValue(t, residents.bus, "smithers_revocation_bus_connected"),
		"the bus is not publishing the pooled connection it is still holding")
}

// realMirrorSeeder is the shipped seeder over the pool under test, with its
// hold shortened so a refusal is observable. Its organization and repository
// services are the real ones; a pass that reaches the repository host is a
// test failure, because every case here refuses before it.
func realMirrorSeeder(t *testing.T, pool *pgxpool.Pool, mirror string, recorder *corePoolDutyRecorder,
	hold time.Duration, opts ...PublicMirrorSeederOption) (*PublicMirrorSeeder, *recordedMirrorPulls) {
	t.Helper()
	parsed, err := ParsePublicMirrors([]string{mirror})
	require.NoError(t, err)
	queries := db.New(pool)
	host := &mockRepoHostClient{initRepoFn: func(context.Context, string, string, string, bool) error {
		t.Error("a pass that refused before its work created a repository")
		return nil
	}}
	pulls := &recordedMirrorPulls{}
	options := append([]PublicMirrorSeederOption{
		WithPublicMirrorSeedCorePoolObserver(recorder),
		withPublicMirrorSeedHoldBudget(hold),
	}, opts...)
	return NewPublicMirrorSeeder(pool, NewOrgServiceWithPool(queries, pool), NewRepoService(queries, host, "s1"), pulls, parsed, options...), pulls
}

// mirrorSessionLockKey is the seeder's own key for a mirror.
func mirrorSessionLockKey(mirror string) string {
	return "smithers.public_mirror:" + strings.ToLower(mirror)
}

// grantedAdvisoryHolders counts granted SESSION-level advisory holders of one
// key in THIS database, read from outside the pool under test. pg_locks is
// server-wide and advisory keys are per database, so an unfiltered count could
// be answered by a concurrent package's key.
func grantedAdvisoryHolders(t *testing.T, observer *corePoolObserver, key string) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var holders int
	require.NoError(t, observer.conn.QueryRow(ctx, `
		SELECT count(*) FROM pg_locks l
		JOIN pg_database d ON d.oid = l.database
		WHERE l.locktype = 'advisory' AND l.granted
		  AND d.datname = current_database()
		  AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended($1, 0)`, key).Scan(&holders))
	return holders
}

// TestTheMirrorSeedSkipsAForeignSessionLockAndTheBacklogConverges is the
// automatic-progress case. Before plue#839 the losing pass waited in the
// blocking pg_advisory_lock holding a core-pool connection, which with the
// residents left a claim one connection short until its hold budget ran out.
// Now it skips at once, holding nothing, and the claim converges on the next
// pass with the other replica's lock never released.
//
// The foreign session is deliberately NOT in this pool, because a replica has
// its own pool; it models the other replica's holder and it is never released.
func TestTheMirrorSeedSkipsAForeignSessionLockAndTheBacklogConverges(t *testing.T) {
	pool, observer := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-mirror-seed")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, pool, runtime, recorder)
	startProcessLifetimeResidents(t, pool)

	mirror := "seedowner/seedrepo"
	lock := mirrorSessionLockKey(mirror)
	foreign := outOfPoolConn(t, observer.url)
	foreignCtx, cancelForeign := context.WithTimeout(context.Background(), corePoolObserveBound)
	_, err := foreign.Exec(foreignCtx, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, lock)
	cancelForeign()
	require.NoError(t, err, "the other replica never took the mirror's session lock")
	require.Equal(t, 1, grantedAdvisoryHolders(t, observer, lock))

	// A hold budget far longer than this test, so no deadline is the mechanism.
	seeder, pulls := realMirrorSeeder(t, pool, mirror, recorder, time.Hour)

	// NO caller deadline: Start's context is the process's.
	began := time.Now()
	require.NoError(t, seeder.Seed(context.Background()),
		"losing the mirror's lock to another replica is a skipped pass, not a failure")
	require.Less(t, time.Since(began), time.Second, "the losing pass waited for the other replica")
	require.Equal(t, 1, recorder.waitCount(string(corePoolDutyPublicMirrorSeed), database.AdvisoryLockBusy),
		"the skipped pass is not counted as a busy lock")
	require.Zero(t, recorder.peakHeld(corePoolDutyPublicMirrorSeed), "the skipped pass held a connection")
	require.Zero(t, recorder.stallCount(corePoolDutyPublicMirrorSeed, corePoolStageSessionLock),
		"another session holding the lock was published as a stall")
	require.Empty(t, pulls.requested, "a pass that never won the lock requested a GitHub pull")
	require.Equal(t, int32(residentCorePoolConnections), pool.Stat().AcquiredConns(),
		"the skipped pass left a connection behind")
	require.Zero(t, observer.advisoryLockWaiters(t), "the skipped pass left a session waiting on the lock")

	// Automatic progress. The other replica still holds the mirror's lock and
	// both residents still hold theirs.
	done := make(chan error, 1)
	go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(4 * workspaceProvisionAcquireTimeout):
		t.Fatal("the pass after the seed skipped never returned")
	}
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state,
		"the backlog did not move beside a foreign mirror lock")
	require.Equal(t, int32(1), runtime.stops.Load())
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no fenced receipt records the confirmed stop")
	require.Equal(t, "failed", after.Status, "the fences this claim runs under were not preserved")
	require.Equal(t, listed.VmID, after.VmID)
	require.Equal(t, listed.ProvisioningGeneration, after.ProvisioningGeneration,
		"the generation fence moved under a claim that only recorded a stop")
	require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
		"the claim refused for headroom beside a pass that held nothing")
	require.Equal(t, 1, grantedAdvisoryHolders(t, observer, lock),
		"the mirror's foreign lock did not survive the pass that converged beside it")
}

// TestTheMirrorSeedHolderRefusesItsNestedReadAndReleasesTheSessionLock is the
// HOLDER's half: this pass wins the lock, and then the same caller context
// reaches the reads it makes through the same pool. With the pool full those
// reads used to park under the held lock; now they refuse, and the lock and the
// connection both come back.
func TestTheMirrorSeedHolderRefusesItsNestedReadAndReleasesTheSessionLock(t *testing.T) {
	pool, observer := shippedCorePool(t)
	recorder := newCorePoolDutyRecorder()
	startProcessLifetimeResidents(t, pool)
	// One more ordinary holder, so the pass's own nested read is the acquire
	// that cannot be served. It is never released as the mechanism here.
	holdOnePooledConnection(t, pool)

	mirror := "nestedowner/nestedrepo"
	lock := mirrorSessionLockKey(mirror)
	require.Zero(t, grantedAdvisoryHolders(t, observer, lock), "something already holds this mirror's lock")
	seeder, pulls := realMirrorSeeder(t, pool, mirror, recorder, 3*time.Second)

	seeded := make(chan error, 1)
	go func() { seeded <- seeder.Seed(context.Background()); close(seeded) }()
	t.Cleanup(func() {
		select {
		case <-seeded:
		case <-time.After(corePoolObserveBound):
			t.Error("the seed pass never returned, so it is still holding a pooled connection")
		}
	})

	// It wins the lock, which is what makes this the holder's path.
	require.Eventually(t, func() bool { return grantedAdvisoryHolders(t, observer, lock) == 1 },
		corePoolObserveBound, 5*time.Millisecond, "the pass never won the mirror's session lock")
	require.Equal(t, float64(1), recorder.heldNow(corePoolDutyPublicMirrorSeed),
		"the holding pass is not published as holding its connection")

	select {
	case seedErr := <-seeded:
		require.Error(t, seedErr, "a nested read that could not be served reported success")
	case <-time.After(corePoolObserveBound):
		t.Fatal("the holding pass never returned, so its nested read is still parked under the lock")
	}
	require.Equal(t, 1, recorder.stallCount(corePoolDutyPublicMirrorSeed, corePoolStageLockedWork),
		"the refusal did not name the locked work that could not finish")
	require.Zero(t, recorder.stallCount(corePoolDutyPublicMirrorSeed, corePoolStageSessionLock),
		"a pass that WON the lock was published as one that could not get it")
	require.Zero(t, recorder.heldNow(corePoolDutyPublicMirrorSeed), "the refused pass kept its held gauge")
	require.Empty(t, pulls.requested, "a pass that refused inside its hold requested a GitHub pull")

	// The lock and the connection both come back, and the unlock ran on the
	// detached release context even though the pass's own bound had expired.
	require.Eventually(t, func() bool { return grantedAdvisoryHolders(t, observer, lock) == 0 },
		corePoolObserveBound, 10*time.Millisecond,
		"the refused pass kept the mirror's session lock, so every other replica stays blocked")
	require.Eventually(t, func() bool { return pool.Stat().AcquiredConns() == residentCorePoolConnections+1 },
		corePoolObserveBound, 10*time.Millisecond, "the refused pass never gave its connection back")
}
