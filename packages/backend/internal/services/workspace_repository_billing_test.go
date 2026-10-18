package services

import (
	"strconv"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/runtimeports"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Branch machines have a service owner; their repository pays for egress.
func TestBranchMachineRepositoryEgressBilling(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	var owner, repo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('egress-payer','egress-payer') RETURNING id`).Scan(&owner))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,'egress','egress') RETURNING id`, owner).Scan(&repo))
	var other, otherRepo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('other-payer','other-payer') RETURNING id`).Scan(&other))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,'other','other') RETURNING id`, other).Scan(&otherRepo))
	var org, orgRepo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('egress-org','egress-org') RETURNING id`).Scan(&org))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'org-egress','org-egress') RETURNING id`, org).Scan(&orgRepo))
	billing := NewBillingService(q, nil, BillingServiceConfig{})
	var account int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO billing_accounts(owner_type,owner_id,stripe_customer_id) VALUES ('org',$1,'cus_org_3756') RETURNING id`, org).Scan(&account))
	_, err := pool.Exec(ctx, `INSERT INTO billing_subscriptions(billing_account_id,stripe_subscription_id,plan_key,billing_interval,status,quantity) VALUES ($1,'sub_org_3756','team','monthly','active',1)`, account)
	require.NoError(t, err)
	require.NoError(t, billing.GrantPlan(ctx, PlanGrant{OwnerType: BillingOwnerTypeUser, OwnerID: owner, PlanKey: BillingPlanPro, Key: "egress-owner", ExpiresAt: time.Now().Add(time.Hour), Actor: "test", Reason: "regression"}))
	svc := NewWorkspaceService(q, WithWorkspaceTransactions(pool), WithBranchMachineProviders(branchMachineTestProviders()), WithWorkspaceBillingPolicy(billing))
	for _, tc := range []struct {
		actor, payer, repo, daily int64
		ownerType                 string
	}{
		{other, owner, repo, 10 << 30, "user"}, {owner, other, otherRepo, 1 << 30, "user"}, {owner, org, orgRepo, 100 << 30, "org"},
	} {
		row, err := svc.createWorkspaceRow(ctx, db.CreateWorkspaceParams{UserID: tc.actor, RepositoryID: tc.repo, TargetBookmark: "main", Kind: "container", Status: "starting"})
		require.NoError(t, err)
		require.NotEqual(t, tc.actor, row.UserID)
		policy, err := svc.workspaceEgressProxy(ctx, tc.repo, row.ID)
		require.NoError(t, err)
		require.NotNil(t, policy.Quota)
		assert.Equal(t, tc.payer, policy.Quota.BillingUserID)
		assert.Equal(t, tc.daily, policy.Quota.DailyBytes)
		if tc.ownerType == "org" {
			assert.Equal(t, "org", policy.Quota.BillingOwnerType)
		}
		runtimeCtx, err := svc.workspaceRuntimeContext(ctx, row, tc.actor, "billing-test")
		require.NoError(t, err)
		assert.Equal(t, sandbox.BillingOwner{Type: tc.ownerType, ID: tc.payer}, sandbox.BillingOwnerFromContext(runtimeCtx, 0))
		op, ok := workspaceapi.OperationFromContext(runtimeCtx)
		require.True(t, ok)
		assert.Equal(t, strconv.FormatInt(row.UserID, 10), op.TenantID, "placement still fences the machine owner")
		assert.Equal(t, strconv.FormatInt(tc.actor, 10), op.PrincipalID)
		// Meter old intervals stamped under the shared service identity as well.
		require.NoError(t, q.OpenSandboxUsageInterval(ctx, db.OpenSandboxUsageIntervalParams{UserID: row.UserID, SandboxKind: "workspace", SandboxID: row.ID}))
		_, err = pool.Exec(ctx, `UPDATE sandbox_usage_intervals SET started_at=now()-interval '60 seconds' WHERE sandbox_id=$1`, row.ID)
		require.NoError(t, err)
		entitlement, err := billing.SandboxEntitlement(runtimeCtx, tc.payer)
		require.NoError(t, err)
		assert.EqualValues(t, 1, entitlement.ConcurrentInUse, "only this payer's reservations count")
		assert.GreaterOrEqual(t, entitlement.SecondsUsedToday, int64(60))
		assert.Less(t, entitlement.SecondsUsedToday, int64(90), "another payer's interval is excluded")
		counted, err := q.CountOtherActiveSandboxesForWorkspaceResume(runtimeCtx, db.CountOtherActiveSandboxesForWorkspaceResumeParams{UserID: tc.payer, WorkspaceID: row.ID, VmID: "billing-vm"})
		require.NoError(t, err)
		assert.EqualValues(t, 1, counted.Others)
		assert.False(t, counted.Matches)
		_, err = pool.Exec(ctx, `UPDATE workspaces SET vm_id='billing-vm',status='running' WHERE id=$1`, row.ID)
		require.NoError(t, err)
		counted, err = q.CountOtherActiveSandboxesForWorkspaceResume(runtimeCtx, db.CountOtherActiveSandboxesForWorkspaceResumeParams{UserID: tc.payer, WorkspaceID: row.ID, VmID: "billing-vm"})
		require.NoError(t, err)
		assert.EqualValues(t, 0, counted.Others)
		assert.True(t, counted.Matches)
		resumed, err := svc.stampResumedWorkspaceIdleTimeout(ctx, row)
		require.NoError(t, err)
		assert.Equal(t, row.IdleTimeoutSecs, resumed.IdleTimeoutSecs, "resume keeps the repository's plan")
	}
}

// plue#839: until organizations have plans of their own (mvp.md M-09), a
// machine on a listed free organization's repository bills the machine
// service user that runs it. The free organization plan (1 GiB of egress and
// 4 hours a day, one sandbox at a time) cannot carry a factory's lanes, and
// its exhausted egress refused every guest clone with a proxy 429. Only the
// organizations in billing.service_payer_org_ids get it (Security s-6tctk6).
func TestFreeOrganizationRepositoryMachineBillsTheMachineServiceUser(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	var service, actor, org, orgRepo int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('lane-actor','lane-actor') RETURNING id`).Scan(&actor))
	// Distinct ids, so a payer of the wrong type cannot pass by number.
	_, err := pool.Exec(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('placeholder-839','placeholder-839')`)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('free-lanes','free-lanes') RETURNING id`).Scan(&org))
	require.NotEqual(t, service, org)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'lanes','lanes') RETURNING id`, org).Scan(&orgRepo))
	billing := NewBillingService(q, nil, BillingServiceConfig{})
	require.NoError(t, billing.GrantPlan(ctx, PlanGrant{OwnerType: BillingOwnerTypeUser, OwnerID: service, PlanKey: BillingPlanMax, Key: "machines-839", ExpiresAt: time.Now().Add(time.Hour), Actor: "test", Reason: "plue#839"}))
	svc := NewWorkspaceService(q, WithWorkspaceTransactions(pool), WithBranchMachineProviders(branchMachineTestProviders()), WithWorkspaceBillingPolicy(billing), WithWorkspaceServicePayerOrgs([]int64{org}))

	row, err := svc.createWorkspaceRow(ctx, db.CreateWorkspaceParams{UserID: actor, RepositoryID: orgRepo, TargetBookmark: "mythical", Kind: "container", Status: "starting"})
	require.NoError(t, err)
	require.Equal(t, service, row.UserID, "a branch machine is the machine service's")
	policy, err := svc.workspaceEgressProxy(ctx, orgRepo, row.ID)
	require.NoError(t, err)
	require.NotNil(t, policy.Quota)
	assert.Equal(t, sandbox.EgressQuota{BillingUserID: service, DailyBytes: 100 << 30}, *policy.Quota, "the service user's max egress, not the free organization's 1 GiB")

	runtimeCtx, err := svc.workspaceRuntimeContext(ctx, row, actor, "billing-839")
	require.NoError(t, err)
	assert.Equal(t, sandbox.BillingOwner{Type: "user", ID: service}, sandbox.BillingOwnerFromContext(runtimeCtx, 0))
	entitlement, err := billing.SandboxEntitlement(runtimeCtx, service)
	require.NoError(t, err)
	assert.Equal(t, BillingPlanMax, entitlement.PlanKey)
	assert.EqualValues(t, 1, entitlement.ConcurrentInUse, "the payer counts the machine it pays for")
	_, err = pool.Exec(ctx, `UPDATE workspaces SET vm_id='lane-vm',status='running' WHERE id=$1`, row.ID)
	require.NoError(t, err)
	require.NoError(t, billing.AuthorizeCountedSandboxResume(runtimeCtx, service, row.ID, "lane-vm"), "the payer resumes the machine it pays for")
	require.NoError(t, svc.enforceWorkspaceQuota(ctx, actor, orgRepo), "the free organization's one-sandbox plan does not gate its machines")

	// Once the organization has a plan of its own, it pays again.
	var account int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO billing_accounts(owner_type,owner_id,stripe_customer_id) VALUES ('org',$1,'cus_org_839') RETURNING id`, org).Scan(&account))
	_, err = pool.Exec(ctx, `INSERT INTO billing_subscriptions(billing_account_id,stripe_subscription_id,plan_key,billing_interval,status,quantity) VALUES ($1,'sub_org_839','team','monthly','active',1)`, account)
	require.NoError(t, err)
	policy, err = svc.workspaceEgressProxy(ctx, orgRepo, row.ID)
	require.NoError(t, err)
	assert.Equal(t, sandbox.EgressQuota{BillingUserID: org, BillingOwnerType: "org", DailyBytes: 100 << 30}, *policy.Quota)
}

