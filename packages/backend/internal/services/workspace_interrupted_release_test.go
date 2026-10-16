package services

import (
	"context"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// interruptedReleaseGuest is the live guest an interrupted release left
// behind, with the things a stop must NOT touch kept beside its state: the
// retained root disk, the branch history and the cold snapshots. The runtime
// contract says a stop powers the guest off and keeps all three (the
// controller's stop releases the compute reservation and leaves the retained
// disk charged, then checkpoints), so a test that only watched the state could
// not tell a stop from a delete.
type interruptedReleaseGuest struct {
	state     workspaceapi.WorkspaceState
	disk      string
	history   []string
	snapshots int
}

// interruptedReleaseRuntime answers for one guest over the workspace runtime
// port. stopErrs is consumed one per stop, so a transient refusal can be
// followed by a success without the test reaching into the double mid-call.
type interruptedReleaseRuntime struct {
	workspaceapi.WorkspaceRuntime
	guest      *interruptedReleaseGuest
	observedID string
	inspectErr error
	stopErrs   []error
	stops      atomic.Int32
	deletes    atomic.Int32
	snapshots  atomic.Int32
}

func (r *interruptedReleaseRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (r *interruptedReleaseRuntime) InspectWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	if r.inspectErr != nil {
		return workspaceapi.Workspace{}, r.inspectErr
	}
	observed := id
	if r.observedID != "" {
		observed = r.observedID
	}
	return workspaceapi.Workspace{ID: observed, State: r.guest.state}, nil
}

func (r *interruptedReleaseRuntime) StopWorkspace(context.Context, string) error {
	r.stops.Add(1)
	if len(r.stopErrs) > 0 {
		err := r.stopErrs[0]
		r.stopErrs = r.stopErrs[1:]
		if err != nil {
			return err
		}
	}
	// A stop powers the guest off. It keeps the disk, the history and the
	// snapshots, and it is why the compute reservation comes back.
	r.guest.state = workspaceapi.WorkspaceStopped
	return nil
}

func (r *interruptedReleaseRuntime) DeleteWorkspace(context.Context, string) error {
	r.deletes.Add(1)
	r.guest.disk, r.guest.history, r.guest.snapshots = "", nil, 0
	return nil
}

func (r *interruptedReleaseRuntime) CaptureWorkspace(context.Context, string) error {
	r.snapshots.Add(1)
	r.guest.snapshots++
	return nil
}

// interruptedReleaseQuerier is the production store's fenced failure write and
// nothing else. Every workspace write the service can make is recorded, so a
// test can assert that the ONLY one is the fenced record of the confirmed
// stop: no status move, no stage write, no second capture.
type interruptedReleaseQuerier struct {
	*rolloutRecoveryQuerier
	live   *db.Workspace
	fence  []db.FailWorkspaceIfUnchangedParams
	stages []string
	status []string
}

func (q *interruptedReleaseQuerier) FailWorkspaceIfUnchanged(_ context.Context, arg db.FailWorkspaceIfUnchangedParams) (db.Workspace, error) {
	q.fence = append(q.fence, arg)
	if arg.ID != q.live.ID || arg.ExpectedStatus != q.live.Status ||
		arg.ExpectedVmID != q.live.VmID || !arg.ExpectedUpdatedAt.Equal(q.live.UpdatedAt) {
		return db.Workspace{}, pgx.ErrNoRows
	}
	q.live.Status = "failed"
	q.live.FailureCode = pgtype.Text{String: arg.FailureCode, Valid: true}
	q.live.FailureMessage = pgtype.Text{String: arg.FailureMessage, Valid: true}
	q.live.UpdatedAt = time.Now()
	return *q.live, nil
}

func (q *interruptedReleaseQuerier) UpdateWorkspaceProvisioningStage(_ context.Context, arg db.UpdateWorkspaceProvisioningStageParams) (db.Workspace, error) {
	q.stages = append(q.stages, arg.ProvisioningStage)
	q.live.ProvisioningStage = arg.ProvisioningStage
	return *q.live, nil
}

func (q *interruptedReleaseQuerier) UpdateWorkspaceStatus(_ context.Context, arg db.UpdateWorkspaceStatusParams) (db.Workspace, error) {
	q.status = append(q.status, arg.Status)
	q.live.Status = arg.Status
	return *q.live, nil
}

// interruptedReleaseRow is production's exact shape for this cohort: an owner
// the release wrote off `failed` with its own recorded sentence, no cleanup
// stage, and the placement the release deliberately retained.
func interruptedReleaseRow(id, vmID string) db.Workspace {
	row := sampleDBWorkspace(id)
	row.Status, row.VmID, row.ProvisioningStage = "failed", vmID, ""
	row.FailureCode = pgtype.Text{String: string(pkgerrors.CodeConflict), Valid: true}
	row.FailureMessage = pgtype.Text{String: workspaceReleaseInterruptedMessage, Valid: true}
	row.UpdatedAt = time.Now().Add(-time.Hour)
	return row
}

func interruptedReleaseService(t *testing.T, row db.Workspace, runtime workspaceapi.WorkspaceRuntime) (*WorkspaceService, *interruptedReleaseQuerier) {
	t.Helper()
	live := row
	rollout := &rolloutRecoveryQuerier{mockWorkspaceQuerier: provisioningTestQuerier(nil), workspace: row}
	q := &interruptedReleaseQuerier{rolloutRecoveryQuerier: rollout, live: &live}
	rollout.getWorkspaceFn = func(context.Context, string) (db.Workspace, error) { return live, nil }
	return newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime)), q
}

