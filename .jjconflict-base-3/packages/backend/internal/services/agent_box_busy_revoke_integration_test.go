package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// A revocation of a stopped box that finds its session held by a start
// (55P03 on its advisory lock, answered busy) revokes nothing and says the box was kept, never
// released; the sweep, which lists boxes by the credentials they still hold,
// revokes everything once the start ends (G4 review of g3b delta 3).
func TestABusyRevocationOfAStoppedBoxIsRetriedByTheSweep(t *testing.T) {
	f := newAgentBoxRelease(t, "stopped")
	binding, control := f.sealHostCredential(t)
	children := f.mintChildrenToken(t)
	start, err := f.pool.Begin(f.ctx)
	require.NoError(t, err)
	defer func() { _ = start.Rollback(context.Background()) }()
	// A start inside the session's turn holds its session's lock shared.
	require.NoError(t, db.LockAgentBoxSessionForStart(f.ctx, start, f.workspace))

	got, err := f.boxes.ReleaseAgentWorkspace(f.ctx, f.workspace, f.session, f.run)

	require.NoError(t, err)
	require.Equal(t, agentWorkspaceKeptInUse, got.Outcome, "a busy revocation is not a release")
	require.False(t, got.Quiesced)
	require.True(t, f.tokenLive(t, "landing"), "a busy revocation revokes nothing")
	live, err := f.q.AgentBoxCredentialsLive(f.ctx, f.workspace, workspaceChildrenTokenName(f.workspace))
	require.NoError(t, err)
	require.True(t, live, "and the sweep can still see the credentials it left")

	require.NoError(t, start.Rollback(f.ctx))
	_, err = f.pool.Exec(f.ctx, `UPDATE agent_sessions SET status='completed', finished_at=NOW() WHERE id=$1`, f.session)
	require.NoError(t, err)
	require.NoError(t, f.boxes.RetireIdleAgentBoxes(f.ctx))
	f.requireEveryCredentialGone(t, children, binding, control)
}
