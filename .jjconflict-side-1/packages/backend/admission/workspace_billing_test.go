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
		_, err = resolver.Resolve(ctx, resource, legacy)
		require.Error(t, err)
	}
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