// plue#839: a CI task guest carries its repository payer's egress quota. The
// controller refuses a grant to any quota-less guest but the golden bake, and
// the worker turned that refusal into a 429 at the guest's first clone. A
// guest on an organization the deployment does not list keeps that
// organization's own free quota (Security s-6tctk6).
func TestCIGuestVMRequestCarriesTheRepositoryPayersEgressQuota(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	var service, owner, userRepo, org, orgRepo, outside, outsideRepo int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('ci-owner','ci-owner') RETURNING id`).Scan(&owner))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,'ci','ci') RETURNING id`, owner).Scan(&userRepo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('free-ci','free-ci') RETURNING id`).Scan(&org))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'ci','ci') RETURNING id`, org).Scan(&orgRepo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('outside-ci','outside-ci') RETURNING id`).Scan(&outside))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'ci','ci') RETURNING id`, outside).Scan(&outsideRepo))
	billing := NewBillingService(q, nil, BillingServiceConfig{})
	require.NoError(t, billing.GrantPlan(ctx, PlanGrant{OwnerType: BillingOwnerTypeUser, OwnerID: service, PlanKey: BillingPlanMax, Key: "machines-839", ExpiresAt: time.Now().Add(time.Hour), Actor: "test", Reason: "plue#839"}))
	images := NewSandboxEnvironmentImageService(&fakeEnvironmentImageQuerier{rows: []runtimeports.SandboxEnvironmentImage{
		{ID: "base-vm", Kind: "vm", ClosureHash: "b", Image: "reg/nixos-guest:base-b", Status: "ready"},
	}})
	svc := NewWorkspaceService(q, WithWorkspaceBillingPolicy(billing), WithWorkspaceEnvironmentImages(images), WithWorkspaceServicePayerOrgs([]int64{org}))

	for _, tc := range []struct {
		repo  int64
		quota sandbox.EgressQuota
	}{
		{userRepo, sandbox.EgressQuota{BillingUserID: owner, DailyBytes: 1 << 30}},
		{orgRepo, sandbox.EgressQuota{BillingUserID: service, DailyBytes: 100 << 30}},
		{outsideRepo, sandbox.EgressQuota{BillingUserID: outside, BillingOwnerType: "org", DailyBytes: 1 << 30}},
	} {
		req, err := svc.CIGuestVMRequest(ctx, tc.repo, nil)
		require.NoError(t, err)
		require.NotNil(t, req.EgressProxy)
		require.NotNil(t, req.EgressProxy.Quota, "a CI guest without a quota is refused every egress grant")
		assert.Equal(t, tc.quota, *req.EgressProxy.Quota)
	}
	bake := svc.GoldenBakeVMRequest()
	require.NotNil(t, bake.EgressProxy)
	assert.Nil(t, bake.EgressProxy.Quota, "the repository-agnostic golden bake bills no repository")
}

