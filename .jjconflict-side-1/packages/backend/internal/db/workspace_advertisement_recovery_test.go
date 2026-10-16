package db

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// The repository-advertisement door, proved for the 16 failed owners that held
// a RUNNING guest and its compute reservation.
//
// The authenticated ref advertisement runs INSIDE the start, after the guest
// is already up and reported running, so its `conflict` fails the owner over a
// live guest. markWorkspaceProvisionFailed then records that sentence through
// FailProvisioningWorkspaceIfCurrent, which passes NO cleanup stage and
// preserves the existing one — and this lister re-listed `failed` only at
// start_cleanup_pending and at the interrupted release's own sentence. So the
// row was in no backlog at all and nothing looked at the placement again.
//
// The new disjunct lists exactly that writer's rows so the stop the failed
// start never made can be finished. It is NOT a failed-workspace sweep and NOT
// a repository-family sweep: `failed` plus `conflict` plus an empty stage is
// several writers, and even the SAME writer on another repository step is a
// different door with a different remediation. Every negative below is a row
// this backlog must NOT take.
func TestProvisionRecoveryListsOnlyTheAdvertisementFailureItCanFinish(t *testing.T) {
	if testing.Short() {
		t.Skip("PostgreSQL integration")
	}
	ctx := context.Background()
	const advertisement = "workspace repository advertisement could not be verified"
	for _, tc := range []struct {
		name    string
		code    string
		message string
		stage   string
		vmID    string
		status  string
		deleted bool
		listed  bool
	}{
		{
			name: "production's shape: the failed start that kept its guest",
			code: "conflict", message: advertisement, vmID: "msb_advertisement", status: "failed",
			listed: true,
		},
		{
			name: "the same writer on another repository step",
			code: "conflict", message: "workspace repository clone-refs could not be verified",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "the same writer on the head step",
			code: "conflict", message: "workspace repository head could not be verified",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "unreceipted user work in the repository",
			code: "conflict", message: "workspace repository has unreceipted Jujutsu work",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "a retained branch machine, which must never be touched",
			code: "conflict", message: "branch machine is retained; recover it before joining",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "the same sentence under another code",
			code: "provisioning_failed", message: advertisement,
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "a prefix of the registered sentence",
			code: "conflict", message: "workspace repository advertisement",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "a superstring of the registered sentence",
			code: "conflict", message: advertisement + " for alice/demo",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "no placement, so no guest to stop and no reservation to hand back",
			code: "conflict", message: advertisement, vmID: "", status: "failed",
		},
		{
			// Listed, but by the PRE-EXISTING failed-start cleanup disjunct,
			// not by this door: a recorded start_cleanup_pending means the
			// cleanup contract already owns the row, and that reconciler
			// stops AND DELETES. The service-side predicate excludes it for
			// exactly that reason, so the two backlogs never both claim a row.
			name: "a recorded cleanup stage: the deleting reaper already owns it",
			code: "conflict", message: advertisement, stage: "start_cleanup_pending",
			vmID: "msb_advertisement", status: "failed",
			listed: true,
		},
		{
			name: "the cleanup already finished",
			code: "conflict", message: advertisement, stage: "start_cleanup_complete",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "the receipt is already recorded",
			code: "conflict", message: advertisement + "; guest stop confirmed",
			vmID: "msb_advertisement", status: "failed",
		},
		{
			name: "a tombstoned owner",
			code: "conflict", message: advertisement, vmID: "msb_advertisement", status: "failed",
			deleted: true,
		},
		{
			name: "a stopped owner that once failed",
			code: "conflict", message: advertisement, vmID: "msb_advertisement", status: "stopped",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tx, err := sharedPool.BeginTx(ctx, pgx.TxOptions{})
			require.NoError(t, err)
			defer func() { _ = tx.Rollback(ctx) }()
			q := New(tx)
			owner := uniqueTestUsername(t)
			user := mustCreateUser(t, tx, owner)
			repo := mustCreateRepoForUser(t, tx, user, "advertisement-failure")
			ws, err := q.CreateWorkspace(ctx, CreateWorkspaceParams{RepositoryID: repo, UserID: user, Name: "advertisement", TargetBookmark: "main", Status: "starting"})
			require.NoError(t, err)
			// Write the stored shape directly: this is a characterization of
			// what the recovery query reads, not of how the row got there.
			// The cohort's own metadata is reproduced with it — a container
			// older than seven days whose reclaimed disk and unfinished
			// capture a delete would take.
			_, err = tx.Exec(ctx, `UPDATE workspaces
				SET status=$2, failure_code=$3, failure_message=$4, provisioning_stage=$5,
				    vm_id=$6, deleted_at=CASE WHEN $7 THEN now() ELSE NULL END,
				    kind='container', created_at=now()-interval '9 days',
				    disk_reclaimed_at=now()-interval '8 days',
				    cleanup_pending_head='zzzzzzzzzzzz',
				    cleanup_pending_capture_id='capture-advertisement',
				    updated_at=now()-interval '8 days'
				WHERE id=$1`, ws.ID, tc.status, tc.code, tc.message, tc.stage, tc.vmID, tc.deleted)
			require.NoError(t, err)

			stored, err := q.GetWorkspace(ctx, ws.ID)
			if !tc.deleted {
				require.NoError(t, err)
				if tc.status == "failed" {
					require.Equal(t, tc.message, stored.FailureMessage.String,
						"the trigger preserves a non-blank recorded reason verbatim")
				} else {
					require.False(t, stored.FailureMessage.Valid,
						"the trigger clears the failure columns for any non-failed status")
				}
			}

			rows, err := q.ListWorkspaceProvisioningRecovery(ctx)
			require.NoError(t, err)
			found := false
			for _, row := range rows {
				if row.ID == ws.ID {
					found = true
					require.Equal(t, owner, row.RepositoryOwner)
					require.Equal(t, "advertisement-failure", row.RepositoryName)
					require.Equal(t, "main", row.TargetBookmark)
				}
			}
			require.Equal(t, tc.listed, found)
		})
	}
}

