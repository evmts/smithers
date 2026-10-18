package admission

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

func TestWorkspaceBillingResolvesRetainedServiceGrants(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	var service, payer, repo int64
	var workspace string
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('retained-payer','retained-payer') RETURNING id`).Scan(&payer))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,'retained','retained') RETURNING id`, payer).Scan(&repo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,status) VALUES ($1,$2,'running') RETURNING id::text`, repo, service).Scan(&workspace))
	resolver, err := NewWorkspaceBillingResolver(ctx, pool)
	require.NoError(t, err)
	legacy := sandbox.BillingOwner{Type: "user", ID: service}
	actual, err := resolver.Resolve(ctx, workspace, legacy)
	require.NoError(t, err)
	require.Equal(t, sandbox.BillingOwner{Type: "user", ID: payer}, actual)
	_, err = resolver.Resolve(ctx, uuid.NewString(), legacy)
	require.Error(t, err, "the machine service account never becomes a fallback payer")
	for _, grant := range []sandbox.BillingOwner{{Type: "user", ID: payer}, {Type: "org", ID: service}} {
		actual, err = resolver.Resolve(ctx, uuid.NewString(), grant)
		require.NoError(t, err)
		require.Equal(t, grant, actual, "standalone trusted grants retain their typed account")
	}
	for _, resource := range []string{"", "42", "repository:42"} {
		grant := sandbox.BillingOwner{Type: "user", ID: payer}
		actual, err = resolver.Resolve(ctx, resource, grant)
		require.NoError(t, err)
		require.Equal(t, grant, actual)
	}
	_, err = resolver.Resolve(ctx, "", legacy)
	require.Error(t, err, "a placement that names nothing never falls back to the machine service")
	_, err = resolver.Resolve(ctx, workspace, sandbox.BillingOwner{})
	require.Error(t, err)
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = resolver.Resolve(canceled, workspace, legacy)
	require.Error(t, err)
	_, err = NewWorkspaceBillingResolver(canceled, pool)
	require.Error(t, err)
	_, err = NewWorkspaceBillingResolver(ctx, nil)
	require.Error(t, err)
}

// plue#839: until organizations have plans of their own (mvp.md M-09), the
// product grants a listed free organization's machines and CI guests to the
// machine service user. The controller keeps that grant instead of re-billing
// the organization's free 1 GiB.
func TestWorkspaceBillingKeepsAnOrganizationRepositoryGrant(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	var service, org, repo int64
	var workspace string
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	_, err := pool.Exec(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('placeholder-839','placeholder-839')`)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('lanes-org','lanes-org') RETURNING id`).Scan(&org))
	require.NotEqual(t, service, org)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'lanes','lanes') RETURNING id`, org).Scan(&repo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,status) VALUES ($1,$2,'running') RETURNING id::text`, repo, service).Scan(&workspace))
	resolver, err := NewWorkspaceBillingResolver(ctx, pool, org)
	require.NoError(t, err)
	machines := sandbox.BillingOwner{Type: "user", ID: service}
	for _, grant := range []sandbox.BillingOwner{machines, {Type: "org", ID: org}} {
		actual, err := resolver.Resolve(ctx, workspace, grant)
		require.NoError(t, err)
		require.Equal(t, grant, actual, "a listed organization repository's machine keeps the product's grant")
	}
	// A CI task guest is named by its task number, not a workspace.
	actual, err := resolver.Resolve(ctx, "128717", machines)
	require.NoError(t, err)
	require.Equal(t, machines, actual)
}

// Security s-6tctk6 (plue#839): a machine service grant on an organization
// the deployment does not list is billed to that organization, as before
// 605751cd, whether it was retained from an earlier build or written by
// mistake. With nothing listed, no placement keeps a service grant it cannot
// tie to a listed organization's workspace.
func TestWorkspaceBillingRebillsAnUnlistedOrganizationsServiceGrant(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	var service, listed, outside, repo, member int64
	var workspace string
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	_, err := pool.Exec(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('placeholder-s6','placeholder-s6')`)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('listed-s6','listed-s6') RETURNING id`).Scan(&listed))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('outside-s6','outside-s6') RETURNING id`).Scan(&outside))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('outside-member','outside-member') RETURNING id`).Scan(&member))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'free','free') RETURNING id`, outside).Scan(&repo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,status) VALUES ($1,$2,'running') RETURNING id::text`, repo, service).Scan(&workspace))
	machines := sandbox.BillingOwner{Type: "user", ID: service}
	organization := sandbox.BillingOwner{Type: "org", ID: outside}
	for name, allowlist := range map[string][]int64{"empty": nil, "another organization listed": {listed}} {
		t.Run(name, func(t *testing.T) {
			resolver, err := NewWorkspaceBillingResolver(ctx, pool, allowlist...)
			require.NoError(t, err)
			for _, grant := range []sandbox.BillingOwner{machines, {Type: "user", ID: member}, organization} {
				actual, err := resolver.Resolve(ctx, workspace, grant)
				require.NoError(t, err)
				require.Equal(t, organization, actual, "the outside organization pays for its own machine")
			}
			if len(allowlist) == 0 {
				_, err = resolver.Resolve(ctx, "128717", machines)
				require.Error(t, err, "with no organization listed, a CI guest never bills the machine service")
			}
		})
	}
}
