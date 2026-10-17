package services

import (
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

func TestOrganizationRepositoryFreeSandboxUsesFreeCatalog(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	var user, org int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('free-payer','free-payer') RETURNING id`).Scan(&user))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('free-org','free-org') RETURNING id`).Scan(&org))
	billing := NewBillingService(db.New(pool), nil, BillingServiceConfig{})
	personal, err := billing.SandboxEntitlement(ctx, user)
	require.NoError(t, err)
	orgCtx := sandbox.WithBillingOwner(ctx, sandbox.BillingOwner{Type: "org", ID: org})
	organization, err := billing.SandboxEntitlement(orgCtx, org)
	require.NoError(t, err)
	require.Equal(t, personal.ConcurrentSandboxes, organization.ConcurrentSandboxes)
	require.Equal(t, personal.IdleTimeoutSecs, organization.IdleTimeoutSecs)
	require.Equal(t, personal.HoursPerDay, organization.HoursPerDay)
	require.Equal(t, personal.EgressBytesPerDay, organization.EgressBytesPerDay)
	require.NoError(t, billing.AuthorizeSandboxStart(orgCtx, org))
}
