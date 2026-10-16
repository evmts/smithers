package admission

import (
	"context"
	"errors"

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
}

func NewWorkspaceBillingResolver(ctx context.Context, conn DBTX) (*WorkspaceBillingResolver, error) {
	if conn == nil {
		return nil, errors.New("workspace billing database is required")
	}
	q := db.New(conn)
	id, err := q.GetBranchMachineOwner(ctx)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return &WorkspaceBillingResolver{queries: q, serviceOwner: id}, nil
}

func (r *WorkspaceBillingResolver) Resolve(ctx context.Context, workspaceID string, grant sandbox.BillingOwner) (sandbox.BillingOwner, error) {
	if !grant.Valid() {
		return sandbox.BillingOwner{}, errors.New("invalid workspace billing owner")
	}
	var owner db.GetWorkspaceBillingOwnerRow
	id, err := uuid.Parse(workspaceID)
	if err == nil {
		owner, err = r.queries.GetWorkspaceBillingOwner(ctx, id.String())
	} else {
		err = pgx.ErrNoRows
	}

	if errors.Is(err, pgx.ErrNoRows) {
		// Trusted standalone placements retain their explicit account. The machine
		// service identity is never a fallback payer.
		if grant.Type == "user" && grant.ID == r.serviceOwner {
			return sandbox.BillingOwner{}, errors.New("workspace billing owner unavailable")
		}
		return grant, nil
	}
	if err != nil {
		return sandbox.BillingOwner{}, err
	}
	return billingstore.RepositorySandboxOwner(db.Repository{UserID: owner.UserID, OrgID: owner.OrgID})
}
