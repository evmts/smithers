package services

import (
	"context"
	"testing"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

func TestWorkspaceCustomImageDiskAdmissionUsesMatchingRuntimeCapability(t *testing.T) {
	for _, tc := range []struct {
		name                                    string
		custom, genericDisk, customDisk, wantOK bool
	}{
		{name: "custom disk", custom: true, customDisk: true, wantOK: true},
		{name: "prepared image disk", customDisk: true},
		{name: "custom disk unsupported", custom: true},
		{name: "generic disk", genericDisk: true, wantOK: true},
		{name: "generic covers custom", custom: true, genericDisk: true, wantOK: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			runtime := &resourceRuntime{caps: workspaceapi.WorkspaceCapabilities{Resources: true, ResourcesDisk: tc.genericDisk, CustomImageResourcesDisk: tc.customDisk}}
			s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceRuntime(runtime))
			input := CreateWorkspaceInput{Resources: WorkspaceResources{DiskGiB: resourcePtr(32)}}
			row := sizedWorkspace("container", 2, 4096, 32768)
			if tc.custom {
				input.Image = testCustomImageRef
				row.ImageRef = customText(testCustomImageRef)
				row.ImageDigest = customText(testCustomImageDigest)
			}
			err := s.validateWorkspaceResources(input)
			resources, recoveryErr := s.runtimeWorkspaceResources(row)
			if tc.wantOK {
				require.NoError(t, err)
				require.NoError(t, recoveryErr)
				require.Equal(t, int32(32768), resources.DiskMB)
			} else {
				require.ErrorContains(t, err, "resources.disk_gib")
				require.ErrorContains(t, recoveryErr, "resources.disk_gib")
				require.Nil(t, resources)
			}
		})
	}
}

func TestWorkspaceCustomImageDisabledFlagPrecedesDiskAdmission(t *testing.T) {
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceRuntime(&resourceRuntime{}))
	_, err := s.CreateWorkspaceAsync(context.Background(), CreateWorkspaceInput{RepositoryID: 101, UserID: 1, Image: testCustomImageRef, Resources: WorkspaceResources{DiskGiB: resourcePtr(32)}})
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeWorkspaceCustomImagesDisabled, api.Code)
}

func TestWorkspaceCustomImageCPUOnlySizingDoesNotOverridePreparedDisk(t *testing.T) {
	runtime := &resourceRuntime{caps: workspaceapi.WorkspaceCapabilities{Resources: true, CustomImageResourcesDisk: true}}
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceRuntime(runtime))
	resources := s.resolveWorkspaceResources(WorkspaceResources{CPUs: resourcePtr(1)})
	require.Equal(t, int32(32), *resources.DiskGiB)
	require.ErrorContains(t, s.validateWorkspaceResources(CreateWorkspaceInput{Resources: resources}), "resources.disk_gib")
	require.NoError(t, s.validateWorkspaceResources(CreateWorkspaceInput{Image: testCustomImageRef, Resources: resources}))
}
