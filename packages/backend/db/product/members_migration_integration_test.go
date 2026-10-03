package product

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

// Migration 106 retains the singleton owner and adds its admin collaborator.
func TestMembersMigrationCarriesThePasswordOwner(t *testing.T) {
	for _, tc := range []struct {
		name     string
		linked   bool
		githubID pgtype.Int8
	}{
		{name: "github account linked", linked: true, githubID: pgtype.Int8{Int64: 583231, Valid: true}},
		{name: "never linked", linked: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := reviewDatabase(t, 103)
			ctx := context.Background()
			_, err := pool.Exec(ctx, `INSERT INTO users (id, username, lower_username, is_admin) VALUES (7, 'Will', 'will', TRUE), (8, 'other', 'other', FALSE)`)
			require.NoError(t, err)
			_, err = pool.Exec(ctx, `INSERT INTO self_host_owners (user_id) VALUES (7)`)
			require.NoError(t, err)
			_, err = pool.Exec(ctx, `INSERT INTO local_credentials (user_id, password_hash) VALUES (7, '$argon2id$v=19$m=65536,t=3,p=2$c2FsdA$aGFzaA')`)
			require.NoError(t, err)
			// Another user's GitHub link never becomes the owner's.
			_, err = pool.Exec(ctx, `INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES (8, 'workos', '99')`)
			require.NoError(t, err)
			if tc.linked {
				_, err = pool.Exec(ctx, `INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES (7, 'workos', '583231')`)
				require.NoError(t, err)
			}

			require.NoError(t, Apply(ctx, pool))
			require.NoError(t, Apply(ctx, pool), "replaying the ledger changes nothing")

			var userID int64
			var githubID pgtype.Int8
			var permission string
			var unixUID int32
			require.NoError(t, pool.QueryRow(ctx, `SELECT user_id,github_user_id,permission,unix_uid FROM collaborators`).
				Scan(&userID, &githubID, &permission, &unixUID))
			require.Equal(t, int64(7), userID)
			require.Equal(t, tc.githubID, githubID)
			require.Equal(t, "admin", permission)
			require.Equal(t, int32(20000), unixUID)

			for _, table := range []string{"local_credentials"} {
				var exists bool
				require.NoError(t, pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists))
				require.False(t, exists, "%s must be dropped", table)
			}

			// The singleton owner survives; another cannot replace it.
			_, err = pool.Exec(ctx, `INSERT INTO self_host_owners(user_id) VALUES(8)`)
			require.Error(t, err)
			var ownerID int64
			require.NoError(t, pool.QueryRow(ctx, `SELECT user_id FROM self_host_owners`).Scan(&ownerID))
			require.Equal(t, int64(7), ownerID)
			var memberTable bool
			require.NoError(t, pool.QueryRow(ctx, `SELECT to_regclass('public.members') IS NOT NULL`).Scan(&memberTable))
			require.False(t, memberTable)
		})
	}
}

// A fresh install has no owner and no password tables.
func TestMembersMigrationFreshInstallHasNoOwner(t *testing.T) {
	pool := reviewDatabase(t, 0)
	ctx := context.Background()
	var members, settings int
	require.NoError(t, pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM collaborators), (SELECT count(*) FROM install_settings)`).Scan(&members, &settings))
	require.Zero(t, members)
	require.Zero(t, settings)
	var exists bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT to_regclass('public.self_host_owners') IS NOT NULL`).Scan(&exists))
	require.True(t, exists)
}
