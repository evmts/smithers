package admission

import (
	"context"
	"strconv"
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
	actual, err := resolver.Resolve(ctx, "workspace", workspace, legacy)
	require.NoError(t, err)
	require.Equal(t, sandbox.BillingOwner{Type: "user", ID: payer}, actual)
	_, err = resolver.Resolve(ctx, "workspace", uuid.NewString(), legacy)
	require.Error(t, err, "the machine service account never becomes a fallback payer")
	for _, grant := range []sandbox.BillingOwner{{Type: "user", ID: payer}, {Type: "org", ID: service}} {
		actual, err = resolver.Resolve(ctx, "workspace", uuid.NewString(), grant)
		require.NoError(t, err)
		require.Equal(t, grant, actual, "standalone trusted grants retain their typed account")
	}
	for _, resource := range []string{"", "42", "repository:42"} {
		grant := sandbox.BillingOwner{Type: "user", ID: payer}
		actual, err = resolver.Resolve(ctx, "workspace", resource, grant)
		require.NoError(t, err)
		require.Equal(t, grant, actual)
	}
	_, err = resolver.Resolve(ctx, "workspace", "", legacy)
	require.Error(t, err, "a placement that names nothing never falls back to the machine service")
	_, err = resolver.Resolve(ctx, "workspace", workspace, sandbox.BillingOwner{})
	require.Error(t, err)
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = resolver.Resolve(canceled, "workspace", workspace, legacy)
	require.Error(t, err)
	_, err = NewWorkspaceBillingResolver(canceled, pool)
	require.Error(t, err)
	_, err = NewWorkspaceBillingResolver(ctx, nil)
	require.Error(t, err)
}

// plue#839: until organizations have plans of their own (mvp.md M-09), the
// product grants a listed free organization's machines to the machine service
// user (CI guests: TestWorkspaceBillingResolvesACITaskGrantThroughItsRepository). The controller keeps that grant instead of re-billing
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
		actual, err := resolver.Resolve(ctx, "workspace", workspace, grant)
		require.NoError(t, err)
		require.Equal(t, grant, actual, "a listed organization repository's machine keeps the product's grant")
	}
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
				actual, err := resolver.Resolve(ctx, "workspace", workspace, grant)
				require.NoError(t, err)
				require.Equal(t, organization, actual, "the outside organization pays for its own machine")
			}
			if len(allowlist) == 0 {
				_, err = resolver.Resolve(ctx, CITaskResourceKind, "128717", machines)
				require.Error(t, err, "a CI guest whose task cannot be found never bills the machine service")
			}
		})
	}
}

