package process

import (
	"context"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// ResolveWorkspaceSourceRevision applies the common source rule to this
// adapter's workspace.
func (r *Runtime) ResolveWorkspaceSourceRevision(ctx context.Context, workspaceID string) (string, error) {
	return workspaceapi.ResolveSourceRevision(ctx, r, workspaceID)
}

var _ workspaceapi.WorkspaceSourceRevisionResolver = (*Runtime)(nil)
