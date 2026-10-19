package product

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// agentSessionBoxesVersion is the version before the migration that gives
// every agent session its own box, wherever it lands in the registry.
func agentSessionBoxesVersion(t *testing.T) int {
	t.Helper()
	registered, err := registeredMigrations()
	require.NoError(t, err)
	for _, m := range migrationRegistry {
		if strings.HasSuffix(m.path, "_agent_session_boxes.sql") {
			require.Equal(t, len(registered), m.version, "the per-session box migration is the head this test was written at or a later one")
			return m.version - 1
		}
	}
	t.Fatal("no agent session boxes migration is registered")
	return 0
}

// plue#869: a session pointing at a shared branch machine or a stack lane is
// unbound, the dirty mark starts empty, and each live session has at most one
// live box again.
func TestAgentSessionBoxesMigration(t *testing.T) {
	pool := reviewDatabase(t, agentSessionBoxesVersion(t))
	repo := reviewRepo(t, pool)
	ctx := t.Context()
	var machines int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&machines))
	workspace := func(name, bookmark string) string {
		var id string
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (repository_id, user_id, name, target_bookmark, kind, status, vm_id)
			VALUES ($1, $2, $3, $4, 'container', 'running', 'vm-' || $3) RETURNING id::text`, repo, machines, name, bookmark).Scan(&id))
		return id
	}
	session := func(id, workspace string) {
		_, err := pool.Exec(ctx, `INSERT INTO agent_sessions (id, repository_id, user_id, status, workspace_id)
			VALUES ($1, $2, 1001, 'active', NULLIF($3, '')::uuid)`, id, repo, workspace)
		require.NoError(t, err)
	}
	branch := workspace("main", "main")
	lane := workspace("lane-1", "mythical")
	const onBranch, onLane, unbound = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"
	session(onBranch, branch)
	session(onLane, lane)
	session(unbound, "")

	require.NoError(t, Apply(ctx, pool))

	var bound int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM agent_sessions WHERE workspace_id IS NOT NULL`).Scan(&bound))
	require.Zero(t, bound, "no session still points at a shared machine")
	var mark string
	require.NoError(t, pool.QueryRow(ctx, `SELECT agent_box_dirty_vm_id FROM workspaces WHERE id=$1`, branch).Scan(&mark))
	require.Empty(t, mark, "a box starts clean")
	var machinesKept int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM workspaces WHERE vm_id LIKE 'vm-%' AND deleted_at IS NULL`).Scan(&machinesKept))
	require.Equal(t, 2, machinesKept, "no machine or disk is touched")

	box := func(session string) (string, error) {
		var id string
		err := pool.QueryRow(ctx, `INSERT INTO workspaces (repository_id, user_id, name, target_bookmark, kind, status, agent_session_id)
			VALUES ($1, $2, '', 'main', 'container', 'starting', $3) RETURNING id::text`, repo, machines, session).Scan(&id)
		return id, err
	}
	first, err := box(onBranch)
	require.NoError(t, err)
	_, err = box(onBranch)
	require.ErrorContains(t, err, "uq_workspaces_agent_session", "a session has one live box")
	_, err = pool.Exec(ctx, `UPDATE workspaces SET deleted_at=now() WHERE id=$1`, first)
	require.NoError(t, err)
	_, err = box(onBranch)
	require.NoError(t, err, "a deleted box frees its session")
	_, err = box(onLane)
	require.NoError(t, err)
}
