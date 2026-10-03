package product

import (
	"context"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

func TestWorkspaceCustomImageMigrationLeavesExistingRowsUnchanged(t *testing.T) {
	pool := reviewDatabase(t, 103)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO users(id,username,lower_username) VALUES(1,'image-owner','image-owner');
 INSERT INTO repositories(id,user_id,name,lower_name) VALUES(1,1,'image-repo','image-repo');
 INSERT INTO workspaces(id,repository_id,user_id,name,target_bookmark,kind,status,vm_id) VALUES('00000000-0000-4000-8000-000000000001',1,1,'existing','main','container','running','old-guest')`)
	require.NoError(t, err)
	var before string
	require.NoError(t, pool.QueryRow(ctx, `SELECT xmin::text FROM workspaces WHERE name='existing'`).Scan(&before))
	require.NoError(t, Apply(ctx, pool))
	row, err := db.New(pool).GetWorkspace(ctx, "00000000-0000-4000-8000-000000000001")
	require.NoError(t, err)
	require.Equal(t, "old-guest", row.VmID)
	require.Equal(t, "running", row.Status)
	require.False(t, row.ImageRef.Valid)
	require.False(t, row.ImageDigest.Valid)
	require.False(t, row.BootedImageDigest.Valid)
	require.False(t, row.NetworkMode.Valid)
	var after string
	require.NoError(t, pool.QueryRow(ctx, `SELECT xmin::text FROM workspaces WHERE id=$1`, row.ID).Scan(&after))
	require.Equal(t, before, after, "migration must not backfill existing execution policy")
	require.NoError(t, Apply(ctx, pool), "replay must remain idempotent")
}
