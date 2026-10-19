package services

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// dirtyStarts are the starts outside a session's turn that would reach its
// box's guest: a resume, SSH and a terminal.
var dirtyStarts = map[string]func(t *testing.T, f *agentBoxRelease) error{
	"resume": func(t *testing.T, f *agentBoxRelease) error {
		_, err := f.boxes.ResumeWorkspace(f.ctx, f.workspace, f.box(t).RepositoryID, f.person)
		return err
	},
	"ssh": func(t *testing.T, f *agentBoxRelease) error {
		f.boxes.workspaceSSHUsername, f.boxes.sandbox = "agent", &mockSandboxVMClient{}
		defer func() { f.boxes.sandbox = nil }()
		_, err := f.boxes.GetWorkspaceSSHConnectionInfo(f.ctx, f.workspace, f.box(t).RepositoryID, f.person)
		return err
	},
	"terminal": func(t *testing.T, f *agentBoxRelease) error {
		repo := f.box(t).RepositoryID
		slug, err := f.q.GetRepoOwnerSlugAndNameByID(f.ctx, repo)
		require.NoError(t, err)
		_, err = f.boxes.CreateSession(f.ctx, CreateWorkspaceSessionInput{RepositoryID: repo, UserID: f.person, WorkspaceID: f.workspace,
			RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName, Cols: 80, Rows: 24})
		return err
	},
}

// A start outside its session's turn never hands a dirty guest a fresh
// credential (Security d-nhn9cy finding 1). A run left a credential reader on
// its box and the box was quiesced, not retired: a resume, SSH or a terminal
// is refused, retryably, with nothing minted beside the reader; the box is
// retired in the background; and the retried start gets a new guest.
func TestADirtySessionBoxGetsNoFreshCredentialOutsideItsTurn(t *testing.T) {
	for name, start := range dirtyStarts {
		t.Run(name, func(t *testing.T) {
			f := newAgentBoxRelease(t, "running")
			f.endRunUnreleased(t)
			quiesce, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, "", 0)
			require.NoError(t, err)
			require.Equal(t, agentWorkspaceQuiesced, quiesce.Outcome)
			f.requireDirty(t, "a quiesced box stays dirty")
			f.hosted.processes["reader"] = true

			err = start(t, f)

			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, 503, api.Status, "the start is refused, retryably")
			require.Empty(t, f.hosted.captured, "no credential was minted beside the reader")
			require.False(t, f.box(t).HeadPushTokenID.Valid, "no head token was issued to the dirty guest")

			require.Eventually(t, func() bool {
				box, err := f.q.GetWorkspace(f.ctx, f.workspace)
				return err == nil && box.Status == "suspended"
			}, 30*time.Second, 20*time.Millisecond, "the box is retired in the background")
			retired := f.box(t)
			require.Equal(t, "suspended", retired.Status, "the box is retired")
			require.Empty(t, retired.VmID)
			require.Equal(t, int32(1), f.runtime.deletes.Load(), "its dirty guest is deleted")
			require.False(t, f.hosted.processes["reader"], "the reader went with its guest")

			_, err = f.boxes.ResumeWorkspace(f.ctx, f.workspace, retired.RepositoryID, f.person)
			require.NoError(t, err, "the retried start builds a new guest")
			box := f.box(t)
			require.Equal(t, "running", box.Status)
			require.NotEmpty(t, box.VmID)
			require.NotEqual(t, "vm-agent-box", box.VmID, "a new guest")
			require.Equal(t, 1, f.hosted.creates)
			require.Empty(t, f.hosted.captured, "and nothing reached a reader")
		})
	}

	t.Run("a start during its turn goes ahead on its guest", func(t *testing.T) {
		f := newAgentBoxRelease(t, "running")
		f.requireDirty(t, "a box with a turn in progress is dirty")

		_, err := f.boxes.ResumeWorkspace(f.ctx, f.workspace, f.box(t).RepositoryID, f.person)

		require.NoError(t, err)
		require.Equal(t, "vm-agent-box", f.box(t).VmID, "the turn keeps its guest")
		require.Zero(t, f.runtime.deletes.Load())
	})
}