// THE PRODUCTION DEFECT. reconcileWorkspaceRelease published its terminal
// Conflict over a stop it never confirmed, and that verdict is terminal in the
// strict sense: `failed` with no cleanup stage was in no backlog, while the
// release retains vm_id on purpose so the disk and the unfinished capture
// survive. So the guest kept RUNNING, kept its compute reservation, and
// nothing looked at the placement again.
//
// The repair finishes what the release intended and nothing more: it stops the
// guest, requires a positive receipt, and records that receipt. The owner
// stays `failed`, the placement stays bound, and the disk, history and
// snapshots are exactly as they were — the compute comes back because the
// guest is actually down, not because its owner failed.
func TestInterruptedReleaseStopsTheGuestItLeftRunning(t *testing.T) {
	guest := &interruptedReleaseGuest{
		state: workspaceapi.WorkspaceRunning,
		// A sentinel a delete would take with it.
		disk:      "retained-working-copy",
		history:   []string{"change-a", "change-b"},
		snapshots: 2,
	}
	runtime := &interruptedReleaseRuntime{guest: guest}
	svc, q := interruptedReleaseService(t, interruptedReleaseRow("ws-interrupted-release", "vm-interrupted-1"), runtime)

	require.True(t, interruptedReleaseStopPending(*q.live), "production's shape is the cohort this repair activates on")
	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))

	require.Equal(t, int32(1), runtime.stops.Load(), "the guest the release left running is stopped")
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state)
	require.Equal(t, int32(0), runtime.deletes.Load(), "a release retains the disk; it never deletes the guest")
	require.Equal(t, int32(0), runtime.snapshots.Load(), "no successful final capture is invented")
	require.Equal(t, "retained-working-copy", guest.disk)
	require.Equal(t, []string{"change-a", "change-b"}, guest.history)
	require.Equal(t, 2, guest.snapshots)

	require.Equal(t, "failed", q.live.Status, "the recorded verdict is not re-decided")
	require.Equal(t, "vm-interrupted-1", q.live.VmID, "the placement stays bound")
	require.Equal(t, "", q.live.ProvisioningStage, "no cleanup stage is invented")
	require.Equal(t, string(pkgerrors.CodeConflict), q.live.FailureCode.String, "the recorded code is reused, not re-derived")
	require.Equal(t, workspaceReleaseInterruptedStoppedMessage, q.live.FailureMessage.String,
		"the original release intent stays legible and the receipt is recorded beside it")
	require.Empty(t, q.stages, "the repair writes no provisioning stage")
	require.Empty(t, q.status, "the repair moves no status")
	require.Len(t, q.fence, 1, "exactly one fenced write")

	// Bounded: the receipt takes the row out of the cohort, so the next tick
	// makes no second stop attempt and no second write.
	require.False(t, interruptedReleaseStopPending(*q.live))
	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
	require.Equal(t, int32(1), runtime.stops.Load())
	require.Len(t, q.fence, 1)
}

