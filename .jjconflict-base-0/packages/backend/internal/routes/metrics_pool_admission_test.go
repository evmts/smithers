package routes_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/routes"
)

// plue#839: each refusal the core-pool incident hid is its own labeled series
// on the product registry, and a nil registry is a no-op.
func TestSmithersMetrics_CorePoolIncidentSeries(t *testing.T) {
	t.Parallel()

	m := routes.NewSmithersMetrics()
	m.ObserveDBPoolAcquireFailure("core", "workspace_provision_claim", "headroom")
	m.ObserveDBPoolAcquireFailure("core", "workspace_provision_claim", "headroom")
	m.ObserveDBPoolAcquireFailure("core", "unattributed", "deadline")
	m.ObserveWorkspaceReconcileClaim("retained_guest_stop", "pool_headroom")
	m.ObserveWorkspaceReconcileClaim("start", "admitted")
	m.ObserveWorkspaceRetainedGuestStopFailure("acquire_connection", "core_pool_exhausted")
	m.SetWorkspaceAdmissionOldestSeconds("waiting_for_machine", 7200)
	m.SetWorkspaceAdmissionOldestSeconds("none", 0)
	m.ObserveRuntimeMetricsCollectionFailure("workspace_admission")

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, req)
	body, err := io.ReadAll(rec.Body)
	require.NoError(t, err)
	output := string(body)

	assert.Contains(t, output, `smithers_db_pool_acquire_failures_total{duty="workspace_provision_claim",pool="core",reason="headroom"} 2`)
	assert.Contains(t, output, `smithers_db_pool_acquire_failures_total{duty="unattributed",pool="core",reason="deadline"} 1`)
	assert.Contains(t, output, `smithers_workspace_reconcile_claims_total{kind="retained_guest_stop",outcome="pool_headroom"} 1`)
	assert.Contains(t, output, `smithers_workspace_reconcile_claims_total{kind="start",outcome="admitted"} 1`)
	assert.Contains(t, output, `smithers_workspace_retained_guest_stop_failures_total{reason="core_pool_exhausted",stage="acquire_connection"} 1`)
	assert.Contains(t, output, `smithers_workspace_admission_oldest_seconds{stage="waiting_for_machine"} 7200`)
	assert.Contains(t, output, `smithers_workspace_admission_oldest_seconds{stage="none"} 0`)
	assert.Contains(t, output, `smithers_runtime_metrics_collection_failures_total{collector="workspace_admission"} 1`)

	var unset *routes.SmithersMetrics
	unset.ObserveDBPoolAcquireFailure("core", "unattributed", "deadline")
	unset.ObserveWorkspaceReconcileClaim("start", "admitted")
	unset.ObserveWorkspaceRetainedGuestStopFailure("stop_guest", "internal")
	unset.SetWorkspaceAdmissionOldestSeconds("none", 1)
	unset.ObserveRuntimeMetricsCollectionFailure("landing_queue")
}
