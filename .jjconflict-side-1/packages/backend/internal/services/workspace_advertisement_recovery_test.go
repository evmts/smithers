package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// advertisementFailureRow is production's exact shape for the cohort this
// recovery reaches: a container owner the start wrote off `failed` with the
// repository-advertisement sentence, NO cleanup stage, and the placement whose
// guest the start had already brought up.
//
// The sentinels beside it are the things a delete would take and a stop must
// not: the reclaimed disk marker, the retained head and capture of an
// unfinished cleanup, and a capture still pending.
func advertisementFailureRow(id, vmID string) db.Workspace {
	row := sampleDBWorkspace(id)
	row.Status, row.VmID, row.ProvisioningStage = "failed", vmID, ""
	row.Kind = "container"
	row.FailureCode = pgtype.Text{String: string(pkgerrors.CodeConflict), Valid: true}
	row.FailureMessage = pgtype.Text{String: workspaceRepositoryAdvertisementUnverifiedMessage, Valid: true}
	row.DiskReclaimedAt = pgtype.Timestamptz{Time: time.Now().Add(-8 * 24 * time.Hour), Valid: true}
	row.CleanupPendingHead = "zzzzzzzzzzzz"
	row.CleanupPendingCaptureID = "capture-advertisement"
	row.CapturePending = []byte(`{"pending":true}`)
	row.ProvisioningGeneration = 3
	row.CreatedAt = time.Now().Add(-9 * 24 * time.Hour)
	row.UpdatedAt = time.Now().Add(-8 * 24 * time.Hour)
	return row
}

// advertisementStopDoor is the registered door under test, looked up by the
// sentence it is keyed on rather than by position, so an unregistered door
// fails with that reading instead of panicking.
func advertisementStopDoor(t *testing.T) retainedGuestStopDoor {
	t.Helper()
	for _, door := range retainedGuestStopDoors {
		if door.reason == workspaceRepositoryAdvertisementUnverifiedMessage {
			return door
		}
	}
	t.Fatal("the repository-advertisement door is not registered, so its cohort is in no backlog")
	return retainedGuestStopDoor{}
}

