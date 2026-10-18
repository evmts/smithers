package admission

import (
	"context"
	"errors"
	"slices"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/billingstore"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// CITaskResourceKind is the resource kind of a CI task guest's placement. Its
// resource ID is the task number.
const CITaskResourceKind = "workflow_task"

// WorkspaceBillingResolver updates persisted grants without changing placement
// identity. The service owner is read once; live repository ownership and
// plans are not cached.
type WorkspaceBillingResolver struct {
	queries      *db.Queries
	plans        *services.BillingService
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
	return &WorkspaceBillingResolver{
		queries: q, plans: services.NewBillingService(q, nil, services.BillingServiceConfig{}),
		serviceOwner: id, servicePayerOrgs: slices.Clone(servicePayerOrgs),
	}, nil
}

// Resolve returns who pays now for the placement named by resourceKind and
// resourceID that was granted to grant. A workspace (named by its UUID) and a
// CI task guest (CITaskResourceKind, named by its task number) follow their
// repository: a machine service grant stands only where the product would
// write it now (RepositorySandboxPayer), for a listed organization without a
// paid plan (plue#839, Security s-6tctk6); every other grant bills the
// repository's owner. Any other trusted standalone placement keeps its
// explicit account. The machine service never pays for a placement whose
// repository cannot be found.
func (r *WorkspaceBillingResolver) Resolve(ctx context.Context, resourceKind, resourceID string, grant sandbox.BillingOwner) (sandbox.BillingOwner, error) {
	if !grant.Valid() {
		return sandbox.BillingOwner{}, errors.New("invalid workspace billing owner")
	}
	service := grant.Type == "user" && grant.ID == r.serviceOwner
	repo, err := r.placementRepository(ctx, resourceKind, resourceID)
	if errors.Is(err, pgx.ErrNoRows) {
		if service {
			return sandbox.BillingOwner{}, errors.New("workspace billing owner unavailable")
		}
		return grant, nil
	}
	if err != nil {
		return sandbox.BillingOwner{}, err
	}
	if service {
		return services.RepositorySandboxPayer(ctx, repo, r.plans, branchMachineOwner(r.serviceOwner), r.servicePayerOrgs)
	}
	return billingstore.RepositorySandboxOwner(repo)
}

// placementRepository reads the owner of the repository a workspace or a CI
// task guest runs for. Any other placement, or one that is gone, is
// pgx.ErrNoRows.
func (r *WorkspaceBillingResolver) placementRepository(ctx context.Context, resourceKind, resourceID string) (db.Repository, error) {
	if id, err := uuid.Parse(resourceID); err == nil {
		owner, err := r.queries.GetWorkspaceBillingOwner(ctx, id.String())
		return db.Repository{UserID: owner.UserID, OrgID: owner.OrgID}, err
	}
	task, err := strconv.ParseInt(resourceID, 10, 64)
	if resourceKind != CITaskResourceKind || err != nil || task <= 0 {
		return db.Repository{}, pgx.ErrNoRows
	}
	owner, err := r.queries.GetWorkflowTaskBillingOwner(ctx, task)
	return db.Repository{UserID: owner.UserID, OrgID: owner.OrgID}, err
}

// branchMachineOwner is the machine service user the resolver read at
// construction; zero means the install has none.
type branchMachineOwner int64

func (o branchMachineOwner) GetBranchMachineOwner(context.Context) (int64, error) {
	if o <= 0 {
		return 0, pgx.ErrNoRows
	}
	return int64(o), nil
}
