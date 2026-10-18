package compose

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

type countingServicePayerStore struct{ reads atomic.Int64 }

func (s *countingServicePayerStore) GetBranchMachineOwner(context.Context) (int64, error) {
	s.reads.Add(1)
	return 7, nil
}

func (s *countingServicePayerStore) GetSandboxEgressDailyBytes(context.Context, db.GetSandboxEgressDailyBytesParams) (int64, error) {
	s.reads.Add(1)
	return 0, nil
}

type discardServicePayerUsage struct{}

func (discardServicePayerUsage) SetSandboxPayerUsageRatio(string, string, float64) {}
func (discardServicePayerUsage) ObserveRuntimeMetricsCollectionFailure(string)     {}

// plue#839 review: an install that lists no organization launches no service
// payer collector, so a self-hosted install never reads the service user's
// usage every 15 seconds. A listed organization launches it.
func TestServicePayerUsageDutyRunsOnlyWhenAnOrganizationIsListed(t *testing.T) {
	store := &countingServicePayerStore{}
	policy := services.NewUnlimitedBillingPolicy()
	for _, orgs := range [][]int64{nil, {}} {
		cfg := &config.Config{Billing: config.BillingConfig{ServicePayerOrgIDs: orgs}}
		require.Nil(t, servicePayerUsageDuty(context.Background(), cfg, policy, store, discardServicePayerUsage{}), "an empty list launches no collector")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cfg := &config.Config{Billing: config.BillingConfig{ServicePayerOrgIDs: []int64{2}}}
	duty := servicePayerUsageDuty(ctx, cfg, policy, store, discardServicePayerUsage{})
	require.NotNil(t, duty, "a listed organization launches the collector")
	done := make(chan struct{})
	go func() { duty(); close(done) }()
	require.Eventually(t, func() bool { return store.reads.Load() > 0 }, 5*time.Second, 10*time.Millisecond, "the collector reads the service payer at once")
	cancel()
	<-done
}