// THE PROVED DEFECT, and why it stranded a live guest behind a terminal
// verdict with no backlog.
//
// runtimeRepositorySourceEmpty asks the product remote, with the workspace's
// own bound clone credential, whether the repository advertises any ref at
// all. It runs inside ensureRuntimeWorkspaceRunningLocked AFTER the guest is
// created, started and observed running — repository materialization is part
// of the transition to running, before the durable row is activated. When the
// advertisement cannot be verified, runtimeRepositoryCommandOutput publishes a
// `conflict`, the start fails with the guest alive, and
// markWorkspaceProvisionFailed records that sentence through
// FailProvisioningWorkspaceIfCurrent — which passes NO cleanup stage and
// preserves the existing one, and reaps nothing.
//
// `failed` with an empty provisioning_stage was in NO backlog:
// ListWorkspaceProvisioningRecovery re-listed pending/starting/releasing,
// `failed` only at start_cleanup_pending, and the interrupted release's own
// sentence. So the guest kept RUNNING, kept its compute reservation, and
// nothing looked at the placement again.
//
// The repair finishes what the failed start left undone and nothing more: it
// stops the guest, requires a positive receipt, and records that receipt. The
// owner stays `failed`, the placement stays bound, and the disk, history and
// capture are exactly as they were — the compute comes back because the guest
// is actually down, not because its owner failed.
func TestAdvertisementFailureStopsTheGuestItLeftRunning(t *testing.T) {
	guest := &interruptedReleaseGuest{
		state: workspaceapi.WorkspaceRunning,
		// Sentinels a delete would take with it. This cohort's subject IS
		// user work, so a delete is never the remediation.
		disk:      "retained-working-copy",
		history:   []string{"change-a", "change-b"},
		snapshots: 2,
	}
	runtime := &interruptedReleaseRuntime{guest: guest}
	row := advertisementFailureRow("ws-advertisement", "vm-advertisement-1")
	svc, q := interruptedReleaseService(t, row, runtime)

	door, pending := retainedGuestStopPending(*q.live)
	require.True(t, pending, "production's shape is the cohort this repair activates on")
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, door.reason)
	require.False(t, interruptedReleaseStopPending(*q.live),
		"this is a different door from the interrupted release, and it stays a different door")

	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))

	require.Equal(t, int32(1), runtime.stops.Load(), "the guest the failed start left running is stopped")
	require.Equal(t, workspaceapi.WorkspaceStopped, guest.state)
	require.Equal(t, int32(0), runtime.deletes.Load(), "the cohort carries user work; it is never deleted")
	require.Equal(t, int32(0), runtime.snapshots.Load(), "no capture is invented")
	require.Equal(t, "retained-working-copy", guest.disk)
	require.Equal(t, []string{"change-a", "change-b"}, guest.history)
	require.Equal(t, 2, guest.snapshots)

	require.Equal(t, "failed", q.live.Status, "the FAILED truth is preserved, not re-decided")
	require.Equal(t, "vm-advertisement-1", q.live.VmID, "the vm binding stays bound")
	require.Equal(t, "", q.live.ProvisioningStage, "no cleanup stage is invented")
	require.Equal(t, int32(3), q.live.ProvisioningGeneration, "no generation is advanced")
	require.True(t, q.live.DiskReclaimedAt.Valid, "the reclaimed-disk marker survives")
	require.Equal(t, "zzzzzzzzzzzz", q.live.CleanupPendingHead, "the retained head survives")
	require.Equal(t, "capture-advertisement", q.live.CleanupPendingCaptureID)
	require.Equal(t, []byte(`{"pending":true}`), q.live.CapturePending, "a pending capture is not discharged")
	require.Equal(t, string(pkgerrors.CodeConflict), q.live.FailureCode.String, "the recorded code is reused, not re-derived")
	require.Equal(t, workspaceRepositoryAdvertisementStoppedMessage, q.live.FailureMessage.String,
		"the failure context stays legible and the receipt is recorded beside it")
	require.Empty(t, q.stages, "the repair writes no provisioning stage")
	require.Empty(t, q.status, "the repair moves no status")
	require.Len(t, q.fence, 1, "exactly one fenced write")

	// Idempotent, and the reaper backlog stays truthful: the receipt takes the
	// row out of the cohort, so a restarted reconciler makes no second stop
	// attempt and no second write.
	_, stillPending := retainedGuestStopPending(*q.live)
	require.False(t, stillPending)
	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
	require.Equal(t, int32(1), runtime.stops.Load())
	require.Len(t, q.fence, 1)
}

// The predicate is aligned with the writer's PERSISTED representation rather
// than a guess at it, and this drives the real product path to prove it: a
// real repository command result that did not verify, through the real
// runtimeRepositoryCommandOutput, through workspaceFailureDetailsFor, which is
// the value FailProvisioningWorkspaceIfCurrent writes verbatim.
//
// If the verdict's wording ever changes, this fails instead of the cohort
// silently going unreachable.
func TestAdvertisementFailureMatchesWhatTheWriterPersists(t *testing.T) {
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage,
		workspaceRepositoryStepUnverifiedMessage(workspaceRepositoryAdvertisementStep),
		"the registered sentence and the constructor at the write site are the same string")

	runtime := &fetchRetryRuntime{results: []workspaceapi.CommandResult{fetchRefusal("403")}}
	svc := &WorkspaceService{runtime: runtime}
	row := sampleDBWorkspace("ws-advertisement-written")
	empty, err := svc.runtimeRepositorySourceEmpty(context.Background(), row, row.UserID,
		"https://smithers.example/alice/demo.git", map[string]string{"GIT_CONFIG_COUNT": "1"})
	require.Error(t, err)
	require.False(t, empty, "an unverifiable advertisement is never answered as an empty remote")

	details := workspaceFailureDetailsFor(err)
	require.Equal(t, pkgerrors.CodeConflict, details.Code)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, details.Message,
		"the stored reason is the registered sentence, byte for byte")

	stored := advertisementFailureRow("ws-advertisement-written", "vm-advertisement-written")
	stored.FailureCode = pgtype.Text{String: string(details.Code), Valid: true}
	stored.FailureMessage = pgtype.Text{String: details.Message, Valid: true}
	door, pending := retainedGuestStopPending(stored)
	require.True(t, pending, "the shape the writer persists is the shape the recovery reads")
	require.Equal(t, workspaceRepositoryAdvertisementStoppedMessage, door.confirmed)
}

