package services

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// THE POOL CREDENTIAL (Security s-to2s1x, Platform d-1dhdtr). A box's
// account-pool credential, provider-pool-workspace-<id>, is minted once per
// boot and lives seven days. Every release, retirement and delete revokes it
// with the box's other credentials, the read-back counts it, and another
// box's pool credential is untouched.

// mintPoolCredential mints a box's pool credential as bindWorkspaceProviderPool does.
func (f *agentBoxRelease) mintPoolCredential(t *testing.T, workspaceID string) {
	t.Helper()
	row, err := f.q.GetWorkspace(f.ctx, workspaceID)
	require.NoError(t, err)
	_, err = issueTemporaryRepoTokenWithTTL(f.ctx, f.q, row.UserID, providerPoolTokenPrefix+row.ID,
		ProviderPoolTokenScopes(row.RepositoryID, row.ID), providerPoolTokenTTL)
	require.NoError(t, err)
	require.True(t, f.poolCredentialLive(t, workspaceID))
}

// addPersonBox is the control: a person's own running workspace in the same
// repository, which no agent box release, retirement or sweep touches.
func (f *agentBoxRelease) addPersonBox(t *testing.T) string {
	t.Helper()
	id := uuid.NewString()
	_, err := f.pool.Exec(f.ctx, `INSERT INTO workspaces (id, repository_id, user_id, name, kind, status, target_bookmark)
		VALUES ($1,$2,$3,$4,'container','running',$5)`, id, f.box(t).RepositoryID, f.person, "person-"+id[:8], "person-"+id[:8])
	require.NoError(t, err)
	return id
}

func (f *agentBoxRelease) poolCredentialLive(t *testing.T, workspaceID string) bool {
	t.Helper()
	var n int
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT count(*) FROM access_tokens WHERE name = $1`, providerPoolTokenPrefix+workspaceID).Scan(&n))
	return n > 0
}

func (f *agentBoxRelease) requirePoolCredentialGone(t *testing.T, workspaceID, control string) {
	t.Helper()
	require.False(t, f.poolCredentialLive(t, workspaceID), "no pool credential of the box remains")
	live, err := f.q.AgentBoxCredentialsLive(f.ctx, workspaceID, workspaceChildrenTokenName(workspaceID))
	require.NoError(t, err)
	require.False(t, live, "nothing of the box reads back live")
	require.True(t, f.poolCredentialLive(t, control), "another box's pool credential survives")
}

func TestABoxsPoolCredentialIsRevokedOnReleaseRetireAndDelete(t *testing.T) {
	t.Run("a release of a running box", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		control := f.addPersonBox(t)
		f.mintPoolCredential(t, f.workspace)
		f.mintPoolCredential(t, control)

		_, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, f.session, f.run)

		require.NoError(t, err)
		f.requirePoolCredentialGone(t, f.workspace, control)

		// The read-back counts a pool credential on its own.
		f.mintPoolCredential(t, f.workspace)
		live, err := f.q.AgentBoxCredentialsLive(f.ctx, f.workspace, workspaceChildrenTokenName(f.workspace))
		require.NoError(t, err)
		require.True(t, live, "a pool credential alone reads back live")
	})
	t.Run("a release of a stopped box", func(t *testing.T) {
		f := newAgentBoxRelease(t, "stopped")
		control := f.addPersonBox(t)
		f.mintPoolCredential(t, f.workspace)
		f.mintPoolCredential(t, control)

		_, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, f.session, f.run)

		require.NoError(t, err)
		f.requirePoolCredentialGone(t, f.workspace, control)
	})
	t.Run("a stopped box whose only live credential is its pool's is swept", func(t *testing.T) {
		f := newAgentBoxRelease(t, "stopped")
		_, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, f.session, f.run)
		require.NoError(t, err)
		control := f.addPersonBox(t)
		f.mintPoolCredential(t, f.workspace)
		f.mintPoolCredential(t, control)
		_, err = f.pool.Exec(f.ctx, `UPDATE agent_sessions SET status='completed', finished_at=NOW() WHERE id=$1`, f.session)
		require.NoError(t, err)

		require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))

		f.requirePoolCredentialGone(t, f.workspace, control)
	})
	t.Run("an idle retirement", func(t *testing.T) {
		f := idleBox(t, true)
		control := f.addPersonBox(t)
		f.mintPoolCredential(t, f.workspace)
		f.mintPoolCredential(t, control)

		require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))

		require.Positive(t, f.runtime.deletes.Load(), "the box was retired")
		f.requirePoolCredentialGone(t, f.workspace, control)
	})
	t.Run("a delete", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		control := f.addPersonBox(t)
		f.mintPoolCredential(t, f.workspace)
		f.mintPoolCredential(t, control)
		row, err := f.q.GetWorkspace(f.ctx, f.workspace)
		require.NoError(t, err)

		require.NoError(t, f.boxes.destroyWorkspace(f.ctx, row))

		require.False(t, f.poolCredentialLive(t, f.workspace), "no pool credential of the deleted box remains")
		require.True(t, f.poolCredentialLive(t, control), "another box's pool credential survives")
	})
}
