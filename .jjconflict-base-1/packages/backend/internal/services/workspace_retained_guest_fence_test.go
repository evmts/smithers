package services

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// THE GAP, stated as the shape that reaches it.
//
// A retained-guest stop is listed from one read and acts under another: the
// reconcile loop re-reads the row, and withWorkspaceProvisionLock takes the
// advisory lock and reads it AGAIN, fresh. Between those two reads the row can
// be re-driven — a resume, a restore, a second provisioning attempt — and the
// cohort's own shape is sticky, so the row the lock holds can advance while
// every conjunct the attempt checked reads identical: the same `failed`, the
// same `conflict`, the same REGISTERED sentence, the same empty stage and the
// same vm_id, because a second attempt at the same door with the same retained
// placement writes exactly that.
//
// So neither the door nor the placement is a fence on the TRANSITION, and the
// post-stop CAS is not one either: it runs after the guest is already down and
// can only decline to record a receipt for a stop that already happened. The
// stale attempt must therefore refuse BEFORE the physical effect — and then
// the next tick, holding a fresh snapshot, converges the row normally.
func TestRetainedGuestStopFencesTheTransitionItWasListedFor(t *testing.T) {
	for _, tc := range []struct {
		name    string
		advance func(*db.Workspace)
	}{
		{
			// Production's own re-drive: the provisioner's counter moved and
			// the writer stamped updated_at, and the door still reads as the
			// door because the SAME step refused again.
			name: "a newer provisioning generation reached the same door again",
			advance: func(row *db.Workspace) {
				row.ProvisioningGeneration++
				row.UpdatedAt = time.Now()
			},
		},
		{
			// Root's own warning about this column: a writer is not obliged to
			// stamp updated_at, so the generation is fenced on its own.
			name:    "a newer generation that did not stamp updated_at",
			advance: func(row *db.Workspace) { row.ProvisioningGeneration++ },
		},
		{
			// And the converse: a writer that stamped updated_at without
			// advancing the generation still rewrote this row.
			name:    "the row was rewritten with no generation bump",
			advance: func(row *db.Workspace) { row.UpdatedAt = time.Now() },
		},
		{
			name: "the owner this attempt was listed under changed",
			advance: func(row *db.Workspace) {
				row.UserID++
				row.UpdatedAt = time.Now()
			},
		},
		{
			name: "the repository this attempt was listed under changed",
			advance: func(row *db.Workspace) {
				row.RepositoryID++
				row.UpdatedAt = time.Now()
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
			runtime := &interruptedReleaseRuntime{guest: guest}
			listed := advertisementFailureRow("ws-advertisement-stale", "vm-advertisement-stale")
			svc, q := interruptedReleaseService(t, listed, runtime)

			// The row advances AFTER the listing read and BEFORE the locked
			// one, and stays in the same door with the same placement.
			tc.advance(q.live)
			door, pending := retainedGuestStopPending(*q.live)
			require.True(t, pending, "the advanced row still reads as this door, which is the whole trap")
			require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, door.reason)
			require.Equal(t, listed.VmID, q.live.VmID, "and it still binds the placement that was listed")

			outcome, err := svc.reconcileRetainedGuestStop(context.Background(), listed, door)
			require.NoError(t, err, "a transition this attempt did not read is not a failure; it is somebody else's row")
			require.Equal(t, interruptedReleaseStageClaim, outcome.stage,
				"the attempt refuses while claiming the row, before anything is asked of the runtime")

			require.Equal(t, int32(0), runtime.stops.Load(), "no guest is stopped for a transition this attempt never saw")
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Empty(t, q.fence, "and no receipt is sealed over the newer transition")
			require.Equal(t, workspaceapi.WorkspaceRunning, guest.state)
			require.Equal(t, "retained", guest.disk)
			require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, q.live.FailureMessage.String,
				"the newer writer's recorded reason is left exactly as it stands")
		})
	}

	// Refusing is not giving up. The next tick lists the row from the state it
	// is actually in, and converges it with one stop and one receipt.
	t.Run("the next tick converges the row it refused", func(t *testing.T) {
		guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
		runtime := &interruptedReleaseRuntime{guest: guest}
		listed := advertisementFailureRow("ws-advertisement-converge", "vm-advertisement-converge")
		svc, q := interruptedReleaseService(t, listed, runtime)
		q.live.ProvisioningGeneration++
		q.live.UpdatedAt = time.Now()

		_, err := svc.reconcileRetainedGuestStop(context.Background(), listed, advertisementStopDoor(t))
		require.NoError(t, err)
		require.Equal(t, int32(0), runtime.stops.Load())

		// ReconcileWorkspaceProvisioning re-reads the row itself, so this tick
		// is listed and acts on the same, advanced, transition.
		require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
		require.Equal(t, int32(1), runtime.stops.Load(), "the fresh snapshot converges it")
		require.Equal(t, workspaceapi.WorkspaceStopped, guest.state)
		require.Equal(t, int32(0), runtime.deletes.Load())
		require.Len(t, q.fence, 1)
		require.Equal(t, workspaceRepositoryAdvertisementStoppedMessage, q.live.FailureMessage.String)
		require.Equal(t, "retained", guest.disk, "a stop is still a stop: the disk survives")
	})
}

