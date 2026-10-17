package services

import (
	"context"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// Service authority is a private value, not an HTTP/context flag, user ID,
// ownership grant or share. Only persisted lane/run lifecycle adapters mint it.
// Person authorization remains requireWorkspaceAccess/withWorkspaceMutationAuthority.
type serviceMachineRequest struct {
	workspaceID  string
	repositoryID int64
}
type serviceMachineAuthority struct{ row db.Workspace }

func (s *WorkspaceService) loadServiceMachineAuthority(ctx context.Context, request serviceMachineRequest) (serviceMachineAuthority, error) {
	row, err := s.q.GetWorkspace(ctx, request.workspaceID)
	if err != nil {
		return serviceMachineAuthority{}, err
	}
	if row.RepositoryID != request.repositoryID || row.DeletedAt.Valid {
		return serviceMachineAuthority{}, pkgerrors.Forbidden("service machine authority mismatch")
	}
	return serviceMachineAuthority{row: row}, nil
}

func (s *WorkspaceService) withServiceMachineMutation(ctx context.Context, authority serviceMachineAuthority, fn func(context.Context) error) error {
	current, err := s.loadServiceMachineAuthority(ctx, serviceMachineRequest{workspaceID: authority.row.ID, repositoryID: authority.row.RepositoryID})
	if err != nil {
		return err
	}
	if current.row.UserID != authority.row.UserID {
		return pkgerrors.Forbidden("service machine authority changed")
	}
	return fn(ctx)
}

func (s *WorkspaceService) ensureServiceWorkspaceRunning(ctx context.Context, row db.Workspace, input CreateWorkspaceSessionInput) (db.Workspace, error) {
	authority, err := s.loadServiceMachineAuthority(ctx, serviceMachineRequest{workspaceID: row.ID, repositoryID: row.RepositoryID})
	if err != nil {
		return row, err
	}
	return s.withWorkspaceProvisionLock(ctx, authority.row, func(current db.Workspace) (db.Workspace, error) {
		return s.ensureWorkspaceRunningWithRuntimeStart(ctx, current, input, func(ctx context.Context, row db.Workspace, requesterID int64) (db.Workspace, error) {
			return s.ensureRuntimeWorkspaceRunningWithMutation(ctx, row, requesterID, func(fn func(context.Context) error) error {
				return s.withServiceMachineMutation(ctx, authority, fn)
			})
		})
	})
}

// This dispatch is used only by persisted lane creation and the provisioning
// reconciler. HTTP creation, SSH and session entry keep the person path.
func (s *WorkspaceService) provisionPersistedMachineAsync(ctx context.Context, row db.Workspace, input CreateWorkspaceSessionInput) error {
	background, err := s.isServiceBackgroundMachine(ctx, row.ID)
	if err != nil {
		return err
	}
	if background {
		s.provisionServiceWorkspaceAsync(ctx, row, input)
	} else {
		s.provisionWorkspaceAsync(ctx, row, input)
	}
	return nil
}

func (s *WorkspaceService) isServiceBackgroundMachine(ctx context.Context, id string) (bool, error) {
	store, ok := s.q.(interface {
		IsWorkflowBackgroundWorkspace(context.Context, string) (bool, error)
	})
	if !ok {
		return false, nil
	} // legacy unit stores cannot represent background machines
	return store.IsWorkflowBackgroundWorkspace(ctx, id)
}