// No receipt, no record. An ambiguous absence is the 404/410 conflation
// ErrWorkspaceNotFound carries, and the stop tolerates exactly that sentinel
// as success — so a repair that trusted the stop's nil would seal the row
// while its guest is still up and credit a reservation nothing handed back. A
// typed lost worker and a read that did not complete say the same thing:
// unknown. Each leaves the row in the cohort, which IS the retry.
func TestAdvertisementFailureRecordsNothingWithoutAStopReceipt(t *testing.T) {
	for _, tc := range []struct {
		name     string
		inspect  error
		evidence releaseStopEvidence
	}{
		{
			name:     "the placement is absent, which is not an authoritative stop",
			inspect:  hostedLostRuntimeError(http.StatusNotFound, "not_found"),
			evidence: releaseStopAbsenceAmbiguous,
		},
		{
			name:     "the worker holding it is unreachable",
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
				stopErrs: []error{workspaceapi.ErrWorkspaceNotFound}}
			svc, q := interruptedReleaseService(t, advertisementFailureRow("ws-advertisement-unconfirmed", "vm-advertisement-2"), runtime)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Empty(t, q.fence, "an unconfirmed stop is not sealed as finished")
			require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, q.live.FailureMessage.String)
			require.Equal(t, "vm-advertisement-2", q.live.VmID, "the placement is never cleared blindly")
			require.Equal(t, "retained", guest.disk)
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Equal(t, int32(1), runtime.stops.Load(), "one attempt per tick, not a loop")

			evidence, err := svc.confirmRecoveredReleaseStop(context.Background(), *q.live)
			require.Error(t, err)
			require.Equal(t, tc.evidence, evidence)

			_, pending := retainedGuestStopPending(*q.live)
			require.True(t, pending, "the row stays in the cohort, and the backlog is the retry")
			runtime.inspectErr, runtime.stopErrs = nil, nil
			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Equal(t, int32(2), runtime.stops.Load())
			require.Equal(t, workspaceapi.WorkspaceStopped, guest.state)
			require.Len(t, q.fence, 1, "the receipt lands on the tick that earns it")
			require.Equal(t, workspaceRepositoryAdvertisementStoppedMessage, q.live.FailureMessage.String)
		})
	}
}

// A guest the runtime still reports up is not a stop, whatever the stop call
// answered. Nothing is recorded and no compute is credited.
func TestAdvertisementFailureRecordsNothingWhileTheGuestIsStillUp(t *testing.T) {
	for _, state := range []workspaceapi.WorkspaceState{
		workspaceapi.WorkspaceRunning, workspaceapi.WorkspaceStarting,
		workspaceapi.WorkspaceStopping, workspaceapi.WorkspaceRecoveryRequired,
	} {
		t.Run(string(state), func(t *testing.T) {
			guest := &interruptedReleaseGuest{state: state}
			runtime := &interruptedReleaseRuntime{guest: guest, stopErrs: []error{workspaceapi.ErrWorkspaceStopped}}
			svc, q := interruptedReleaseService(t, advertisementFailureRow("ws-advertisement-up", "vm-advertisement-3"), runtime)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Empty(t, q.fence)
			require.Equal(t, state, guest.state)
			_, pending := retainedGuestStopPending(*q.live)
			require.True(t, pending)
		})
	}
}