// A guest that turns dirty after the start loaded its box, before the start's
// authorization transaction reads it, is refused (G4.1 shape): the dirty check
// is read on the transaction's own connection, never taken from the row the
// start loaded before, and nothing is minted beside the reader.
func TestAGuestThatTurnsDirtyBetweenTheTwoChecksIsRefused(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	f.endRunUnreleased(t)
	quiesce, err := f.boxes.QuiesceAgentBox(f.ctx, f.workspace, "", 0)
	require.NoError(t, err)
	require.Equal(t, agentWorkspaceQuiesced, quiesce.Outcome)
	// The start loads a clean guest ...
	_, err = f.pool.Exec(f.ctx, `UPDATE workspaces SET agent_box_dirty_vm_id = '' WHERE id = $1`, f.workspace)
	require.NoError(t, err)
	f.hosted.processes["reader"] = true
	// ... which turns dirty inside the start's transaction, before its check.
	turned := false
	f.boxes.agentBoxReleaseHook = func(point, id string) {
		if point != agentBoxBeforeStartCheck || id != f.workspace || turned {
			return
		}
		turned = true
		ctx, cancel := context.WithTimeout(f.ctx, 5*time.Second)
		defer cancel()
		_, err := f.pool.Exec(ctx, `UPDATE workspaces SET agent_box_dirty_vm_id = vm_id WHERE id = $1`, f.workspace)
		require.NoError(t, err, "the mark is written from another connection while the start's transaction is open")
	}

	_, err = f.boxes.ResumeWorkspace(f.ctx, f.workspace, f.box(t).RepositoryID, f.person)

	require.True(t, turned, "the guest turned dirty inside the start's transaction")
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, 503, api.Status, "the start is refused, retryably")
	require.Empty(t, f.hosted.captured, "nothing was minted beside the reader")
	require.False(t, f.box(t).HeadPushTokenID.Valid, "no head token was issued to the dirty guest")
	require.Eventually(t, func() bool {
		box, err := f.q.GetWorkspace(f.ctx, f.workspace)
		return err == nil && box.Status == "suspended"
	}, 30*time.Second, 20*time.Millisecond, "the box is retired in the background")
	require.False(t, f.hosted.processes["reader"], "the reader went with its guest")
}

// A start inside its session's turn holds the session row for its whole
// authorization transaction (G4 review of g3b-2.1): the turn cannot end
// between the start's dirty check and what the start mints. Ending the turn
// at that point is refused by the lock, and the release that follows the
// turn's end revokes everything, the start's credentials included.
func TestATurnCannotEndBetweenAStartsDirtyCheckAndItsMint(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	f.requireDirty(t, "a box with a turn in progress is dirty")
	fired := false
	var ended error
	f.boxes.agentBoxReleaseHook = func(point, id string) {
		if point != agentBoxAfterStartCheck || id != f.workspace || fired {
			return
		}
		fired = true
		// The turn ends now, from another connection, and its release would
		// follow: the session row the start holds refuses the end.
		_, ended = f.pool.Exec(f.ctx, `UPDATE agent_sessions SET status = 'completed', finished_at = NOW()
			WHERE id IN (SELECT id FROM agent_sessions WHERE id = $1 FOR UPDATE NOWAIT)`, f.session)
	}

	_, err := f.boxes.ResumeWorkspace(f.ctx, f.workspace, f.box(t).RepositoryID, f.person)

	require.NoError(t, err, "a start inside its turn goes ahead")
	require.True(t, fired, "the start passed its dirty check inside its transaction")
	var pgErr *pgconn.PgError
	require.ErrorAs(t, ended, &pgErr, "the turn could not end while the start held its session")
	require.Equal(t, "55P03", pgErr.Code, "lock_not_available")
	require.Equal(t, "active", f.sessionStatus(t), "the turn is still in progress after the start")

	// The turn ends after the start committed; its release revokes what the
	// start minted along with the rest.
	f.finish(t)

	box := f.box(t)
	require.False(t, box.HeadPushTokenID.Valid, "no head token outlives the turn")
	require.Equal(t, "suspended", box.Status, "the release retired the box the start used")
	f.requireRunTokensRevoked(t, "head", "landing", "cache", "api")
}

func (f *agentBoxRelease) sessionStatus(t *testing.T) string {
	t.Helper()
	var status string
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT status FROM agent_sessions WHERE id = $1`, f.session).Scan(&status))
	return status
}