// The recovery's own write keeps the FAILED truth, the failure context, the vm
// binding and every durable sentinel a delete would take. Only the recorded
// reason gains its receipt, and that is also what takes the row out of the
// backlog — so a restarted reconciler finds nothing to re-drive and the reaper
// backlog stays truthful.
func TestAdvertisementStopReceiptPreservesTheOwnerAndLeavesTheBacklog(t *testing.T) {
	if testing.Short() {
		t.Skip("PostgreSQL integration")
	}
	ctx := context.Background()
	const advertisement = "workspace repository advertisement could not be verified"
	tx, err := sharedPool.BeginTx(ctx, pgx.TxOptions{})
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	q := New(tx)
	user := mustCreateUser(t, tx, uniqueTestUsername(t))
	repo := mustCreateRepoForUser(t, tx, user, "advertisement-receipt")
	ws, err := q.CreateWorkspace(ctx, CreateWorkspaceParams{RepositoryID: repo, UserID: user, Name: "receipt", TargetBookmark: "main", Status: "starting"})
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `UPDATE workspaces
		SET status='failed', failure_code='conflict', failure_message=$2,
		    provisioning_stage='', vm_id='msb_receipt', kind='container',
		    disk_reclaimed_at=now()-interval '8 days',
		    cleanup_pending_head='zzzzzzzzzzzz',
		    cleanup_pending_capture_id='capture-advertisement',
		    capture_pending='{"pending":true}'::jsonb,
		    updated_at=now()-interval '8 days'
		WHERE id=$1`, ws.ID, advertisement)
	require.NoError(t, err)
	before, err := q.GetWorkspace(ctx, ws.ID)
	require.NoError(t, err)

	listed := func() bool {
		rows, err := q.ListWorkspaceProvisioningRecovery(ctx)
		require.NoError(t, err)
		for _, row := range rows {
			if row.ID == ws.ID {
				return true
			}
		}
		return false
	}
	require.True(t, listed(), "the cohort is reachable through canonical recovery")

	// The recovery's one write: the same fenced statement the release door
	// uses, with the recorded code reused and only the reason gaining its
	// receipt.
	updated, err := q.FailWorkspaceIfUnchanged(ctx, FailWorkspaceIfUnchangedParams{
		FailureCode:       "conflict",
		FailureMessage:    advertisement + "; guest stop confirmed",
		ID:                ws.ID,
		ExpectedStatus:    before.Status,
		ExpectedVmID:      before.VmID,
		ExpectedUpdatedAt: before.UpdatedAt,
	})
	require.NoError(t, err)
	require.Equal(t, "failed", updated.Status, "the FAILED truth is preserved")
	require.Equal(t, "conflict", updated.FailureCode.String)
	require.Equal(t, advertisement+"; guest stop confirmed", updated.FailureMessage.String)
	require.Equal(t, "msb_receipt", updated.VmID, "the vm binding stays bound")
	require.Equal(t, "", updated.ProvisioningStage, "no cleanup stage is invented")
	require.Equal(t, before.ProvisioningGeneration, updated.ProvisioningGeneration)
	require.True(t, updated.DiskReclaimedAt.Valid, "the reclaimed-disk marker survives")
	require.Equal(t, "zzzzzzzzzzzz", updated.CleanupPendingHead)
	require.Equal(t, "capture-advertisement", updated.CleanupPendingCaptureID)
	require.JSONEq(t, `{"pending":true}`, string(updated.CapturePending))
	require.False(t, updated.DeletedAt.Valid, "nothing is tombstoned")

	require.False(t, listed(), "the receipt takes the row out of the backlog for good")

	// Idempotent: the stale snapshot loses the fence, so a repeated attempt
	// changes nothing rather than re-recording a receipt.
	_, err = q.FailWorkspaceIfUnchanged(ctx, FailWorkspaceIfUnchangedParams{
		FailureCode:       "conflict",
		FailureMessage:    advertisement + "; guest stop confirmed",
		ID:                ws.ID,
		ExpectedStatus:    before.Status,
		ExpectedVmID:      before.VmID,
		ExpectedUpdatedAt: before.UpdatedAt,
	})
	require.ErrorIs(t, err, pgx.ErrNoRows)
}
