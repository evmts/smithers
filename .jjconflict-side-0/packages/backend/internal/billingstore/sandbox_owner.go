package billingstore

import (
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// RepositorySandboxOwner is shared by product admission and hosted metering.
func RepositorySandboxOwner(repo db.Repository) (sandbox.BillingOwner, error) {
	owner := sandbox.BillingOwner{}
	if repo.UserID.Valid {
		owner = sandbox.BillingOwner{Type: "user", ID: repo.UserID.Int64}
	}
	if repo.OrgID.Valid {
		owner = sandbox.BillingOwner{Type: "org", ID: repo.OrgID.Int64}
	}
	if !owner.Valid() {
		return owner, pkgerrors.Internal("repository billing owner unavailable")
	}
	return owner, nil
}
