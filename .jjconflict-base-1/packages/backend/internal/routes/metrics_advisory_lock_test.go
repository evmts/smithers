package routes

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

// The advisory lock and duty-hold series reach the scrape the operator reads,
// and move with the calls the product makes (plue#839).
func TestSmithersMetricsPublishAdvisoryLockWaitsAndDutyHolds(t *testing.T) {
	m := NewSmithersMetrics()

	m.ObserveAdvisoryLockWait("public_mirror_seed", "busy", 0.004)
	m.ObserveAdvisoryLockWait("flowhost_capture", "busy", 2.01)
	m.ObserveAdvisoryLockWait("flowhost_capture", "acquired", 0.002)
	end := m.BeginCorePoolDutyHold("flowhost_binding_lease")

	require.Equal(t, float64(1), testutil.ToFloat64(m.HTTP.AdvisoryLockWaitsTotal.WithLabelValues("public_mirror_seed", "busy")))
	require.Equal(t, float64(1), testutil.ToFloat64(m.HTTP.AdvisoryLockWaitsTotal.WithLabelValues("flowhost_capture", "busy")))
	require.Equal(t, 2, testutil.CollectAndCount(m.HTTP.AdvisoryLockWaitSeconds, "smithers_db_advisory_lock_wait_seconds"))
	output := metricsCovScrape(t, m)
	require.Contains(t, output, `smithers_db_advisory_lock_waits_total{duty="flowhost_capture",outcome="acquired"} 1`)
	require.Contains(t, output, `smithers_db_advisory_lock_wait_seconds_count{duty="flowhost_capture"} 2`)
	require.Contains(t, output, `smithers_core_pool_duty_connections_held{duty="flowhost_binding_lease"} 1`)
	require.Contains(t, output, `smithers_core_pool_duty_oldest_hold_seconds{duty="flowhost_binding_lease"}`)

	end()
	end()
	require.Contains(t, metricsCovScrape(t, m), `smithers_core_pool_duty_connections_held{duty="flowhost_binding_lease"} 0`)

	var nilMetrics *SmithersMetrics
	require.NotPanics(t, func() {
		nilMetrics.ObserveAdvisoryLockWait("public_mirror_seed", "busy", 1)
		nilMetrics.BeginCorePoolDutyHold("public_mirror_seed")()
	})
}
