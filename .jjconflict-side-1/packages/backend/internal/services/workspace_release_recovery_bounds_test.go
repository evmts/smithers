package services

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// releasingRecoveryRow is the state the ORIGINAL release recovery re-drives:
// an owner a stopped API left 'releasing', still bound to its placement.
func releasingRecoveryRow(id, vmID string) db.Workspace {
	row := sampleDBWorkspace(id)
	row.Status, row.VmID, row.ProvisioningStage = "releasing", vmID, ""
	row.UpdatedAt = time.Now().Add(-time.Hour)
	return row
}

// callBudget is the deadline one runtime call was handed.
type callBudget struct {
	remaining time.Duration
	bounded   bool
}

// budgetRecordingRuntime records the budget the service gave every runtime
// call on the release-recovery path, in order.
type budgetRecordingRuntime struct {
	*interruptedReleaseRuntime
	mu       sync.Mutex
	inspects []callBudget
	stops    []callBudget
}

func (r *budgetRecordingRuntime) record(ctx context.Context) callBudget {
	deadline, ok := ctx.Deadline()
	if !ok {
		return callBudget{}
	}
	return callBudget{remaining: time.Until(deadline), bounded: true}
}

func (r *budgetRecordingRuntime) InspectWorkspace(ctx context.Context, id string) (workspaceapi.Workspace, error) {
	budget := r.record(ctx)
	r.mu.Lock()
	r.inspects = append(r.inspects, budget)
	r.mu.Unlock()
	return r.interruptedReleaseRuntime.InspectWorkspace(ctx, id)
}

func (r *budgetRecordingRuntime) StopWorkspace(ctx context.Context, id string) error {
	budget := r.record(ctx)
	r.mu.Lock()
	r.stops = append(r.stops, budget)
	r.mu.Unlock()
	return r.interruptedReleaseRuntime.StopWorkspace(ctx, id)
}

func (r *budgetRecordingRuntime) calls() ([]callBudget, []callBudget) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]callBudget(nil), r.inspects...), append([]callBudget(nil), r.stops...)
}

// releasingRecoveryService wires the original release path's row and runtime
// to the production store double every other recovery test uses.
func releasingRecoveryService(t *testing.T, row db.Workspace, runtime workspaceapi.WorkspaceRuntime) (*WorkspaceService, *interruptedReleaseQuerier) {
	t.Helper()
	live := row
	rollout := &rolloutRecoveryQuerier{mockWorkspaceQuerier: provisioningTestQuerier(nil), workspace: row}
	q := &interruptedReleaseQuerier{rolloutRecoveryQuerier: rollout, live: &live}
	rollout.getWorkspaceFn = func(context.Context, string) (db.Workspace, error) { return live, nil }
	return newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime)), q
}

