package services

import (
	"testing"
	"time"

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