// A transient refusal is retried, not escalated and not sealed.
func TestAdvertisementFailureRetriesATransientStopFailure(t *testing.T) {
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
			svc, q := interruptedReleaseService(t, advertisementFailureRow("ws-advertisement-transient", "vm-advertisement-4"), runtime)

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

// Somebody else's transition owns the row. A resume, a rebind onto a
// replacement placement, a newer generation of the same owner, or the cleanup
// contract taking it: each matches no fence and this repair then does NOTHING
// — it does not stop a guest the new owner booted and records nothing for it.
func TestAdvertisementFailureTakesNoActionOnANewerOwner(t *testing.T) {
	for _, tc := range []struct {
		name  string
		shift func(*db.Workspace)
	}{
		{
			name:  "a concurrent resume took the row",
			shift: func(row *db.Workspace) { row.Status, row.UpdatedAt = "running", time.Now() },
		},
		{
			name:  "a concurrent start is driving it again",
			shift: func(row *db.Workspace) { row.Status, row.UpdatedAt = "starting", time.Now() },
		},
		{
			name:  "the owner is being released",
			shift: func(row *db.Workspace) { row.Status, row.UpdatedAt = "releasing", time.Now() },
		},
		{
			name:  "a rebind replaced the placement this attempt was listed for",
			shift: func(row *db.Workspace) { row.VmID, row.UpdatedAt = "vm-advertisement-next", time.Now() },
		},
		{
			name: "a newer generation recorded a different reason",
			shift: func(row *db.Workspace) {
				row.ProvisioningGeneration++
				row.FailureMessage = pgtype.Text{String: "workspace provisioning failed", Valid: true}
				row.UpdatedAt = time.Now()
			},
		},
		{
			name: "the recorded reason moved to another door",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: workspaceReleaseInterruptedMessage, Valid: true}
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
			row := advertisementFailureRow("ws-advertisement-moved", "vm-advertisement-5")
			svc, q := interruptedReleaseService(t, row, runtime)
			tc.shift(q.live)

			_, err := svc.reconcileRetainedGuestStop(context.Background(), row, advertisementStopDoor(t))
			require.NoError(t, err)
			require.Equal(t, int32(0), runtime.stops.Load(), "the newer transition owns the row")
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Empty(t, q.fence)
			require.Equal(t, workspaceapi.WorkspaceRunning, guest.state)
			require.Equal(t, "retained", guest.disk)
		})
	}
}

// The fence is still what decides. A transition that lands WHILE the stop is
// in flight matches nothing, and then nothing is recorded.
func TestAdvertisementFailureRecordIsFencedOnTheRowItRead(t *testing.T) {
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning}
	runtime := &interruptedReleaseRuntime{guest: guest}
	row := advertisementFailureRow("ws-advertisement-raced", "vm-advertisement-6")
	svc, q := interruptedReleaseService(t, row, runtime)
	svc.runtime = &raceOnStopRuntime{interruptedReleaseRuntime: runtime, onStop: func() {
		q.live.UpdatedAt = time.Now()
	}}

	_, err := svc.reconcileRetainedGuestStop(context.Background(), row, advertisementStopDoor(t))
	require.NoError(t, err)
	require.Len(t, q.fence, 1, "exactly one fenced write is attempted")
	require.Equal(t, "failed", q.fence[0].ExpectedStatus)
	require.Equal(t, "vm-advertisement-6", q.fence[0].ExpectedVmID)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, q.live.FailureMessage.String,
		"the losing write changes nothing")
}