// Security s-6tctk6 (plue#839): signup is open and anyone can create an
// organization, so the machine service user pays only for the organizations
// in billing.service_payer_org_ids. Every other organization keeps its own
// plan, as before 605751cd: its machine gets the free organization's 1 GiB
// of egress and one running sandbox, and never takes a slot of the service
// user's concurrency, so outside organizations cannot starve listed lanes.
func TestServicePayerBillsOnlyListedOrganizations(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	var service, actor, listed, listedRepo int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('outside-actor','outside-actor') RETURNING id`).Scan(&actor))
	// Distinct ids, so a payer of the wrong type cannot pass by number.
	_, err := pool.Exec(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('placeholder-s6','placeholder-s6')`)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('listed-lanes','listed-lanes') RETURNING id`).Scan(&listed))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'lanes','lanes') RETURNING id`, listed).Scan(&listedRepo))
	// One listed lane is already running on the service user's plan.
	_, err = pool.Exec(ctx, `INSERT INTO workspaces(repository_id,user_id,vm_id,status) VALUES ($1,$2,'listed-vm','running')`, listedRepo, service)
	require.NoError(t, err)
	billing := NewBillingService(q, nil, BillingServiceConfig{})
	require.NoError(t, billing.GrantPlan(ctx, PlanGrant{OwnerType: BillingOwnerTypeUser, OwnerID: service, PlanKey: BillingPlanMax, Key: "machines-s6", ExpiresAt: time.Now().Add(time.Hour), Actor: "test", Reason: "s-6tctk6"}))

	for i, tc := range []struct {
		name      string
		allowlist []int64
		// serviceInUse is the service user's running machines: the listed
		// lane when its organization is listed, never the outside one.
		serviceInUse int64
	}{
		{"empty allowlist grants no organization", nil, 0},
		{"another organization listed", []int64{listed}, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			name := "outside-" + strconv.Itoa(i)
			var outside, outsideRepo int64
			require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ($1,$1) RETURNING id`, name).Scan(&outside))
			require.NotEqual(t, service, outside)
			require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'free','free') RETURNING id`, outside).Scan(&outsideRepo))
			svc := NewWorkspaceService(q, WithWorkspaceTransactions(pool), WithBranchMachineProviders(branchMachineTestProviders()), WithWorkspaceBillingPolicy(billing), WithWorkspaceServicePayerOrgs(tc.allowlist))

			row, err := svc.createWorkspaceRow(ctx, db.CreateWorkspaceParams{UserID: actor, RepositoryID: outsideRepo, TargetBookmark: "main", Kind: "container", Status: "starting"})
			require.NoError(t, err)
			require.Equal(t, service, row.UserID, "a branch machine is still the machine service's")
			policy, err := svc.workspaceEgressProxy(ctx, outsideRepo, row.ID)
			require.NoError(t, err)
			require.NotNil(t, policy.Quota)
			assert.Equal(t, sandbox.EgressQuota{BillingUserID: outside, BillingOwnerType: "org", DailyBytes: 1 << 30}, *policy.Quota, "the outside organization's own free 1 GiB, not the service user's 100 GiB")
			runtimeCtx, err := svc.workspaceRuntimeContext(ctx, row, actor, "billing-s6")
			require.NoError(t, err)
			assert.Equal(t, sandbox.BillingOwner{Type: "org", ID: outside}, sandbox.BillingOwnerFromContext(runtimeCtx, 0))
			entitlement, err := billing.SandboxEntitlement(runtimeCtx, outside)
			require.NoError(t, err)
			assert.Equal(t, BillingPlanFree, entitlement.PlanKey)
			assert.EqualValues(t, 1, entitlement.ConcurrentInUse, "the organization counts its own machine")

			// The service user's counts, as its payer context carries them.
			serviceCtx := sandbox.WithServicePayerOrgs(sandbox.WithBillingOwner(ctx, sandbox.BillingOwner{Type: "user", ID: service}), tc.allowlist)
			entitlement, err = billing.SandboxEntitlement(serviceCtx, service)
			require.NoError(t, err)
			assert.Equal(t, tc.serviceInUse, entitlement.ConcurrentInUse, "an outside organization's machine takes no slot of the service user's")
			_, err = pool.Exec(ctx, `UPDATE workspaces SET vm_id='outside-vm',status='running' WHERE id=$1`, row.ID)
			require.NoError(t, err)
			counted, err := q.CountOtherActiveSandboxesForWorkspaceResume(serviceCtx, db.CountOtherActiveSandboxesForWorkspaceResumeParams{UserID: service, WorkspaceID: row.ID, VmID: "outside-vm"})
			require.NoError(t, err)
			assert.False(t, counted.Matches, "the service user does not pay for the outside machine")
			assert.Equal(t, tc.serviceInUse, int64(counted.Others))
			require.Error(t, billing.AuthorizeCountedSandboxResume(serviceCtx, service, row.ID, "outside-vm"), "the service user never resumes a machine it does not pay for")

			// The free organization plan allows one running sandbox; the
			// service user's max plan does not lift it.
			err = svc.enforceWorkspaceQuota(ctx, actor, outsideRepo)
			require.ErrorContains(t, err, "1 running sandbox", "a second machine on the outside organization is refused under its own plan")
		})
	}
}
