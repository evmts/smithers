package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/database"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A PROVISIONING CLAIM HOLDS ITS TRANSACTION IDLE (Fable on S3, plue#839).
//
// withWorkspaceProvisionLock takes pg_try_advisory_xact_lock on a
// transaction and keeps that transaction open, with no statement running,
// while its work boots a guest and clones the repository. PostgreSQL closes a
// session idle in a transaction for longer than
// idle_in_transaction_session_timeout, and the lock goes with it while the
// guest is still starting. The next tick then claims the same row and starts
// a second guest: the leaked-guest class.

// The default idle bound outlasts the longest idle hold a claim's work can
// make, read from the bounds that work runs under: a boot within the
// provisioning budget and then a repository transfer, and the age at which
// the reconciler treats a starting row as stale. At the 900 s first proposed
// it did not.
func TestIdleTransactionTimeoutOutlastsTheProvisioningClaim(t *testing.T) {
	idle := time.Duration(config.DefaultDatabaseIdleInTransactionSessionTimeoutSecs) * time.Second
	hold := workspaceProvisionTimeout + workspaceCloneTimeout
	require.Greater(t, idle, hold, "an idle claim transaction is closed before its boot and clone can finish")
	require.Greater(t, idle, workspaceStartingWithVMStaleAfter, "an idle claim transaction is closed before its row is stale")
}

// The hazard the default avoids, on real sessions: replica A's claim is held
// idle past a 1 s bound, its session is closed, and replica B is admitted to
// the same row while A's work is still running. With the default bound B is
// refused as contended.
func TestAnIdleClaimPastItsBoundLosesItsRowToAnotherReplica(t *testing.T) {
	for _, tc := range []struct {
		name     string
		idle     int
		admitted bool
	}{
		{"one second", 1, true},
		{"the default", config.DefaultDatabaseIdleInTransactionSessionTimeoutSecs, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			url := testdb.NewFromTemplate(t, productTemplateName(t)).URL
			open := func(idle int) *pgxpool.Pool {
				pool, err := database.NewPool(ctx, config.DatabaseConfig{URL: url, MaxConns: 6, MinConns: 1,
					MaxConnLifetime: 600, MaxConnIdleTime: 600, StatementTimeout: 900, IdleInTransactionSessionTimeout: idle})
				require.NoError(t, err)
				t.Cleanup(pool.Close)
				return pool
			}
			poolA, poolB := open(tc.idle), open(config.DefaultDatabaseIdleInTransactionSessionTimeoutSecs)
			runtime := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceStarting}}
			replicaA := realStoreReconciler(t, poolA, runtime, newCorePoolDutyRecorder())
			replicaB := realStoreReconciler(t, poolB, runtime, newCorePoolDutyRecorder())
			repository := realRepository(t, poolA, "idle-claim")
			id := uuid.NewString()
			_, err := poolA.Exec(ctx, `INSERT INTO workspaces(id, repository_id, user_id, name, status, vm_id) VALUES ($1,$2,$3,'idle-claim','starting','vm-idle-claim')`,
				id, repository.ID, repository.UserID.Int64)
			require.NoError(t, err)
			row, err := db.New(poolA).GetWorkspace(ctx, id)
			require.NoError(t, err)

			held, release := make(chan struct{}), make(chan struct{})
			doneA := make(chan struct{})
			go func() {
				defer close(doneA)
				_, _ = replicaA.withWorkspaceProvisionLock(ctx, workspaceClaimStart, row, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
					close(held)
					<-release // the guest is still booting
					return current, nil
				})
			}()
			<-held
			time.Sleep(2500 * time.Millisecond)
			admitted := false
			_, err = replicaB.withWorkspaceProvisionLock(ctx, workspaceClaimStart, row, func(_ context.Context, current db.Workspace) (db.Workspace, error) {
				admitted = true
				return current, nil
			})
			close(release)
			<-doneA
			require.Equal(t, tc.admitted, admitted)
			if !tc.admitted {
				require.True(t, errors.Is(err, errWorkspaceProvisionInProgress), "replica B was not refused as contended: %v", err)
			}
		})
	}
}