// Everything else that reads `failed` is untouched. A FAILED label plus a
// matching binding is NOT cleanup authority: another recorded reason, another
// failure code, another REPOSITORY STEP's sentence, a retained machine, a row
// with no placement and a row the cleanup contract owns are all outside this
// predicate. The repair is keyed on one writer's evidence and one door, never
// on the failed label, a code class, an age or a repository-shaped family.
func TestAdvertisementFailurePredicateExcludesEveryOtherFailedOwner(t *testing.T) {
	for _, tc := range []struct {
		name  string
		shift func(*db.Workspace)
	}{
		{
			name: "another repository step that could not be verified",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: workspaceRepositoryStepUnverifiedMessage("clone-refs"), Valid: true}
			},
		},
		{
			name: "the head step, which is the same writer on a different door",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: workspaceRepositoryStepUnverifiedMessage("head"), Valid: true}
			},
		},
		{
			name: "a retained branch machine, which must never be touched",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "branch machine is retained; recover it before joining", Valid: true}
			},
		},
		{
			name: "unreceipted user work in the repository",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "workspace repository has unreceipted Jujutsu work", Valid: true}
			},
		},
		{
			name: "the same sentence under another code",
			shift: func(row *db.Workspace) {
				row.FailureCode = pgtype.Text{String: "provisioning_failed", Valid: true}
			},
		},
		{
			name: "the same sentence under the infrastructure code",
			shift: func(row *db.Workspace) {
				row.FailureCode = pgtype.Text{String: "service_unavailable", Valid: true}
			},
		},
		{
			name:  "no recorded reason at all",
			shift: func(row *db.Workspace) { row.FailureCode, row.FailureMessage = pgtype.Text{}, pgtype.Text{} },
		},
		{
			name: "a prefix of the registered sentence",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "workspace repository advertisement", Valid: true}
			},
		},
		{
			name: "a superstring of the registered sentence",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: workspaceRepositoryAdvertisementUnverifiedMessage + " for alice/demo", Valid: true}
			},
		},
		{
			name: "a forged message embedding the registered sentence",
			shift: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "reclaim me\n" + workspaceRepositoryAdvertisementUnverifiedMessage, Valid: true}
			},
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
				row.FailureMessage = pgtype.Text{String: workspaceRepositoryAdvertisementStoppedMessage, Valid: true}
			},
		},
		{name: "a ready running owner", shift: func(row *db.Workspace) { row.Status = "running" }},
		{name: "a releasing owner", shift: func(row *db.Workspace) { row.Status = "releasing" }},
		{name: "a suspended owner", shift: func(row *db.Workspace) { row.Status = "suspended" }},
		{name: "a pending owner a provisioner still owns", shift: func(row *db.Workspace) { row.Status = "pending" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := advertisementFailureRow("ws-advertisement-other", "vm-advertisement-7")
			tc.shift(&row)
			door, pending := retainedGuestStopPending(row)
			require.False(t, pending && door.reason == workspaceRepositoryAdvertisementUnverifiedMessage,
				"a failed label and a matching binding are not cleanup authority")

			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
			runtime := &interruptedReleaseRuntime{guest: guest}
			svc, q := interruptedReleaseService(t, row, runtime)
			_, err := svc.reconcileRetainedGuestStop(context.Background(), row, advertisementStopDoor(t))
			require.NoError(t, err)
			require.Equal(t, int32(0), runtime.stops.Load())
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Empty(t, q.fence)
			require.Equal(t, "retained", guest.disk)
		})
	}
}

