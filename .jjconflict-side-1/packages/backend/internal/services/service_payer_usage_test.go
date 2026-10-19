package services

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

type fakeServicePayerUsageObserver struct {
	mu       sync.Mutex
	ratios   map[string]float64
	failures map[string]int
}

func (f *fakeServicePayerUsageObserver) SetSandboxPayerUsageRatio(payer, resource string, ratio float64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.ratios == nil {
		f.ratios = map[string]float64{}
	}
	f.ratios[payer+"/"+resource] = ratio
}

func (f *fakeServicePayerUsageObserver) ObserveRuntimeMetricsCollectionFailure(collector string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failures == nil {
		f.failures = map[string]int{}
	}
	f.failures[collector]++
}

// Security s-6tctk6 (plue#839): nothing alerted on the machine service payer
// while it paid for organizations' machines. The worker publishes its running
// sandboxes and today's egress as fractions of its plan, counting the listed
// organizations' machines and no other organization's.
func TestServicePayerUsageGaugesReadTheServiceUsersPlan(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	var service, listed, listedRepo, outside, outsideRepo int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('listed-usage','listed-usage') RETURNING id`).Scan(&listed))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'lanes','lanes') RETURNING id`, listed).Scan(&listedRepo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('outside-usage','outside-usage') RETURNING id`).Scan(&outside))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name) VALUES ($1,'free','free') RETURNING id`, outside).Scan(&outsideRepo))
	for i, repo := range []int64{listedRepo, listedRepo, outsideRepo} {
		_, err := pool.Exec(ctx, `INSERT INTO workspaces(repository_id,user_id,vm_id,name,status) VALUES ($1,$2,$3,$3,'running')`, repo, service, "vm-"+strconv.Itoa(i))
		require.NoError(t, err)
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	for scope, bytes := range map[string]int64{
		"user:" + strconv.FormatInt(service, 10): 80 << 30,
		"org:" + strconv.FormatInt(outside, 10):  1 << 30,
	} {
		_, err := pool.Exec(ctx, `INSERT INTO sandbox_egress_daily_usage(scope,day,bytes) VALUES ($1,$2,$3)`, scope, today, bytes)
		require.NoError(t, err)
	}
	_, err := pool.Exec(ctx, `INSERT INTO sandbox_egress_daily_usage(scope,day,bytes) VALUES ($1,$2,$3)`, "user:"+strconv.FormatInt(service, 10), today.AddDate(0, 0, -1), int64(100<<30))
	require.NoError(t, err)
	billing := NewBillingService(q, nil, BillingServiceConfig{})
	require.NoError(t, billing.GrantPlan(ctx, PlanGrant{OwnerType: BillingOwnerTypeUser, OwnerID: service, PlanKey: BillingPlanMax, Key: "machines-usage", ExpiresAt: time.Now().Add(time.Hour), Actor: "test", Reason: "s-6tctk6"}))

	observer := &fakeServicePayerUsageObserver{}
	collectServicePayerUsage(ctx, billing, q, []int64{listed}, observer, time.Second)
	assert.Empty(t, observer.failures)
	assert.Equal(t, map[string]float64{
		"service/concurrency": 2.0 / 64, // the max plan's 64; the outside machine is not the service user's
		"service/egress":      0.8,      // 80 GiB of 100 GiB today; yesterday's 100 GiB is spent
	}, observer.ratios)

	// With nothing listed, the service user pays for no organization's machine.
	observer = &fakeServicePayerUsageObserver{}
	collectServicePayerUsage(ctx, billing, q, nil, observer, time.Second)
	assert.Equal(t, 0.0, observer.ratios["service/concurrency"])

	// A plan without a limit is never near it.
	observer = &fakeServicePayerUsageObserver{}
	collectServicePayerUsage(ctx, NewUnlimitedBillingPolicy(), q, []int64{listed}, observer, time.Second)
	assert.Equal(t, map[string]float64{"service/concurrency": 0, "service/egress": 0}, observer.ratios)
}

type servicePayerUsageStoreFunc struct {
	owner func() (int64, error)
	bytes func() (int64, error)
}

func (s servicePayerUsageStoreFunc) GetBranchMachineOwner(context.Context) (int64, error) {
	return s.owner()
}

func (s servicePayerUsageStoreFunc) GetSandboxEgressDailyBytes(context.Context, db.GetSandboxEgressDailyBytesParams) (int64, error) {
	return s.bytes()
}

// An install without the machine service user publishes nothing; a read that
// fails keeps the last value and counts one collection failure.
func TestServicePayerUsageWithoutTheServiceUserOrOnFailure(t *testing.T) {
	ctx := context.Background()
	observer := &fakeServicePayerUsageObserver{}
	none := servicePayerUsageStoreFunc{owner: func() (int64, error) { return 0, pgx.ErrNoRows }}
	collectServicePayerUsage(ctx, NewUnlimitedBillingPolicy(), none, nil, observer, time.Second)
	assert.Empty(t, observer.ratios)
	assert.Empty(t, observer.failures)

	failing := servicePayerUsageStoreFunc{
		owner: func() (int64, error) { return 7, nil },
		bytes: func() (int64, error) { return 0, errors.New("pool exhausted") },
	}
	collectServicePayerUsage(ctx, NewUnlimitedBillingPolicy(), failing, nil, observer, time.Second)
	assert.Equal(t, map[string]int{"service_payer_usage": 1}, observer.failures)
	assert.Empty(t, observer.ratios, "a failed read publishes no false zero")

	canceled, cancel := context.WithCancel(ctx)
	cancel()
	RunServicePayerUsageCollector(canceled, NewUnlimitedBillingPolicy(), failing, nil, observer, time.Millisecond)
	RunServicePayerUsageCollector(ctx, nil, failing, nil, observer, time.Millisecond)
	assert.Equal(t, map[string]int{"service_payer_usage": 1}, observer.failures, "no dependencies or a canceled context collect nothing")
}
