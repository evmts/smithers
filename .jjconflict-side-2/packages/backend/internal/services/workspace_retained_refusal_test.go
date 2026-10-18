package services

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

// Production box 1d7209c4-1915-4433-bc2b-c15376574147 is a kind="container"
// machine of this deployment's branch-machine owner with no Mythical lane: a
// scratch machine, not a branch. Its DELETE answered 409 "branch is retained".
// keepTodoWorkspace retains it on purpose — the durable service owner is the
// scratch machines' identity too, and kind alone is not a branch-machine
// discriminator — but the two retentions are not the same fact, and the owner
// was told the one that is false about their machine. The scratch arm's own
// contract (TestCleanupRetainsScratchMachineWithoutLane) holds "vm",
// "container" and "agent" there, and the lane arm's table keeps a legacy
// non-branch consumer deletable, so the sentence is the only thing that
// cannot tell them apart.
func TestRetentionRefusalNamesWhatItRetained(t *testing.T) {
	for _, tc := range []struct {
		name    string
		kind    string
		laneErr error
		owner   int64
		want    string
		notWant string
	}{
		{
			name: "scratch machine of the branch-machine owner",
			kind: "container", laneErr: pgx.ErrNoRows, owner: 42,
			want:    workspaceRetainedMessage,
			notWant: "branch is retained",
		},
		{
			name: "lane-bound agent machine",
			kind: "agent", laneErr: nil, owner: 0,
			want: workspaceRetainedMessage,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := &cleanupBranchStore{cleanupLaneStore: &cleanupLaneStore{
				mockWorkspaceQuerier: &mockWorkspaceQuerier{}, laneErr: tc.laneErr,
			}, owner: tc.owner}
			row := db.Workspace{ID: "retained-box", UserID: 42, Kind: tc.kind, Status: "running"}
			err := newWorkspaceServiceForTests(q).destroyWorkspace(context.Background(), row)
			require.ErrorIs(t, err, errTodoWorkspaceRetained)
			require.Contains(t, err.Error(), tc.want)
			if tc.notWant != "" {
				require.NotContains(t, err.Error(), tc.notWant)
			}
		})
	}
}
