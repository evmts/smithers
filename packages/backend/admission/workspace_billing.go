package admission

import (
	"context"
	"errors"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/billingstore"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// WorkspaceBillingResolver updates persisted grants without changing placement
// identity. The service owner is read once; live repository ownership is not cached.
type WorkspaceBillingResolver struct {
	queries      *db.Queries
	serviceOwner int64
	// servicePayerOrgs are the organizations the machine service pays for.
	servicePayerOrgs []int64
}

// NewWorkspaceBillingResolver reads the machine service owner. servicePayerOrgs
// is the deployment's billing.service_payer_org_ids (plue#839).
func NewWorkspaceBillingResolver(ctx context.Context, conn DBTX, servicePayerOrgs ...int64) (*WorkspaceBillingResolver, error) {
	if conn == nil {
		return nil, errors.New("workspace billing database is required")
	}
	q := db.New(conn)
	id, err := q.GetBranchMachineOwner(ctx)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return &WorkspaceBillingResolver{queries: q, serviceOwner: id, servicePayerOrgs: slices.Clone(servicePayerOrgs)}, nil
}

func (r *WorkspaceBillingResolver) Resolve(ctx context.Context, workspaceID string, grant sandbox.BillingOwner) (sandbox.BillingOwner, error) {
	if !grant.Valid() {
		return sandbox.BillingOwner{}, errors.New("invalid workspace billing owner")
	}
	service := grant.Type == "user" && grant.ID == r.serviceOwner
	id, err := uuid.Parse(workspaceID)
	if err != nil {
		// A trusted standalone placement keeps its explicit account, and a CI
		// task guest, named by its task number, its repository payer. A
		// placement that names nothing never falls back to the machine
		// service, and no placement does when it pays for no organization.
		if service && (workspaceID == "" || len(r.servicePayerOrgs) == 0) {
			return sandbox.BillingOwner{}, errors.New("workspace billing owner unavailable")
		}
		return grant, nil
	}
	owner, err := r.queries.GetWorkspaceBillingOwner(ctx, id.String())
	if errors.Is(err, pgx.ErrNoRows) {
		// The machine service identity is never a fallback payer for a
		// workspace that is gone.
		if service {
			return sandbox.BillingOwner{}, errors.New("workspace billing owner unavailable")
		}
		return grant, nil
	}
	if err != nil {
		return sandbox.BillingOwner{}, err
	}
	// Until organizations have plans (mvp.md M-09), the product grants a
	// listed free organization's machines to the machine service user
	// (plue#839), and that grant stands. Every other grant bills the
	// repository's owner, an unlisted organization included (Security
	// s-6tctk6).
	if service && owner.OrgID.Valid && slices.Contains(r.servicePayerOrgs, owner.OrgID.Int64) {
		return grant, nil
	}
	return billingstore.RepositorySandboxOwner(db.Repository{UserID: owner.UserID, OrgID: owner.OrgID})
}
