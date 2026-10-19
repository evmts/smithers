package services

import (
	"context"
	"errors"
	"maps"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A PERSON STARTING A MACHINE-OWNED BRANCH, in the api process, at the
// shipped core pool of four (plue#839).
//
// The api serves SSE, so two of its four core connections are residents: the
// broker's LISTEN and the revocation bus's. A member's start of a branch the
// machine service owns then holds a third, the branch-machine mutation
// transaction that locks the member's share FOR SHARE until the start
// commits. The provisioning claim inside that start used to begin a SECOND
// transaction for its advisory lock and so needed two more connections: it
// measured one free, refused with pool_headroom before the runtime was ever
// asked, and the asynchronous create path dropped that refusal without a
// record. That is every deep-canary row that stayed "starting with vm <none>"
// from 10-17 01:19Z.
//
// The claim now takes its advisory lock on the transaction the start already
// holds, so it needs only the connection for its fenced read.

// incidentSeriesRecorder is the duty recorder plus the plue#839 series, each
// keyed by its labels joined with "/": the claims by kind and outcome, the
// retained-guest stops that did not finish, and the pool's refused acquires.
type incidentSeriesRecorder struct {
	*corePoolDutyRecorder
	seriesMu     sync.Mutex
	claims       map[string]int
	stopFailures map[string]int
	poolFailures map[string]int
}

func newIncidentSeriesRecorder() *incidentSeriesRecorder {
	return &incidentSeriesRecorder{corePoolDutyRecorder: newCorePoolDutyRecorder(),
		claims: map[string]int{}, stopFailures: map[string]int{}, poolFailures: map[string]int{}}
}

func (r *incidentSeriesRecorder) ObserveWorkspaceReconcileClaim(kind, outcome string) {
	r.seriesMu.Lock()
	defer r.seriesMu.Unlock()
	r.claims[kind+"/"+outcome]++
}

func (r *incidentSeriesRecorder) ObserveWorkspaceRetainedGuestStopFailure(stage, reason string) {
	r.seriesMu.Lock()
	defer r.seriesMu.Unlock()
	r.stopFailures[stage+"/"+reason]++
}

func (r *incidentSeriesRecorder) ObserveDBPoolAcquireFailure(pool, duty, reason string) {
	r.seriesMu.Lock()
	defer r.seriesMu.Unlock()
	r.poolFailures[pool+"/"+duty+"/"+reason]++
}

func (r *incidentSeriesRecorder) snapshot() (claims, stopFailures, poolFailures map[string]int) {
	r.seriesMu.Lock()
	defer r.seriesMu.Unlock()
	return maps.Clone(r.claims), maps.Clone(r.stopFailures), maps.Clone(r.poolFailures)
}

// countingStartRuntime answers every create the way a full fleet does, and
// counts the creates that reached it. A create that reaches it is the proof
// the claim was admitted; the full fleet keeps the row non-terminal, as
// production's no_capacity does.
type countingStartRuntime struct {
	workspaceapi.WorkspaceRuntime
	creates atomic.Int32
}

func (r *countingStartRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (r *countingStartRuntime) CreateWorkspace(context.Context, workspaceapi.WorkspaceSpec) (workspaceapi.Workspace, error) {
	r.creates.Add(1)
	return workspaceapi.Workspace{}, pkgerrors.NoCapacity("the fleet is full")
}

func TestAPersonStartOfAMachineOwnedBranchIsAdmittedAtTheShippedCorePool(t *testing.T) {
	for _, shape := range []struct {
		name string
		// foreignStore is Plue's hosted composition: the workspace store
		// reads through the adapter's own pool, not the core pool.
		foreignStore bool
	}{
		{name: "hosted store on its own pool", foreignStore: true},
		{name: "install store on the core pool", foreignStore: false},
	} {
		t.Run(shape.name, func(t *testing.T) {
			core, observer := shippedCorePool(t)
			store := core
			if shape.foreignStore {
				openCtx, cancelOpen := context.WithTimeout(context.Background(), corePoolObserveBound)
				adapter, err := postgresfixture.Open(openCtx, observer.url, 1)
				cancelOpen()
				require.NoError(t, err)
				t.Cleanup(adapter.Close)
				store = adapter
			}
			person, repo := setupTestUserAndRepo(t, core)
			recorder := newIncidentSeriesRecorder()
			runtime := &countingStartRuntime{}
			svc := newWorkspaceServiceForTests(db.New(store),
				WithWorkspaceTransactions(core),
				WithBranchMachineProviders(branchMachineTestProviders()),
				WithWorkspaceRuntime(runtime),
				WithWorkspaceSandboxMetrics(recorder))

			ctx, cancel := context.WithTimeout(context.Background(), budgetProgressBound)
			defer cancel()
			row, err := svc.createWorkspaceRow(ctx, db.CreateWorkspaceParams{RepositoryID: repo, UserID: person,
				TargetBookmark: "scratch/person/start", Kind: "container", Status: "starting"})
			require.NoError(t, err)
			owner, err := db.New(core).GetBranchMachineOwner(ctx)
			require.NoError(t, err)
			require.Equal(t, owner, row.UserID, "the row is not machine-owned, so this case proves nothing")
			require.NotEqual(t, person, row.UserID)

			// The api's two residents, then the start.
			startProcessLifetimeResidents(t, core)
			started := time.Now()
			_, err = svc.ensureWorkspaceRunning(ctx, row, CreateWorkspaceSessionInput{UserID: person})

			require.Zero(t, recorder.stallCount(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom),
				"the start's claim was refused for want of headroom beside the residents and its own mutation")
			claims, _, poolFailures := recorder.snapshot()
			require.Equal(t, map[string]int{"start/admitted": 1}, claims)
			require.Empty(t, poolFailures, "the start's acquires were refused")
			require.False(t, errors.Is(err, errWorkspaceProvisionInProgress), "the claim was refused: %v", err)
			require.Equal(t, int32(1), runtime.creates.Load(), "the start never reached the runtime")
			require.True(t, isNoCapacityError(err), "the start did not end with the fleet's own answer: %v", err)
			require.Less(t, time.Since(started), workspaceProvisionAcquireTimeout,
				"the start waited out an acquire bound, so something parked on the pool")

			// Nothing the start took is still held: the advisory lock went
			// with the mutation transaction, and no reservation is left.
			require.Eventually(t, func() bool {
				return core.Stat().AcquiredConns() == residentCorePoolConnections
			}, corePoolObserveBound, 10*time.Millisecond, "the start left a core connection behind")
			require.Zero(t, svc.provisionTasks.reservedConnections(), "the admitted claim kept its reservation")
			require.Zero(t, grantedAdvisoryHolders(t, observer, "workspace-provision:"+row.ID),
				"the claim's advisory lock outlived the start")
		})
	}
}

// A RETAINED-GUEST STOP REFUSED FOR HEADROOM IS THREE SERIES (plue#839).
//
// The worker refused these stops 21,600 times an hour and the only trace was a
// WARN. The same refusal now moves the claim series by kind, the stop failure
// series by stage and reason, and the pool's refused-acquire series, and the
// converging pass is counted as admitted, not as a failure.
func TestRefusedRetainedGuestStopsAreCountedByKindStageAndPool(t *testing.T) {
	pool, _ := shippedCorePool(t)
	listed := realRetainedGuestStopRow(t, pool, "corepool-series")
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	runtime := &interruptedReleaseRuntime{guest: guest}
	recorder := newIncidentSeriesRecorder()
	svc := newWorkspaceServiceForTests(db.New(pool),
		WithWorkspaceRuntime(runtime),
		WithWorkspaceTransactions(pool),
		WithWorkspaceSandboxMetrics(recorder))
	startProcessLifetimeResidents(t, pool)

	// A third holder takes the pool below one claim.
	holdCtx, cancelHold := context.WithTimeout(context.Background(), corePoolObserveBound)
	third, err := pool.Acquire(holdCtx)
	cancelHold()
	require.NoError(t, err)
	var releaseOnce sync.Once
	releaseThird := func() { releaseOnce.Do(third.Release) }
	t.Cleanup(releaseThird)

	pass := func() {
		t.Helper()
		done := make(chan error, 1)
		go func() { done <- svc.ReconcileWorkspaceProvisioning(context.Background()) }()
		select {
		case err := <-done:
			require.NoError(t, err)
		case <-time.After(4 * workspaceProvisionAcquireTimeout):
			t.Fatal("a reconcile pass never returned")
		}
	}
	pass()
	pass()
	require.Equal(t, workspaceapi.WorkspaceRunning, guest.state, "a refused claim stopped the guest")
	claims, stopFailures, poolFailures := recorder.snapshot()
	require.Equal(t, map[string]int{"retained_guest_stop/pool_headroom": 2}, claims)
	require.Equal(t, map[string]int{"acquire_connection/core_pool_exhausted": 2}, stopFailures)
	require.Equal(t, map[string]int{"core/workspace_provision_claim/headroom": 2}, poolFailures)

	releaseThird()
	pass()
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state, "the stop never converged once the pool had room")
	require.Equal(t, int32(1), runtime.stops.Load())
	door, _ := retainedGuestStopPending(listed)
	after, err := db.New(pool).GetWorkspace(context.Background(), listed.ID)
	require.NoError(t, err)
	require.Equal(t, door.confirmed, after.FailureMessage.String)
	claims, stopFailures, poolFailures = recorder.snapshot()
	require.Equal(t, map[string]int{"retained_guest_stop/pool_headroom": 2, "retained_guest_stop/admitted": 1}, claims)
	require.Equal(t, map[string]int{"acquire_connection/core_pool_exhausted": 2}, stopFailures,
		"the confirmed stop was counted as a failure")
	require.Equal(t, map[string]int{"core/workspace_provision_claim/headroom": 2}, poolFailures)
}
