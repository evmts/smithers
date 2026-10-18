package services

import (
	"context"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/database"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// TWO REPLICAS, ONE WEDGED, plue#839.
//
// Production on 2026-10-17 had two product workers, each with a core pool of
// four and two process-lifetime residents. On one of them the public-mirror
// seed held the mirror's session lock while its own nested read waited for a
// connection, and a flowhost binding lease held the binding's lock while its
// own nested work waited too: that replica was full and could not move. The
// other replica then reached for the SAME two session locks. Both waits were
// the blocking pg_advisory_lock, so each took one of its connections and kept
// it for as long as the wedged replica kept the lock: the seed for up to its
// hold budget, the idle-suspend capture for ever. With the residents that is
// four of four, and the retained-guest stop on the healthy replica refused at
// pool_headroom on every tick. A blocked statement also holds its snapshot, so
// the waiters pinned the server's xmin while they waited.
//
// This case builds exactly that with real pools, real locks and the real
// seeder, flowhost store and reconciler. Replica B is wedged by the test and
// never recovers while the assertions run. What it proves is that replica A
// stops the guest anyway: a contended session lock costs A no connection and
// no snapshot, and A's losers refuse by name instead of waiting.
//
// What it does not prove: B's own recovery. That is each holder's written
// hold budget, regressed in the seed and flowhost tests. The guest runtime is
// a controlled double; the pools, locks, rows and SQL are real.
func TestTwoReplicasConvergeARetainedGuestStopWhileTheMirrorSeedAndAFlowHostLeaseContend(t *testing.T) {
	replicaA, observer := shippedCorePool(t)
	replicaB := secondReplicaCorePool(t, observer.url)
	listed := realRetainedGuestStopRow(t, replicaA, "contend-guest")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorderA, recorderB := newCorePoolDutyRecorder(), newCorePoolDutyRecorder()
	svc := realStoreReconciler(t, replicaA, runtime, recorderA)
	startProcessLifetimeResidents(t, replicaA)
	startProcessLifetimeResidents(t, replicaB)

	mirror := "contendorg/contendrepo"
	privateMirrorRepository(t, replicaA, "contendorg", "contendrepo")
	authority, catalog := flowHostBindingFixture(t, replicaA, "contend-host")

	// Replica B: a binding lease, then the seed wins the mirror's lock and its
	// nested read finds B full, then the lease's own nested acquire parks too.
	wedge, unwedge := context.WithCancel(context.Background())
	storeB, err := flowhost.NewStore(replicaB, callbackTestCodec{})
	require.NoError(t, err)
	storeB.ObserveCorePoolDuties(recorderB)
	acquireB, cancelAcquireB := context.WithTimeout(wedge, corePoolObserveBound)
	leaseB, err := storeB.Acquire(acquireB, authority, catalog)
	cancelAcquireB()
	require.NoError(t, err, "replica B never took the binding lease")
	seederB, _ := realMirrorSeeder(t, replicaB, mirror, recorderB, time.Minute)
	seedB := make(chan error, 1)
	go func() { seedB <- seederB.Seed(wedge) }()
	lock := mirrorSessionLockKey(mirror)
	require.Eventually(t, func() bool { return grantedAdvisoryHolders(t, observer, lock) == 1 },
		corePoolObserveBound, 5*time.Millisecond, "replica B's seed never won the mirror's lock")
	require.Eventually(t, func() bool { return replicaB.Stat().AcquiredConns() == shippedWorkerCorePoolMaxConns },
		corePoolObserveBound, 5*time.Millisecond, "replica B is not full: residents, lease and seed")
	nestedB := make(chan error, 1)
	go func() {
		conn, err := replicaB.Acquire(wedge)
		if err == nil {
			conn.Release()
		}
		nestedB <- err
	}()

	// Replica A: its own seed pass and an idle-suspend capture of the same
	// branch's flow host, both with the process context production gave them.
	seederA, pullsA := realMirrorSeeder(t, replicaA, mirror, recorderA, publicMirrorSeedHoldBudget)
	storeA, err := flowhost.NewStore(replicaA, callbackTestCodec{})
	require.NoError(t, err)
	storeA.ObserveCorePoolDuties(recorderA)
	var hostStops atomic.Int32
	stopper := flowHostStopFunc(func(context.Context, flowhost.Binding) error { hostStops.Add(1); return nil })
	settled := flowhost.ActiveRunsFunc(func(context.Context, flowhost.Binding) (bool, error) { return false, nil })
	began := time.Now()
	seedA := startContender(began, func() error { return seederA.Seed(context.Background()) })
	captureA := startContender(began, func() error {
		return storeA.PrepareWorkspaceCapture(context.Background(), authority.WorkspaceID, stopper, settled)
	})

	var unwind sync.Once
	t.Cleanup(func() {
		unwind.Do(func() {
			unwedge()
			<-nestedB
			_ = leaseB.Close()
			<-seedB
			for _, contender := range []*contender{seedA, captureA} {
				if !contender.returnedWithin(publicMirrorSeedHoldBudget + corePoolObserveBound) {
					t.Error("a replica A duty never returned after replica B let go")
				}
			}
		})
	})

	// Give A's two contenders the time a bounded refusal needs, and no more.
	seedA.returnedWithin(5 * time.Second)
	captureA.returnedWithin(5 * time.Second)

	// A's reconciler with no caller deadline, as production runs it, while
	// the server is watched for advisory waiters and pinned snapshots.
	var worstWaiters int
	var worstSnapshot float64
	var lastTick error
	deadline := time.Now().Add(budgetProgressBound)
	for guest.state != workspaceapi.WorkspaceStopped && time.Now().Before(deadline) {
		worstWaiters = max(worstWaiters, observer.advisoryLockWaiters(t))
		worstSnapshot = max(worstSnapshot, oldestSnapshotSeconds(t, observer))
		done := make(chan error, 1)
		go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
		select {
		case lastTick = <-done:
		case <-time.After(4 * workspaceProvisionAcquireTimeout):
			t.Fatal("a reconcile pass on replica A never returned")
		}
		if guest.state != workspaceapi.WorkspaceStopped {
			time.Sleep(250 * time.Millisecond)
		}
	}

	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state,
		"replica A never stopped the retained guest while replica B held the mirror and binding locks: "+
			"last tick=%v, pool_headroom refusals=%d, A acquired=%d of %d, advisory waiters=%d, oldest snapshot=%.1fs",
		lastTick, recorderA.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
		replicaA.Stat().AcquiredConns(), shippedWorkerCorePoolMaxConns, worstWaiters, worstSnapshot)
	require.NoError(t, lastTick, "the converging tick failed")
	require.Equal(t, int32(1), runtime.stops.Load())
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(replicaA).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no fenced receipt records the confirmed stop")

	require.Zero(t, worstWaiters, "a session waited on an advisory lock instead of refusing")
	require.Less(t, worstSnapshot, 2.0, "a statement held its snapshot, and so the server's xmin, while it waited")

	// A's losers refused by name, at once, and held nothing.
	require.True(t, seedA.returnedWithin(0), "replica A's seed pass is still waiting for the mirror's lock")
	require.NoError(t, seedA.err, "losing the mirror's lock to another replica is a skipped pass, not a failure")
	require.Less(t, seedA.elapsed, time.Second, "replica A's seed waited for a lock another replica held")
	require.Empty(t, pullsA.requested)
	require.True(t, captureA.returnedWithin(0), "replica A's capture is still waiting for the binding lock")
	require.ErrorIs(t, captureA.err, flowhost.ErrHostBusy, "a capture that cannot take the binding lock must say the host is busy")
	require.Less(t, captureA.elapsed, 3*time.Second, "replica A's capture waited past its bound")
	require.Zero(t, hostStops.Load(), "a capture that never held the binding lock stopped its host")
	require.Equal(t, int32(residentCorePoolConnections), replicaA.Stat().AcquiredConns(),
		"replica A holds more than its residents after its losers refused")

	// B is still wedged: A converged beside it, not after it.
	require.Equal(t, 1, grantedAdvisoryHolders(t, observer, lock), "replica B let go of the mirror's lock")
	require.Equal(t, int32(shippedWorkerCorePoolMaxConns), replicaB.Stat().AcquiredConns(), "replica B was not wedged throughout")

	// The series name each replica's state without a database census: B's
	// held gauges name its two holders, and A's wait outcomes name its two
	// losers while its own held gauges read zero.
	require.Equal(t, float64(1), recorderB.heldNow(corePoolDutyPublicMirrorSeed), "B's seed hold is not published")
	require.Equal(t, float64(1), recorderB.heldByName("flowhost_binding_lease"), "B's binding lease hold is not published")
	require.Equal(t, 1, recorderA.waitCount(string(corePoolDutyPublicMirrorSeed), database.AdvisoryLockBusy))
	require.Equal(t, 1, recorderA.waitCount("flowhost_capture", database.AdvisoryLockBusy))
	require.Zero(t, recorderA.peakHeld(corePoolDutyPublicMirrorSeed), "A's skipped seed held a connection")
	require.Zero(t, recorderA.heldByName("flowhost_capture"), "A's refused capture is still published as holding")
}