// Codex review HIGH (plue#839): a CI task guest is named by its task number,
// and a retained machine service grant on it must follow the task's
// repository like a workspace's does. A listed organization's task keeps the
// grant; an outside organization's task and a user's task bill their owner;
// a task or repository that cannot be found keeps no service grant.
func TestWorkspaceBillingResolvesACITaskGrantThroughItsRepository(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	var service, owner int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('ci-task-owner','ci-task-owner') RETURNING id`).Scan(&owner))
	_, err := pool.Exec(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('placeholder-ci','placeholder-ci')`)
	require.NoError(t, err)
	repos := map[string]int64{}
	orgs := map[string]int64{}
	for _, name := range []string{"listed", "outside"} {
		var org, repo int64
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ($1,$1) RETURNING id`, name+"-ci").Scan(&org))
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'ci','ci') RETURNING id`, org).Scan(&repo))
		orgs[name], repos[name] = org, repo
	}
	var userRepo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,'ci','ci') RETURNING id`, owner).Scan(&userRepo))
	repos["user"] = userRepo
	tasks := map[string]string{}
	for name, repo := range repos {
		var definition, run, step, task int64
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workflow_definitions (repository_id, name, path, config) VALUES ($1, 'ci', '.smithers/ci.ts', '{}') RETURNING id`, repo).Scan(&definition))
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workflow_runs (repository_id, workflow_definition_id, status, trigger_event) VALUES ($1, $2, 'running', 'push') RETURNING id`, repo, definition).Scan(&run))
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workflow_steps (workflow_run_id, repository_id, name, position, status) VALUES ($1, $2, 'ci', 0, 'running') RETURNING id`, run, repo).Scan(&step))
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workflow_tasks (workflow_run_id, workflow_step_id, repository_id, status, payload) VALUES ($1, $2, $3, 'running', '{}') RETURNING id`, run, step, repo).Scan(&task))
		tasks[name] = strconv.FormatInt(task, 10)
	}
	resolver, err := NewWorkspaceBillingResolver(ctx, pool, orgs["listed"])
	require.NoError(t, err)
	machines := sandbox.BillingOwner{Type: "user", ID: service}
	for name, want := range map[string]sandbox.BillingOwner{
		"listed":  machines,
		"outside": {Type: "org", ID: orgs["outside"]},
		"user":    {Type: "user", ID: owner},
	} {
		actual, err := resolveCITask(ctx, resolver, tasks[name], machines)
		require.NoError(t, err)
		require.Equal(t, want, actual, "%s organization's CI task", name)
	}
	_, err = resolveCITask(ctx, resolver, "987654321", machines)
	require.Error(t, err, "a CI task that cannot be found keeps no machine service grant")
	_, err = resolveCITask(ctx, resolver, "not-a-task", machines)
	require.Error(t, err, "a CI task named by no task number keeps no machine service grant")
	_, err = resolver.Resolve(ctx, "release", tasks["listed"], machines)
	require.Error(t, err, "a numbered placement of another kind is not a CI task and keeps no machine service grant")
}

// Codex review MEDIUM (plue#839): a listed organization that buys a plan pays
// for its own machines, at the controller as in the product
// (RepositorySandboxPayer), even when the placement retains the machine
// service grant it was created with.
func TestWorkspaceBillingRebillsAListedOrganizationWithAPaidPlan(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	var service, org, repo, account int64
	var workspace string
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	_, err := pool.Exec(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('placeholder-paid','placeholder-paid')`)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('listed-paid','listed-paid') RETURNING id`).Scan(&org))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'lanes','lanes') RETURNING id`, org).Scan(&repo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,status) VALUES ($1,$2,'running') RETURNING id::text`, repo, service).Scan(&workspace))
	resolver, err := NewWorkspaceBillingResolver(ctx, pool, org)
	require.NoError(t, err)
	machines := sandbox.BillingOwner{Type: "user", ID: service}
	actual, err := resolver.Resolve(ctx, "workspace", workspace, machines)
	require.NoError(t, err)
	require.Equal(t, machines, actual, "a free listed organization's machine bills the machine service")

	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO billing_accounts(owner_type,owner_id,stripe_customer_id) VALUES ('org',$1,'cus_listed_paid') RETURNING id`, org).Scan(&account))
	_, err = pool.Exec(ctx, `INSERT INTO billing_subscriptions(billing_account_id,stripe_subscription_id,plan_key,billing_interval,status,quantity) VALUES ($1,'sub_listed_paid','team','monthly','active',1)`, account)
	require.NoError(t, err)
	actual, err = resolver.Resolve(ctx, "workspace", workspace, machines)
	require.NoError(t, err)
	require.Equal(t, sandbox.BillingOwner{Type: "org", ID: org}, actual, "a listed organization with a paid plan pays for its own machine")
}

// resolveCITask resolves a CI task guest's grant, as the controller does for a
// placement whose resource kind is workflow_task.
func resolveCITask(ctx context.Context, resolver *WorkspaceBillingResolver, task string, grant sandbox.BillingOwner) (sandbox.BillingOwner, error) {
	return resolver.Resolve(ctx, CITaskResourceKind, task, grant)
}
