package services

import (
	"strconv"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
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
