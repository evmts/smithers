package db

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// Ported from Plue 667fa74fc (smithersai/plue#528).

func TestWorkspaceProvisionLockReleasedAfterAPIConnectionLoss(t *testing.T) {
	if testing.Short() {
		t.Skip("PostgreSQL integration")
	}
	ctx := context.Background()
	first, err := sharedPool.Acquire(ctx)
	require.NoError(t, err)
	tx, err := first.Begin(ctx)
	require.NoError(t, err)
	acquired, err := New(tx).TryLockWorkspaceProvisioning(ctx, "restart-proof")
	require.NoError(t, err)
	require.True(t, acquired)
	second, err := sharedPool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = second.Rollback(ctx) }()
	acquired, err = New(second).TryLockWorkspaceProvisioning(ctx, "restart-proof")
	require.NoError(t, err)
	require.False(t, acquired)
	// Closing the owning connection models process loss, not graceful unlock.
	require.NoError(t, first.Conn().Close(ctx))
	first.Release()
	require.Eventually(t, func() bool {
		acquired, err = New(second).TryLockWorkspaceProvisioning(ctx, "restart-proof")
		require.NoError(t, err)
		return acquired
	}, time.Second, 10*time.Millisecond)
}

func TestProvisionRecoveryFindsRowsAndSettlesOnlyPendingSessions(t *testing.T) {
	if testing.Short() {
		t.Skip("PostgreSQL integration")
	}
	ctx := context.Background()
	tx, err := sharedPool.BeginTx(ctx, pgx.TxOptions{})
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	q := New(tx)
	owner := uniqueTestUsername(t)
	user := mustCreateUser(t, tx, owner)
	repo := mustCreateRepoForUser(t, tx, user, "rollout-recovery")
	ws, err := q.CreateWorkspace(ctx, CreateWorkspaceParams{RepositoryID: repo, UserID: user, Name: "restart", TargetBookmark: "main", Status: "starting"})
	require.NoError(t, err)

	listed := func() bool {
		rows, err := q.ListWorkspaceProvisioningRecovery(ctx)
		require.NoError(t, err)
		for _, row := range rows {
			if row.ID == ws.ID {
				require.Equal(t, owner, row.RepositoryOwner)
				require.Equal(t, "rollout-recovery", row.RepositoryName)
				require.Equal(t, "main", row.TargetBookmark)
				return true
			}
		}
		return false
	}
	// A live provisioner's fresh row belongs to it until the grace passes.
	require.False(t, listed())
	_, err = tx.Exec(ctx, "UPDATE workspaces SET updated_at=now()-interval '11 minutes' WHERE id=$1", ws.ID)
	require.NoError(t, err)
	require.True(t, listed())

	session, err := q.CreateWorkspaceSession(ctx, CreateWorkspaceSessionParams{WorkspaceID: ws.ID, RepositoryID: repo, UserID: user, Cols: 80, Rows: 24})
	require.NoError(t, err)
	ids, err := q.CompletePendingWorkspaceSessions(ctx, ws.ID)
	require.NoError(t, err)
	require.Empty(t, ids)
	_, err = q.UpdateWorkspaceExecutionInfo(ctx, UpdateWorkspaceExecutionInfoParams{ID: ws.ID, VmID: "same-vm", Status: "running"})
	require.NoError(t, err)
	// A running workspace with a pending session is listed regardless of age.
	require.True(t, listed())
	ids, err = q.CompletePendingWorkspaceSessions(ctx, ws.ID)
	require.NoError(t, err)
	require.Equal(t, []string{session.ID}, ids)
	ids, err = q.CompletePendingWorkspaceSessions(ctx, ws.ID)
	require.NoError(t, err)
	require.Empty(t, ids)
	require.False(t, listed())
}

// A release the API could not confirm published a terminal 'failed' with no
// cleanup stage — a state this lister did not re-list — while deliberately
// retaining vm_id so the disk and the unfinished capture survive. Its guest
// therefore kept running and kept its compute reservation with nothing left to
// look at the placement again. The new disjunct lists exactly that writer's
// rows, named by the sentence reconcileWorkspaceRelease records, so the stop
// the release intended can be finished.
//
// `failed` plus `conflict` is TWO writers: this one, and any provisioning
// cause whose controller status parses to conflict, which also leaves
// provisioning_stage empty. The recorded sentence is the only thing that
// separates them, so every negative below is a row this backlog must NOT take.
func TestProvisionRecoveryListsOnlyTheInterruptedReleaseItCanFinish(t *testing.T) {
	if testing.Short() {
		t.Skip("PostgreSQL integration")
	}
	ctx := context.Background()
	const interrupted = "workspace release interrupted by host restart"
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
			name: "production's shape: the interrupted release that kept its guest",
			code: "conflict", message: interrupted, vmID: "msb_interrupted", status: "failed",
			listed: true,
		},
		{
			name: "another conflict writer's reason",
			code: "conflict", message: "sandbox placement generation changed",
			vmID: "msb_interrupted", status: "failed",
		},
		{
			name: "the same sentence under another code",
			code: "provisioning_failed", message: interrupted,
			vmID: "msb_interrupted", status: "failed",
		},
		{
			name: "a provisioning failure the product already classified",
			code: "no_capacity", message: "workspace provisioning failed",
			vmID: "msb_interrupted", status: "failed",
		},
		{
			name: "no placement, so no guest to stop and no reservation to hand back",
			code: "conflict", message: interrupted, vmID: "", status: "failed",
		},
		{
			name: "a recorded cleanup stage: another reconciler owns it",
			code: "conflict", message: interrupted, stage: "start_cleanup_complete",
			vmID: "msb_interrupted", status: "failed",
		},
		{
			name: "the receipt is already recorded",
			code: "conflict", message: interrupted + "; guest stop confirmed",
			vmID: "msb_interrupted", status: "failed",
		},
		{
			name: "a tombstoned owner",
			code: "conflict", message: interrupted, vmID: "msb_interrupted", status: "failed",
			deleted: true,
		},
		{
			// The failure columns are cleared by the product's normalize
			// trigger for any non-failed status, so a settled owner can never
			// enter this cohort.
			name: "a stopped owner that once failed",
			code: "conflict", message: interrupted, vmID: "msb_interrupted", status: "stopped",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tx, err := sharedPool.BeginTx(ctx, pgx.TxOptions{})
			require.NoError(t, err)
			defer func() { _ = tx.Rollback(ctx) }()
			q := New(tx)
			owner := uniqueTestUsername(t)
			user := mustCreateUser(t, tx, owner)
			repo := mustCreateRepoForUser(t, tx, user, "interrupted-release")
			ws, err := q.CreateWorkspace(ctx, CreateWorkspaceParams{RepositoryID: repo, UserID: user, Name: "interrupted", TargetBookmark: "main", Status: "starting"})
			require.NoError(t, err)
			// Write the stored shape directly: this is a characterization of
			// what the recovery query reads, not of how the row got there.
			_, err = tx.Exec(ctx, `UPDATE workspaces
				SET status=$2, failure_code=$3, failure_message=$4, provisioning_stage=$5,
				    vm_id=$6, deleted_at=CASE WHEN $7 THEN now() ELSE NULL END,
				    updated_at=now()
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
					require.Equal(t, "interrupted-release", row.RepositoryName)
					require.Equal(t, "main", row.TargetBookmark)
				}
			}
			require.Equal(t, tc.listed, found)
		})
	}
}
