package db

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/sandbox"
	"github.com/stretchr/testify/require"
)

func TestSandboxUsageKeepsRepositoryPayerAfterTransferAndDeletion(t *testing.T) {
	q, pool := newQueries(t)
	payer := mustCreateUser(t, pool, uniqueTestUsername(t))
	buyer := mustCreateUser(t, pool, uniqueTestUsername(t))
	machine := mustCreateUser(t, pool, uniqueTestUsername(t))
	repo := mustCreateRepo(t, pool, payer, uniqueTestRepoName(t))
	var id string
	require.NoError(t, pool.QueryRow(t.Context(), `INSERT INTO workspaces(repository_id,user_id,vm_id,status) VALUES ($1,$2,'payer-test','running') RETURNING id::text`, repo, machine).Scan(&id))
	require.NoError(t, q.OpenSandboxUsageInterval(t.Context(), OpenSandboxUsageIntervalParams{UserID: machine, SandboxKind: "workspace", SandboxID: id}))
	_, err := pool.Exec(t.Context(), `UPDATE sandbox_usage_intervals SET started_at=now()-interval '60 seconds',ended_at=now() WHERE sandbox_id=$1`, id)
	require.NoError(t, err)
	transferred := false
	check := func() {
		t.Helper()
		for _, tc := range []struct {
			user  int64
			spent bool
		}{{payer, true}, {buyer, false}, {machine, false}} {
			ctx := sandbox.WithBillingOwner(t.Context(), sandbox.BillingOwner{Type: "user", ID: tc.user})
			seconds, err := q.SumSandboxAwakeSecondsForUserSince(ctx, tc.user, time.Now().Add(-time.Hour))
			require.NoError(t, err)
			if tc.spent {
				require.GreaterOrEqual(t, seconds, int64(60))
			} else if tc.user == buyer && transferred {
				require.Less(t, seconds, int64(60))
			} else {
				require.Zero(t, seconds)
			}
		}
	}
	check()
	require.NoError(t, q.OpenSandboxUsageInterval(t.Context(), OpenSandboxUsageIntervalParams{UserID: machine, SandboxKind: "workspace", SandboxID: id}))

	transfer, err := q.BeginTx(t.Context())
	require.NoError(t, err)
	defer transfer.Rollback(context.Background())
	token := strings.Repeat("a", 64)
	_, err = transfer.Exec(t.Context(), `INSERT INTO repository_storage_operations(repository_id,operation_type,token,storage_route_key,source_owner,source_repo,source_user_id,target_owner,target_repo,target_user_id)
 SELECT r.id,'move',$1,'static',u.username,r.name,r.user_id,b.username,r.name,b.id FROM repositories r JOIN users u ON u.id=r.user_id JOIN users b ON b.id=$2 WHERE r.id=$3`, token, buyer, repo)
	require.NoError(t, err)
	_, err = transfer.Exec(t.Context(), `SELECT set_config('smithers.repository_storage_operation_token',$1,true)`, token)
	require.NoError(t, err)
	_, err = transfer.Exec(t.Context(), `UPDATE repositories SET user_id=$1 WHERE id=$2`, buyer, repo)
	require.NoError(t, err)
	_, err = transfer.Exec(t.Context(), `DELETE FROM repository_storage_operations WHERE repository_id=$1`, repo)
	require.NoError(t, err)
	require.NoError(t, transfer.Commit(t.Context()))
	transferred = true
	var livePayer int64
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT billing_owner_id FROM sandbox_usage_intervals WHERE sandbox_id=$1 AND ended_at IS NULL`, id).Scan(&livePayer))
	require.Equal(t, buyer, livePayer)
	check()
	deletion, err := q.BeginTx(t.Context())
	require.NoError(t, err)
	defer deletion.Rollback(context.Background())
	_, err = deletion.Exec(t.Context(), `INSERT INTO repository_storage_operations(repository_id,operation_type,token,storage_route_key,source_owner,source_repo,source_user_id)
 SELECT r.id,'delete',$1,'static',u.username,r.name,r.user_id FROM repositories r JOIN users u ON u.id=r.user_id WHERE r.id=$2`, token, repo)
	require.NoError(t, err)
	_, err = deletion.Exec(t.Context(), `SELECT set_config('smithers.repository_storage_operation_token',$1,true)`, token)
	require.NoError(t, err)
	_, err = deletion.Exec(t.Context(), `DELETE FROM repositories WHERE id=$1`, repo)
	require.NoError(t, err)
	require.NoError(t, deletion.Commit(t.Context()))
	var open, remaining int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM sandbox_usage_intervals WHERE sandbox_id=$1 AND ended_at IS NULL`, id).Scan(&open))
	require.Zero(t, open)
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM repositories WHERE id=$1`, repo).Scan(&remaining))
	require.Zero(t, remaining)
	check()
}
