package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// A workspace offers two SSH users: the workspace user (default) and root.
// The grant is bound to exactly the requested one.
func TestWorkspaceService_GetWorkspaceSSHConnectionInfoAs_BindsGrantToRequestedUser(t *testing.T) {
	t.Parallel()

	const wsID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	q := &mockWorkspaceQuerier{
		getWorkspaceByRepoFn: func(ctx context.Context, arg db.GetWorkspaceByRepoParams) (db.Workspace, error) {
			workspace := sampleDBWorkspace(arg.ID)
			workspace.VmID = "vm-root"
			return workspace, nil
		},
	}
	var granted []string
	grants := 0
	svc := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true),
		WithWorkspaceSandboxClient(&mockWorkspaceSandboxVMClient{
			grantVMPermissionFn: func(ctx context.Context, identityID, vmID string, req sandbox.GrantAccessRequest) (sandbox.AccessGrant, error) {
				granted = req.AllowedUsers
				grants++
				return sandbox.AccessGrant{ID: "perm"}, nil
			},
		}),
		WithWorkspaceSSHHost("ssh.jjhub.tech"),
	)

	info, err := svc.GetWorkspaceSSHConnectionInfoAs(context.Background(), wsID, 101, 1, "root")
	require.NoError(t, err)
	assert.Equal(t, []string{"root"}, granted)
	assert.Equal(t, "root", info.Username)
	assert.Equal(t, "vm-root+root@ssh.jjhub.tech", info.SSHHost)
	assert.Contains(t, info.Command, "ssh vm-root+root:")

	info, err = svc.GetWorkspaceSSHConnectionInfoAs(context.Background(), wsID, 101, 1, "")
	require.NoError(t, err)
	assert.Equal(t, []string{"developer"}, granted, "empty means the workspace user")
	assert.Equal(t, "developer", info.Username)

	_, err = svc.GetWorkspaceSSHConnectionInfoAs(context.Background(), wsID, 101, 1, "postgres")
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeWorkspaceSSHUserInvalid, apiErr.Code)
	assert.Equal(t, 2, grants, "no grant is minted for a refused user")
}

func TestWorkspaceRootSSHFeatureFlagRefusesBeforeStoreOrProvider(t *testing.T) {
	for _, tc := range []struct{ configured, requested string }{
		{"developer", "root"}, {"root", "root"}, {"root", ""},
	} {
		t.Run(tc.configured+":"+tc.requested, func(t *testing.T) {
			q := &mockWorkspaceQuerier{getWorkspaceByRepoFn: func(context.Context, db.GetWorkspaceByRepoParams) (db.Workspace, error) {
				t.Fatal("flag-off root reached persistence")
				return db.Workspace{}, nil
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(sandboxUntouched(t)))
			s.workspaceSSHUsername = tc.configured
			_, err := s.GetWorkspaceSSHConnectionInfoAs(context.Background(), "workspace", 101, 1, tc.requested)
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, pkgerrors.CodeWorkspaceCustomImagesDisabled, api.Code)
			require.Equal(t, 403, api.Status)
			require.Contains(t, api.Message, "SMITHERS_FEATURE_FLAGS_WORKSPACE_CUSTOM_IMAGES")
		})
	}
}

func TestWorkspaceRootSSHFeatureFlagCoversInternalAndSessionEntrypoints(t *testing.T) {
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceSandboxClient(sandboxUntouched(t)))
	for _, call := range []func() (WorkspaceSSHConnectionInfo, error){
		func() (WorkspaceSSHConnectionInfo, error) {
			return s.buildWorkspaceSSHConnectionInfoAs(context.Background(), sampleDBWorkspace("workspace"), "root")
		},
		func() (WorkspaceSSHConnectionInfo, error) {
			s.workspaceSSHUsername = "root"
			return s.buildWorkspaceSSHConnectionInfo(context.Background(), sampleDBWorkspace("workspace"))
		},
		func() (WorkspaceSSHConnectionInfo, error) {
			s.workspaceSSHUsername = "root"
			return s.GetSSHConnectionInfo(context.Background(), "session", 101, 1)
		},
	} {
		_, err := call()
		var api *pkgerrors.APIError
		require.ErrorAs(t, err, &api)
		require.Equal(t, pkgerrors.CodeWorkspaceCustomImagesDisabled, api.Code)
	}
}