// secondReplicaCorePool is another process's core pool on the same database.
func secondReplicaCorePool(t *testing.T, databaseURL string) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := postgresfixture.Open(ctx, databaseURL, shippedWorkerCorePoolMaxConns)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))
	return pool
}

// privateMirrorRepository is production's 10-17 mirror: a public organization
// holding a private repository, so a seed pass that does get to its work
// refuses without creating anything.
func privateMirrorRepository(t *testing.T, pool *pgxpool.Pool, owner, name string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var org int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name, lower_name, visibility) VALUES ($1, $1, 'public') RETURNING id`, owner).Scan(&org))
	_, err := pool.Exec(ctx, `INSERT INTO repositories(org_id, name, lower_name, is_public) VALUES ($1, $2, $2, FALSE)`, org, name)
	require.NoError(t, err)
}

// flowHostBindingFixture is one branch whose agent-session binding a lease can
// take: an owner, a repository and a stopped workspace that is in no
// provisioning backlog.
func flowHostBindingFixture(t *testing.T, pool *pgxpool.Pool, slug string) (flowhost.Authority, flowhost.Catalog) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	repository := realRepository(t, pool, slug)
	workspace := uuid.NewString()
	_, err := pool.Exec(ctx, `INSERT INTO workspaces(id, repository_id, user_id, name, status) VALUES ($1, $2, $3, $4, 'stopped')`,
		workspace, repository.ID, repository.UserID.Int64, slug)
	require.NoError(t, err)
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")
	return flowhost.Authority{
			Target:       flowruntime.Target{TenantID: "repo:" + suffix, PrincipalID: "user:" + suffix, BindingKind: "agent-session", BindingID: uuid.NewString()},
			RepositoryID: repository.ID, UserID: repository.UserID.Int64, WorkspaceID: workspace,
			CatalogKey: flowhost.CatalogCoding, SourceRevision: strings.Repeat("a", 40),
		}, flowhost.Catalog{Key: flowhost.CatalogCoding, Family: flowhost.CatalogCoding, SystemFlows: []string{"merge"},
			Executable: "/opt/smithers/coding", ArtifactDigest: strings.Repeat("b", 64), ServiceName: "coding"}
}

type flowHostStopFunc func(context.Context, flowhost.Binding) error

func (f flowHostStopFunc) StopFlowHost(ctx context.Context, binding flowhost.Binding) error {
	return f(ctx, binding)
}

// oldestSnapshotSeconds is how long the oldest statement or transaction that
// holds a snapshot in this database has held it. A statement blocked in
// pg_advisory_lock is one; a pooled connection that is merely idle is not.
func oldestSnapshotSeconds(t *testing.T, observer *corePoolObserver) float64 {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), corePoolObserveBound)
	defer cancel()
	var seconds float64
	require.NoError(t, observer.conn.QueryRow(ctx, `
		SELECT COALESCE(max(EXTRACT(EPOCH FROM clock_timestamp() - COALESCE(xact_start, query_start))), 0)::float8
		FROM pg_stat_activity
		WHERE datname = current_database() AND backend_xmin IS NOT NULL AND pid <> pg_backend_pid()`).Scan(&seconds))
	return seconds
}

// contender is one duty run on its own goroutine, timed from a shared start.
type contender struct {
	done    chan struct{}
	err     error
	elapsed time.Duration
}

func startContender(began time.Time, run func() error) *contender {
	c := &contender{done: make(chan struct{})}
	go func() {
		c.err = run()
		c.elapsed = time.Since(began)
		close(c.done)
	}()
	return c
}

// returnedWithin reports whether the duty has returned, waiting up to within.
// Its err and elapsed are readable only after it reports true.
func (c *contender) returnedWithin(within time.Duration) bool {
	select {
	case <-c.done:
		return true
	default:
	}
	if within <= 0 {
		return false
	}
	select {
	case <-c.done:
		return true
	case <-time.After(within):
		return false
	}
}
