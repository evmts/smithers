package db

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

// sessionBoxForMarkTest is a running box with guest vmID that belongs to an
// agent session.
func sessionBoxForMarkTest(t *testing.T, pool DBTX, vmID string) (id string, userID int64) {
	t.Helper()
	ctx := context.Background()
	id = casTestWorkspace(t, pool, "running", vmID)
	var repoID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT repository_id, user_id FROM workspaces WHERE id = $1`, id).Scan(&repoID, &userID))
	session := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO agent_sessions (id, repository_id, user_id, title, status) VALUES ($1, $2, $3, 'turn', 'active')`, session, repoID, userID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE workspaces SET agent_session_id = $2, agent_box_dirty_vm_id = '' WHERE id = $1`, id, session)
	require.NoError(t, err)
	return id, userID
}

func dirtyMarkAndStage(t *testing.T, pool DBTX, id string) (mark, stage string, token pgtype.Int8) {
	t.Helper()
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT agent_box_dirty_vm_id, provisioning_stage, head_push_token_id FROM workspaces WHERE id = $1`, id).Scan(&mark, &stage, &token))
	return mark, stage, token
}

// The dirty mark is its own column, set by the very UPDATE that records a
// turn's head token (Security d-6g6nq7 finding 1): no committed row holds a
// turn's token on a guest that is not marked. The stage is untouched, a
// branch's own machine and a box with no guest are not marked, and clearing
// the token never clears the mark.
func TestRecordingAHeadTokenMarksTheSessionBoxGuestDirtyInTheSameWrite(t *testing.T) {
	ctx := context.Background()

	t.Run("SetWorkspaceHeadPushTokenID", func(t *testing.T) {
		q, pool := newQueries(t)
		id, _ := sessionBoxForMarkTest(t, pool, "vm-turn")
		token := headTokenTestToken(t, pool, id, "head")

		require.NoError(t, q.SetWorkspaceHeadPushTokenID(ctx, SetWorkspaceHeadPushTokenIDParams{ID: id, HeadPushTokenID: token}))

		mark, stage, recorded := dirtyMarkAndStage(t, pool, id)
		require.Equal(t, token, recorded)
		require.Equal(t, "vm-turn", mark, "the write that records the token marks the guest")
		require.Empty(t, stage, "the mark is not the stage")

		require.NoError(t, q.SetWorkspaceHeadPushTokenID(ctx, SetWorkspaceHeadPushTokenIDParams{ID: id}))
		mark, _, recorded = dirtyMarkAndStage(t, pool, id)
		require.False(t, recorded.Valid)
		require.Equal(t, "vm-turn", mark, "clearing the token never clears the mark")
	})

	t.Run("SwapWorkspaceHeadPushTokenID", func(t *testing.T) {
		q, pool := newQueries(t)
		id, userID := sessionBoxForMarkTest(t, pool, "vm-turn")
		token := headTokenTestToken(t, pool, id, "head")

		won, err := q.SwapWorkspaceHeadPushTokenID(ctx, id, userID, pgtype.Int8{}, token)
		require.NoError(t, err)
		require.True(t, won)

		mark, stage, recorded := dirtyMarkAndStage(t, pool, id)
		require.Equal(t, token, recorded)
		require.Equal(t, "vm-turn", mark, "the swap that records the token marks the guest")
		require.Empty(t, stage)

		won, err = q.SwapWorkspaceHeadPushTokenID(ctx, id, userID, token, pgtype.Int8{})
		require.NoError(t, err)
		require.True(t, won)
		mark, _, _ = dirtyMarkAndStage(t, pool, id)
		require.Equal(t, "vm-turn", mark, "revoking the token never clears the mark")
	})

	t.Run("a branch's own machine is not marked", func(t *testing.T) {
		q, pool := newQueries(t)
		id := casTestWorkspace(t, pool, "running", "vm-branch")
		token := headTokenTestToken(t, pool, id, "head")

		require.NoError(t, q.SetWorkspaceHeadPushTokenID(ctx, SetWorkspaceHeadPushTokenIDParams{ID: id, HeadPushTokenID: token}))

		mark, _, _ := dirtyMarkAndStage(t, pool, id)
		require.Empty(t, mark)
	})

	t.Run("a box with no guest is not marked", func(t *testing.T) {
		q, pool := newQueries(t)
		id, _ := sessionBoxForMarkTest(t, pool, "")
		token := headTokenTestToken(t, pool, id, "head")

		require.NoError(t, q.SetWorkspaceHeadPushTokenID(ctx, SetWorkspaceHeadPushTokenIDParams{ID: id, HeadPushTokenID: token}))

		mark, _, _ := dirtyMarkAndStage(t, pool, id)
		require.Empty(t, mark)
	})

	t.Run("only a new guest clears it", func(t *testing.T) {
		q, pool := newQueries(t)
		id, _ := sessionBoxForMarkTest(t, pool, "vm-turn")
		require.NoError(t, q.SetWorkspaceHeadPushTokenID(ctx, SetWorkspaceHeadPushTokenIDParams{ID: id, HeadPushTokenID: headTokenTestToken(t, pool, id, "head")}))

		_, err := q.RecordAgentBoxGuest(ctx, RecordAgentBoxGuestParams{ID: id, VmID: "vm-turn"})
		require.NoError(t, err)
		mark, _, _ := dirtyMarkAndStage(t, pool, id)
		require.Equal(t, "vm-turn", mark, "recording the same guest again keeps it dirty")

		_, err = q.RecordAgentBoxGuest(ctx, RecordAgentBoxGuestParams{ID: id, VmID: "vm-next"})
		require.NoError(t, err)
		mark, _, _ = dirtyMarkAndStage(t, pool, id)
		require.Empty(t, mark, "a new guest holds nothing of the old one")
	})
}
