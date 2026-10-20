package compose

import (
	"context"
	"net/http"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// workspacesUnavailableMessage is the refusal a non-staff person sees on a
// hosted manual workspace route.
const workspacesUnavailableMessage = "Workspaces aren't open on smithers.sh yet. Ask for a change instead."

// hostedWorkspaceStaffGate closes the manual workspace routes that create or
// wake a box (create and snapshot restore, resume, fork, snapshots, session
// create) to everyone but the hosted staff list
// (sandbox.hosted_workspace_user_ids). Those routes take no per-payer lock
// and no plan check, and the shared pool is small; an agent turn starts its
// own box through agent dispatch and never comes here.
//
// It returns no middleware outside multitenant mode, so a single-owner
// install is unchanged. Mount it after RequireAuth: an unauthenticated
// request keeps its 401, and a missing user is refused, never admitted.
func hostedWorkspaceStaffGate(cfg *config.Config) []func(http.Handler) http.Handler {
	if !config.IsMultitenant(cfg.Auth) {
		return nil
	}
	staff := cfg.Sandbox.HostedWorkspaceUsers
	return []func(http.Handler) http.Handler{func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := middleware.UserFromContext(r.Context())
			if user == nil || !staff.Allows(user.ID) {
				pkgerrors.WriteError(w, pkgerrors.New(pkgerrors.CodeWorkspacesUnavailable, workspacesUnavailableMessage))
				return
			}
			next.ServeHTTP(w, r)
		})
	}}
}

// staffImportWorkspaces is the GitHub import's box provisioner on a hosted
// deployment: an import by a person off the staff list ends at source ready
// with no box (the importer treats workspaces_unavailable like a full
// allowance), and a staff import starts its box as before.
type staffImportWorkspaces struct {
	next  services.GitHubImportWorkspaceProvisioner
	staff config.HostedWorkspaceUsers
}

func (s staffImportWorkspaces) CreateWorkspaceAsync(ctx context.Context, input services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
	if !s.staff.Allows(input.UserID) {
		return services.WorkspaceResponse{}, pkgerrors.New(pkgerrors.CodeWorkspacesUnavailable, workspacesUnavailableMessage)
	}
	return s.next.CreateWorkspaceAsync(ctx, input)
}

// hostedImportWorkspaces gates the import's box on the hosted staff list.
// Outside multitenant mode it returns next unchanged.
func hostedImportWorkspaces(cfg *config.Config, next services.GitHubImportWorkspaceProvisioner) services.GitHubImportWorkspaceProvisioner {
	if !config.IsMultitenant(cfg.Auth) {
		return next
	}
	return staffImportWorkspaces{next: next, staff: cfg.Sandbox.HostedWorkspaceUsers}
}

// hostedWorkflowOwners is whose repository workflow jobs the sandbox
// scheduler runs on machines: on a multitenant deployment, the hosted staff
// list's own repositories and the service-payer organizations' (nobody by
// default), because anyone can create a repository or an organization there.
// Elsewhere it is nil, and every owner's run as before.
func hostedWorkflowOwners(cfg *config.Config) *services.WorkflowOwners {
	if !config.IsMultitenant(cfg.Auth) {
		return nil
	}
	return &services.WorkflowOwners{Users: cfg.Sandbox.HostedWorkspaceUsers, Orgs: cfg.Billing.ServicePayerOrgIDs}
}