// The predicate reads a stored reason the way the WRITER stored it.
//
// normalize_workspace_failure_details stores btrim(failure_message), and
// btrim's default character set is SPACES only. So the stored bytes of a
// space-padded reason are the bare sentence — which is why a space-trimmed
// comparison is exact rather than lenient — while a TAB- or newline-padded
// reason is stored WITH its padding, and the recovery lister's own
// `failure_message = '<sentence>'` does not match it.
//
// strings.TrimSpace trims tabs, newlines, vertical tabs, form feeds, carriage
// returns and the Unicode spaces too, so it admitted as a registered door a
// stored reason this backlog does not list and this writer could not have
// produced. One tab was enough. Those must fail CLOSED, and the Go predicate
// and the SQL lister must be one contract.
func TestRetainedGuestDoorReadsAStoredReasonTheWayTheWriterStoredIt(t *testing.T) {
	const sentence = workspaceRepositoryAdvertisementUnverifiedMessage
	for _, tc := range []struct {
		name  string
		shape func(*db.Workspace)
		door  bool
	}{
		{
			name:  "the sentence exactly as btrim leaves it",
			shape: func(*db.Workspace) {},
			door:  true,
		},
		{
			// btrim strips these before the column ever sees them, so reading
			// past them is reading the same stored value.
			name: "space padding, which the writer's btrim strips",
			shape: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "   " + sentence + "  ", Valid: true}
			},
			door: true,
		},
		{
			name: "a tab in front, which btrim keeps and the lister does not match",
			shape: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "\t" + sentence, Valid: true}
			},
		},
		{
			name: "a newline behind",
			shape: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: sentence + "\n", Valid: true}
			},
		},
		{
			name: "a carriage return behind",
			shape: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: sentence + "\r", Valid: true}
			},
		},
		{
			name: "a vertical tab and a form feed",
			shape: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: "\v" + sentence + "\f", Valid: true}
			},
		},
		{
			name: "a non-breaking space, which is not an ASCII space at all",
			shape: func(row *db.Workspace) {
				row.FailureMessage = pgtype.Text{String: " " + sentence, Valid: true}
			},
		},
		{
			name: "the code padded with a tab",
			shape: func(row *db.Workspace) {
				row.FailureCode = pgtype.Text{String: "\t" + string(pkgerrors.CodeConflict), Valid: true}
			},
		},
		{
			// The lister compares provisioning_stage to the empty string, so a
			// padded stage IS a recorded stage and another reconciler owns it.
			name:  "a stage of one space is still a recorded stage",
			shape: func(row *db.Workspace) { row.ProvisioningStage = " " },
		},
		{
			name:  "a stage of one tab is still a recorded stage",
			shape: func(row *db.Workspace) { row.ProvisioningStage = "\t" },
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := advertisementFailureRow("ws-advertisement-padded", "vm-advertisement-padded")
			tc.shape(&row)
			door, pending := retainedGuestStopPending(row)
			require.Equal(t, tc.door, pending)
			if tc.door {
				require.Equal(t, sentence, door.reason)
			}

			// And the real reconciler agrees: a reason the lister would not
			// list stops nothing and records nothing.
			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
			runtime := &interruptedReleaseRuntime{guest: guest}
			svc, q := interruptedReleaseService(t, row, runtime)
			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			if tc.door {
				require.Equal(t, int32(1), runtime.stops.Load())
				require.Len(t, q.fence, 1)
			} else {
				require.Equal(t, int32(0), runtime.stops.Load(), "a forged or unlisted reason is not a door")
				require.Empty(t, q.fence)
				require.Equal(t, workspaceapi.WorkspaceRunning, guest.state)
			}
			require.Equal(t, int32(0), runtime.deletes.Load())
			require.Equal(t, "retained", guest.disk)
		})
	}
}

// workspaceStoredFailureText trims exactly what btrim trims, and nothing more.
func TestWorkspaceStoredFailureTextTrimsWhatBtrimTrims(t *testing.T) {
	require.Equal(t, "reason", workspaceStoredFailureText("  reason "))
	for _, pad := range []string{"\t", "\n", "\r", "\v", "\f", " ", " "} {
		require.Equal(t, pad+"reason", workspaceStoredFailureText(pad+"reason"),
			"btrim keeps %q, so this predicate must keep it too", pad)
	}
}