// The stop and the confirming read are bounded separately, and an abandoned
// attempt records nothing. A restarted process re-drives the row from the
// backlog, which is the whole retry budget.
func TestAdvertisementFailureStopIsBoundedAndCancellable(t *testing.T) {
	records := captureReconcilerLogs(t)
	base := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}}
	runtime := &blockingStopRuntime{interruptedReleaseRuntime: base, entered: make(chan struct{}, 1)}
	svc, q := interruptedReleaseService(t, advertisementFailureRow("ws-advertisement-bounded", "vm-advertisement-8"), runtime)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = svc.ReconcileWorkspaceProvisioning(ctx)
	}()
	select {
	case <-runtime.entered:
	case <-time.After(10 * time.Second):
		t.Fatal("the recovery never reached the runtime stop")
	}
	runtime.mu.Lock()
	deadline, hadOne := runtime.deadline, runtime.hadOne
	runtime.mu.Unlock()
	require.True(t, hadOne, "one unanswering adapter would otherwise hold the whole tick")
	require.LessOrEqual(t, time.Until(deadline), workspaceReleaseStopTimeout)
	require.Greater(t, time.Until(deadline), time.Duration(0))

	cancel()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("cancelling the reconciler did not end the blocked stop")
	}
	require.Empty(t, q.fence, "an abandoned stop records no receipt")
	require.Equal(t, "retained", base.guest.disk)
	_, pending := retainedGuestStopPending(*q.live)
	require.True(t, pending, "the row stays in the cohort for the next process")
	for _, record := range warnings(records, "repository advertisement stop retry failed") {
		requireNoLeak(t, record)
	}
}

// The attempt's own diagnostic is the outcome's finite fields, with the owner
// row named by a stable, non-resolvable correlation token. No adapter
// sentence, URL, credential, header or customer prose reaches the record, and
// the row's id is never an attribute.
func TestAdvertisementFailureStopDiagnosticIsFiniteAndCorrelated(t *testing.T) {
	records := captureReconcilerLogs(t)
	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
	runtime := &interruptedReleaseRuntime{guest: guest, stopErrs: []error{maliciousAdapterError()}}
	svc, q := interruptedReleaseService(t, advertisementFailureRow(leakRowID, leakVMID), runtime)

	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
	require.Empty(t, q.fence)
	_, pending := retainedGuestStopPending(*q.live)
	require.True(t, pending)

	logged := warnings(records, "repository advertisement stop retry failed")
	require.Len(t, logged, 1, "the refusal is reported exactly once per tick")
	requireNoLeak(t, logged[0])
	require.Equal(t, string(interruptedReleaseStageStop), logged[0].attrs["stage"])
	require.Equal(t, "internal", logged[0].attrs["reason"],
		"an unclassifiable adapter refusal still reports a REGISTERED code, not its sentence")

	digest := sha256.Sum256([]byte(leakRowID))
	require.Equal(t, hex.EncodeToString(digest[:])[:12], logged[0].attrs["workspace"])
	require.NotEqual(t, leakRowID, logged[0].attrs["workspace"])

	// Stable across ticks, which is the whole diagnostic value.
	runtime.stopErrs = []error{maliciousAdapterError()}
	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
	logged = warnings(records, "repository advertisement stop retry failed")
	require.Len(t, logged, 2)
	require.Equal(t, logged[0].attrs["workspace"], logged[1].attrs["workspace"])
}

// Every registered door is its own remediation, so the registry must be a
// partition: one stored reason can never read as two doors, a receipt can
// never read as a door still holding a live guest, and a door cannot silently
// fall out of the registry.
func TestRetainedGuestStopDoorsArePartitioned(t *testing.T) {
	require.NotEmpty(t, retainedGuestStopDoors)
	seen := map[string]bool{}
	for _, door := range retainedGuestStopDoors {
		require.NotEmpty(t, door.reason)
		require.NotEmpty(t, door.confirmed)
		require.NotEmpty(t, door.action)
		require.NotEmpty(t, door.metric)
		require.NotEmpty(t, door.logMessage)
		require.False(t, seen[door.reason], "a reason belongs to exactly one door")
		seen[door.reason] = true
		require.NotEqual(t, door.reason, door.confirmed)
		require.Equal(t, door.reason+"; guest stop confirmed", door.confirmed,
			"the receipt keeps the original verdict legible")
	}
	for _, door := range retainedGuestStopDoors {
		require.False(t, seen[door.confirmed],
			"a recorded receipt must never read as a door still holding a live guest")
	}
	require.True(t, seen[workspaceReleaseInterruptedMessage], "the interrupted-release door stays registered")
	require.True(t, seen[workspaceRepositoryAdvertisementUnverifiedMessage], "the advertisement door is registered")
}