// No receipt, no record. An ambiguous absence is the 404/410 conflation
// ErrWorkspaceNotFound carries, and the stop tolerates exactly that sentinel
// as success — so a repair that trusted the stop's nil would seal the row
// while its guest is still up. A typed lost worker and a read that did not
// complete say the same thing: unknown. Each leaves the row in the cohort,
// which IS the retry, and the next tick converges it once the host answers.
func TestInterruptedReleaseRecordsNothingWithoutAStopReceipt(t *testing.T) {
	for _, tc := range []struct {
		name     string
		inspect  error
		evidence releaseStopEvidence
	}{
		{
			name:     "lease lost is not an authoritative absence",
			inspect:  hostedLostRuntimeError(http.StatusGone, "host_lease_lost"),
			evidence: releaseStopAbsenceAmbiguous,
		},
		{
			name:     "a vanished placement is the same sentinel, so it is not a receipt either",
			inspect:  hostedLostRuntimeError(http.StatusNotFound, "not_found"),
			evidence: releaseStopAbsenceAmbiguous,
		},
		{
			name:     "typed lost worker",
			inspect:  &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable, Code: "host_lease_lost"},
			evidence: releaseStopWorkerLost,
		},
		{
			name:     "the confirming read did not complete",
			inspect:  context.DeadlineExceeded,
			evidence: releaseStopUnreadable,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
			runtime := &interruptedReleaseRuntime{guest: guest, inspectErr: tc.inspect,
				// The stop answers the way an adapter answers one it could not
				// confirm, and stopRuntimeWorkspaceLocked tolerates it.
				stopErrs: []error{workspaceapi.ErrWorkspaceNotFound}}
			svc, q := interruptedReleaseService(t, interruptedReleaseRow("ws-interrupted-unconfirmed", "vm-interrupted-2"), runtime)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Empty(t, q.fence, "an unconfirmed stop is not sealed as finished")
			require.Equal(t, workspaceReleaseInterruptedMessage, q.live.FailureMessage.String)
			require.Equal(t, "vm-interrupted-2", q.live.VmID, "the placement is never cleared blindly")
			require.Equal(t, "retained", guest.disk)
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Equal(t, int32(1), runtime.stops.Load(), "one attempt per tick, not a loop")

			evidence, err := svc.confirmRecoveredReleaseStop(context.Background(), *q.live)
			require.Error(t, err)
			require.Equal(t, tc.evidence, evidence)

			// The row is still in the cohort, so the backlog is the retry.
			require.True(t, interruptedReleaseStopPending(*q.live))
			runtime.inspectErr, runtime.stopErrs = nil, nil
			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Equal(t, int32(2), runtime.stops.Load())
			require.Equal(t, workspaceapi.WorkspaceStopped, guest.state)
			require.Len(t, q.fence, 1, "the receipt lands on the tick that earns it")
			require.Equal(t, workspaceReleaseInterruptedStoppedMessage, q.live.FailureMessage.String)
		})
	}
}

// A guest the runtime still reports up is not a stop, whatever the stop call
// answered. Nothing is recorded and nothing is freed.
func TestInterruptedReleaseRecordsNothingWhileTheGuestIsStillUp(t *testing.T) {
	for _, state := range []workspaceapi.WorkspaceState{
		workspaceapi.WorkspaceRunning, workspaceapi.WorkspaceStarting,
		workspaceapi.WorkspaceStopping, workspaceapi.WorkspaceRecoveryRequired,
	} {
		t.Run(string(state), func(t *testing.T) {
			guest := &interruptedReleaseGuest{state: state}
			// The stop answers success and leaves the guest where it is, which
			// is the shape of a worker that acknowledged and did not act.
			runtime := &interruptedReleaseRuntime{guest: guest, stopErrs: []error{workspaceapi.ErrWorkspaceStopped}}
			svc, q := interruptedReleaseService(t, interruptedReleaseRow("ws-interrupted-up", "vm-interrupted-3"), runtime)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Empty(t, q.fence)
			require.Equal(t, state, guest.state)
			require.True(t, interruptedReleaseStopPending(*q.live))
		})
	}
}