// THE REMAINING UNBOUNDED WAIT. 84 bounded the NEW retained-guest stop, and
// the confirming read has carried workspaceReleaseConfirmTimeout since it was
// written — but the ORIGINAL release recovery's two calls were still
// unbounded: its opening InspectWorkspace and its stopRuntimeWorkspaceLocked
// both received the reconciler's own context.
//
// That context is the process lifetime: runWorkspaceProvisioningReconciler
// passes it straight through and the runtime port applies no deadline of its
// own. So one hosted adapter that never answers held the tick, the
// provisioning slot it occupies and the per-row locks it holds — and with them
// every other row in the listing — for as long as the process lived. Each call
// now carries a written bound, so the whole per-row attempt is finite, and the
// bounds are derived from the CALLER's context so shutdown still reaches a
// blocked call.
func TestInterruptedReleaseRecoveryBoundsEveryRuntimeCall(t *testing.T) {
	t.Run("a caller with no deadline still gets bounded stages", func(t *testing.T) {
		base := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceStopped, disk: "retained"}}
		runtime := &budgetRecordingRuntime{interruptedReleaseRuntime: base}
		svc, q := releasingRecoveryService(t, releasingRecoveryRow("ws-releasing-bounds", "vm-releasing-1"), runtime)

		// The reconciler's own context, which is what production hands it.
		ctx := context.Background()
		_, hasDeadline := ctx.Deadline()
		require.False(t, hasDeadline, "the reconciler tick carries no deadline; the calls must carry their own")

		require.NoError(t, svc.ReconcileWorkspaceProvisioning(ctx))
		require.Len(t, q.fence, 1, "the release still converges: one fenced verdict")
		require.Equal(t, workspaceReleaseInterruptedMessage, q.live.FailureMessage.String)

		inspects, stops := runtime.calls()
		require.Len(t, inspects, 2, "the opening read and the confirming read")
		require.Len(t, stops, 1)
		for i, call := range append(append([]callBudget(nil), inspects...), stops...) {
			require.Truef(t, call.bounded, "runtime call %d ran with no deadline at all", i)
			require.Greaterf(t, call.remaining, time.Duration(0), "runtime call %d got an expired budget", i)
		}
		require.LessOrEqual(t, inspects[0].remaining, workspaceReleaseConfirmTimeout,
			"the opening read is a read, bounded by the read's constant")
		require.LessOrEqual(t, inspects[1].remaining, workspaceReleaseConfirmTimeout,
			"the confirming read keeps its own separate bound")
		require.LessOrEqual(t, stops[0].remaining, workspaceReleaseStopTimeout,
			"the stop is bounded by the stop's constant")
		require.Greater(t, stops[0].remaining, workspaceReleaseConfirmTimeout,
			"and it gets the stop's budget, not the read's: neither bound covers the other")
	})

	// A blocked adapter is abandoned on the caller's cancel, with no verdict
	// written and the row left exactly where the backlog can find it again.
	t.Run("a blocked adapter is abandoned when the caller is cancelled", func(t *testing.T) {
		records := captureReconcilerLogs(t)
		base := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}}
		runtime := &blockingStopRuntime{interruptedReleaseRuntime: base, entered: make(chan struct{}, 1)}
		svc, q := releasingRecoveryService(t, releasingRecoveryRow("ws-releasing-blocked", "vm-releasing-2"), runtime)

		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			_ = svc.ReconcileWorkspaceProvisioning(ctx)
		}()
		select {
		case <-runtime.entered:
		case <-time.After(10 * time.Second):
			t.Fatal("the release recovery never reached the runtime stop")
		}
		runtime.mu.Lock()
		deadline, bounded := runtime.deadline, runtime.hadOne
		runtime.mu.Unlock()
		require.True(t, bounded, "the release recovery's stop ran unbounded; one wedged adapter starves every other row")
		require.LessOrEqual(t, time.Until(deadline), workspaceReleaseStopTimeout)
		require.Greater(t, time.Until(deadline), time.Duration(0))

		cancel()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Fatal("cancelling the reconciler did not end the blocked release stop")
		}
		require.Empty(t, q.fence, "an abandoned attempt publishes no verdict and no receipt")
		require.Equal(t, "releasing", q.live.Status, "the row stays in the backlog for the next process")
		require.False(t, q.live.FailureMessage.Valid)
		require.Equal(t, "retained", base.guest.disk)
		for _, record := range warnings(records, "workspace release recovery failed") {
			requireNoLeak(t, record)
		}
	})
}

// The reconcile loop's two LEGACY records. Both dumped the owner id and the
// raw error, and both paths end in a hosted runtime call over HTTP, so the
// sentence can carry an endpoint, a bearer credential, a request id and a
// customer's own prose — on every tick, because a refusal here repeats until
// the row converges. They now carry the same finite shape 84 gave the
// retained-guest stop, and they still say which attempt refused and why.
func TestReconcileLoopLegacyRecordsAreFiniteAndLeakNothing(t *testing.T) {
	t.Run("the original release recovery", func(t *testing.T) {
		records := captureReconcilerLogs(t)
		guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
		runtime := &interruptedReleaseRuntime{guest: guest, stopErrs: []error{maliciousAdapterError()}}
		svc, q := releasingRecoveryService(t, releasingRecoveryRow(leakRowID, leakVMID), runtime)

		require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
		require.Empty(t, q.fence, "a refused stop publishes no verdict")
		require.Equal(t, "releasing", q.live.Status)

		logged := warnings(records, "workspace release recovery failed")
		require.Len(t, logged, 1, "the refusal is reported exactly once per tick")
		requireNoLeak(t, logged[0])
		require.Equal(t, string(interruptedReleaseStageRecoverRelease), logged[0].attrs["stage"],
			"the stage names which recovery refused")
		require.Equal(t, "internal", logged[0].attrs["reason"],
			"an unclassifiable adapter refusal still reports a REGISTERED code, not its sentence")
	})

	t.Run("the failed-start cleanup retry", func(t *testing.T) {
		records := captureReconcilerLogs(t)
		guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
		runtime := &interruptedReleaseRuntime{guest: guest, stopErrs: []error{maliciousAdapterError()}}
		row := interruptedReleaseRow(leakRowID, leakVMID)
		row.ProvisioningStage = workspaceStartCleanupPending
		svc, q := releasingRecoveryService(t, row, runtime)

		require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
		require.Empty(t, q.fence)

		logged := warnings(records, "failed workspace cleanup retry failed")
		require.Len(t, logged, 1)
		requireNoLeak(t, logged[0])
		require.Equal(t, string(interruptedReleaseStageReapFailedStart), logged[0].attrs["stage"])
		require.NotEmpty(t, logged[0].attrs["reason"])
	})
}
