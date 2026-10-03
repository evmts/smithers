package services

import (
	"context"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

// Real migrated PostgreSQL proves persistence through view, named admission,
// listing and tombstone reads. Runtime delivery has independent unit and
// microsandbox integration tests.
func TestWorkspaceCustomImagePolicyPostgresPersistence(t *testing.T) {
	pool := newProductTestPool(t)
	user, repo := setupTestUserAndRepo(t, pool)
	q := db.New(pool)
	ctx := context.Background()
	for _, mode := range []string{"none", "proxy"} {
		t.Run(mode, func(t *testing.T) {
			row, err := q.CreateWorkspace(ctx, db.CreateWorkspaceParams{RepositoryID: repo, UserID: user, Name: "trial-" + mode, Kind: "container", TargetBookmark: "main", EnvironmentSource: defaultWorkspaceEnvironmentSource, Status: "starting", ImageRef: customText(testCustomImageRef), ImageDigest: customText(testCustomImageDigest), NetworkMode: customText(mode)})
			require.NoError(t, err)
			check := func(row db.Workspace) {
				t.Helper()
				require.Equal(t, customText(testCustomImageRef), row.ImageRef)
				require.Equal(t, customText(testCustomImageDigest), row.ImageDigest)
				require.Equal(t, customText(mode), row.NetworkMode)
			}
			check(row)
			require.False(t, row.BootedImageDigest.Valid)
			got, err := q.GetWorkspace(ctx, row.ID)
			require.NoError(t, err)
			check(got)
			got, err = q.GetWorkspaceByRepo(ctx, db.GetWorkspaceByRepoParams{ID: row.ID, RepositoryID: repo})
			require.NoError(t, err)
			check(got)
			got, err = q.GetWorkspaceForUserRepo(ctx, db.GetWorkspaceForUserRepoParams{ID: row.ID, RepositoryID: repo, UserID: user})
			require.NoError(t, err)
			check(got)
			got, err = q.GetActiveWorkspaceForIdentity(ctx, db.GetActiveWorkspaceForIdentityParams{RepositoryID: repo, UserID: user, Name: row.Name, Kind: "container", TargetBookmark: "main"})
			require.NoError(t, err)
			check(got)
			got, err = q.SetWorkspaceImageReceipt(ctx, db.SetWorkspaceImageReceiptParams{ID: row.ID, BootedImageDigest: testCustomImageDigest})
			require.NoError(t, err)
			check(got)
			require.Equal(t, customText(testCustomImageDigest), got.BootedImageDigest)
			rows, err := q.ListWorkspacesByRepo(ctx, db.ListWorkspacesByRepoParams{RepositoryID: repo, UserID: user, PageSize: 100})
			require.NoError(t, err)
			found := false
			for _, item := range rows {
				if item.ID == row.ID {
					check(item)
					require.Equal(t, customText(testCustomImageDigest), item.BootedImageDigest)
					found = true
				}
			}
			require.True(t, found)
			_, err = q.SoftDeleteWorkspace(ctx, row.ID)
			require.NoError(t, err)
			got, err = q.GetWorkspaceIncludingDeleted(ctx, row.ID)
			require.NoError(t, err)
			check(got)
			require.True(t, got.DeletedAt.Valid)
		})
	}
}

func TestWorkspaceCustomImagePolicyPostgresConstraints(t *testing.T) {
	pool := newProductTestPool(t)
	user, repo := setupTestUserAndRepo(t, pool)
	q := db.New(pool)
	ctx := context.Background()
	for _, tc := range []struct{ name, ref, digest, mode string }{
		{name: "missing digest", ref: testCustomImageRef},
		{name: "digest without ref", digest: testCustomImageDigest},
		{name: "malformed digest", ref: testCustomImageRef, digest: "sha256:bad"},
		{name: "invalid network", mode: "all"},
		{name: "unsupported mode", mode: "allowlist"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := q.CreateWorkspace(ctx, db.CreateWorkspaceParams{RepositoryID: repo, UserID: user, Name: tc.name, Kind: "container", TargetBookmark: "main", EnvironmentSource: defaultWorkspaceEnvironmentSource, Status: "starting", ImageRef: customText(tc.ref), ImageDigest: customText(tc.digest), NetworkMode: customText(tc.mode)})
			require.Error(t, err)
			var count int
			require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM workspaces WHERE repository_id=$1 AND name=$2", repo, tc.name).Scan(&count))
			require.Zero(t, count)
		})
	}
	row, err := q.CreateWorkspace(ctx, db.CreateWorkspaceParams{RepositoryID: repo, UserID: user, Name: "defaults", Kind: "container", TargetBookmark: "main", EnvironmentSource: defaultWorkspaceEnvironmentSource, Status: "starting"})
	require.NoError(t, err)
	require.False(t, row.ImageRef.Valid)
	require.False(t, row.ImageDigest.Valid)
	require.False(t, row.NetworkMode.Valid)
	require.False(t, row.BootedImageDigest.Valid)
	_, err = q.SetWorkspaceImageReceipt(ctx, db.SetWorkspaceImageReceiptParams{ID: row.ID, BootedImageDigest: "sha256:bad"})
	require.Error(t, err)
	got, err := q.GetWorkspace(ctx, row.ID)
	require.NoError(t, err)
	require.False(t, got.BootedImageDigest.Valid)
	var columns int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_name='workspaces' AND column_name IN ('image_ref','image_digest','booted_image_digest','network_mode') AND is_nullable='YES' AND column_default IS NULL`).Scan(&columns))
	require.Equal(t, 4, columns)
	var allowColumns int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_name='workspaces' AND column_name='network_allow'`).Scan(&allowColumns))
	require.Zero(t, allowColumns)
}