// A transient refusal is retried, not escalated and not sealed. The stop
// failing at all is the pre-existing outcome this repair keeps.
func TestInterruptedReleaseRetriesATransientStopFailure(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{name: "worker unreachable", err: &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable, Code: "service_unavailable"}},
		{name: "controller refused the stop", err: &sandbox.StatusError{StatusCode: http.StatusBadGateway, Code: "bad_gateway"}},
		{name: "the stop did not complete", err: context.DeadlineExceeded},
	} {
		t.Run(tc.name, func(t *testing.T) {
			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
			runtime := &interruptedReleaseRuntime{guest: guest, stopErrs: []error{tc.err}}
			svc, q := interruptedReleaseService(t, interruptedReleaseRow("ws-interrupted-transient", "vm-interrupted-4"), runtime)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()),
				"a refused stop is logged and retried, never surfaced as a reconciler failure")
			require.Equal(t, int32(1), runtime.stops.Load())
			require.Empty(t, q.fence)
			require.Equal(t, workspaceapi.WorkspaceRunning, guest.state)
			require.Equal(t, "retained", guest.disk)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Equal(t, int32(2), runtime.stops.Load())
			require.Equal(t, workspaceapi.WorkspaceStopped, guest.state)
			require.Len(t, q.fence, 1)
		})
	}
}

// Somebody else's transition owns the row. A resume, a replacement placement,
// a newer generation of the same owner: each of them matches no fence and this
// repair then does NOTHING — it does not stop a guest the new owner booted and
// it does not record a receipt for it.
func TestInterruptedReleaseTakesNoActionOnANewerOwner(t *testing.T) {
	for _, tc := range []struct {
		name  string
		shift func(*db.Workspace)
		stops int32
	}{
		{
			name:  "a concurrent resume took the row",
			shift: func(row *db.Workspace) { row.Status, row.UpdatedAt = "running", time.Now() },
		},
		{
			name:  "the owner is being released again",
			shift: func(row *db.Workspace) { row.Status, row.UpdatedAt = "releasing", time.Now() },
		},
		{
			name:  "a newer placement replaced the one the release retained",
			shift: func(row *db.Workspace) { row.VmID, row.UpdatedAt = "vm-interrupted-next", time.Now() },
		},
		{
			name: "a newer generation recorded a different reason",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "workspace provisioning failed", Valid: true}
				row.UpdatedAt = time.Now()
			},
		},
		{
			name: "the cleanup contract now owns it",
			shift: func(row *db.Workspace) {
				row.ProvisioningStage, row.UpdatedAt = workspaceStartCleanupPending, time.Now()
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
			runtime := &interruptedReleaseRuntime{guest: guest}
			row := interruptedReleaseRow("ws-interrupted-moved", "vm-interrupted-5")
			svc, q := interruptedReleaseService(t, row, runtime)
			tc.shift(q.live)

			require.NoError(t, svc.reconcileInterruptedReleaseStop(context.Background(), row))
			require.Equal(t, int32(0), runtime.stops.Load(), "the newer transition owns the row")
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Empty(t, q.fence)
			require.Equal(t, workspaceapi.WorkspaceRunning, guest.state)
		})
	}
}

// The fence is still what decides. A transition that lands WHILE the stop is
// in flight matches nothing, and then nothing is recorded — but the guest was
// already asked to stop, which is the request the release had already made and
// is not reversed here.
func TestInterruptedReleaseRecordIsFencedOnTheRowItRead(t *testing.T) {
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning}
	runtime := &interruptedReleaseRuntime{guest: guest}
	row := interruptedReleaseRow("ws-interrupted-raced", "vm-interrupted-6")
	svc, q := interruptedReleaseService(t, row, runtime)
	// Land a newer transition between the confirming read and the write.
	svc.runtime = &raceOnStopRuntime{interruptedReleaseRuntime: runtime, onStop: func() {
		q.live.UpdatedAt = time.Now()
	}}

	require.NoError(t, svc.reconcileInterruptedReleaseStop(context.Background(), row))
	require.Len(t, q.fence, 1, "exactly one fenced write is attempted")
	require.Equal(t, "failed", q.fence[0].ExpectedStatus)
	require.Equal(t, "vm-interrupted-6", q.fence[0].ExpectedVmID)
	require.Equal(t, workspaceReleaseInterruptedMessage, q.live.FailureMessage.String,
		"the losing write changes nothing")
}

type raceOnStopRuntime struct {
	*interruptedReleaseRuntime
	onStop func()
}

func (r *raceOnStopRuntime) StopWorkspace(ctx context.Context, id string) error {
	err := r.interruptedReleaseRuntime.StopWorkspace(ctx, id)
	r.onStop()
	return err
}

// Everything else that reads `failed` is untouched. Another recorded reason,
// another failure code, a row with no placement and a row the cleanup contract
// owns are all outside this predicate — the repair is keyed on one writer's
// evidence, never on the failed label, an age or a stage.
func TestInterruptedReleasePredicateExcludesEveryOtherFailedOwner(t *testing.T) {
	for _, tc := range []struct {
		name  string
		shift func(*db.Workspace)
	}{
		{
			name: "a conflict from another writer",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "sandbox placement generation changed", Valid: true}
			},
		},
		{
			name: "the same sentence under another code",
			shift: func(row *db.Workspace) {
				row.FailureCode = pgtype.Text{String: "provisioning_failed", Valid: true}
			},
		},
		{
			name: "a provisioning failure the product already classified",
			shift: func(row *db.Workspace) {
				row.FailureCode = pgtype.Text{String: "no_capacity", Valid: true}
				row.FailureMessage = pgtype.Text{String: "workspace provisioning failed", Valid: true}
			},
		},
		{
			name:  "no recorded reason at all",
			shift: func(row *db.Workspace) { row.FailureCode, row.FailureMessage = pgtype.Text{}, pgtype.Text{} },
		},
		{
			name:  "no placement to stop",
			shift: func(row *db.Workspace) { row.VmID = "" },
		},
		{
			name:  "the failed-start cleanup contract owns it",
			shift: func(row *db.Workspace) { row.ProvisioningStage = workspaceStartCleanupPending },
		},
		{
			name:  "the failed-start cleanup already finished",
			shift: func(row *db.Workspace) { row.ProvisioningStage = workspaceStartCleanupComplete },
		},
		{
			name: "a receipt is already recorded",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: workspaceReleaseInterruptedStoppedMessage, Valid: true}
			},
		},
		{name: "a ready running owner", shift: func(row *db.Workspace) { row.Status = "running" }},
		{name: "a releasing owner the release reconciler owns", shift: func(row *db.Workspace) { row.Status = "releasing" }},
		{name: "a suspended owner", shift: func(row *db.Workspace) { row.Status = "suspended" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := interruptedReleaseRow("ws-interrupted-other", "vm-interrupted-7")
			tc.shift(&row)
			require.False(t, interruptedReleaseStopPending(row))

			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
			runtime := &interruptedReleaseRuntime{guest: guest}
			svc, q := interruptedReleaseService(t, row, runtime)
			require.NoError(t, svc.reconcileInterruptedReleaseStop(context.Background(), row))
			require.Equal(t, int32(0), runtime.stops.Load())
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Empty(t, q.fence)
			require.Equal(t, "retained", guest.disk)
		})
	}
}

// The stored sentence IS the constant. workspaceFailureDetailsFor takes the
// APIError's Message (Error() returns the same string), and
// FailWorkspaceIfUnchanged writes that verbatim — so the predicate is aligned
// with the writer's persisted representation rather than a guess at it. If the
// verdict's wording ever changes, this fails instead of the cohort silently
// going unreachable.
func TestInterruptedReleasePredicateMatchesWhatTheWriterPersists(t *testing.T) {
	details := workspaceFailureDetailsFor(pkgerrors.Conflict(workspaceReleaseInterruptedMessage))
	require.Equal(t, pkgerrors.CodeConflict, details.Code)
	require.Equal(t, workspaceReleaseInterruptedMessage, details.Message)

	row := sampleDBWorkspace("ws-interrupted-written")
	row.Status, row.VmID = "releasing", "vm-interrupted-8"
	row.UpdatedAt = time.Now().Add(-time.Hour)
	live := row
	rollout := &rolloutRecoveryQuerier{mockWorkspaceQuerier: provisioningTestQuerier(nil), workspace: row}
	q := &interruptedReleaseQuerier{rolloutRecoveryQuerier: rollout, live: &live}
	rollout.getWorkspaceFn = func(context.Context, string) (db.Workspace, error) { return live, nil }
	// A guest the stop reports down, so the release publishes its verdict.
	runtime := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceStopped}}
	svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime))

	require.NoError(t, svc.reconcileWorkspaceRelease(context.Background(), row))
	require.Len(t, q.fence, 1)
	require.Equal(t, string(pkgerrors.CodeConflict), q.fence[0].FailureCode)
	require.Equal(t, workspaceReleaseInterruptedMessage, q.fence[0].FailureMessage,
		"the diagnostic constant and the writer are the same string")
}
