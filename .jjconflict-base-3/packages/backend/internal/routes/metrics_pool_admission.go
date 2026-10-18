package routes

import "github.com/prometheus/client_golang/prometheus"

// PoolAdmissionMetrics says what a full core pool refused and what admission
// left waiting (plue#839). A claim gate refused 21,600 retained-guest stops an
// hour and every member start of a machine-owned branch, the deep canary's
// rows sat "starting with vm <none>", and nothing an alert could read moved.
// Every label is a closed source constant: no identifier, error text, SQL or
// customer value reaches one.
type PoolAdmissionMetrics struct {
	// DBPoolAcquireFailuresTotal counts connection acquires a pool did not
	// serve, by pool, attributed duty and reason.
	DBPoolAcquireFailuresTotal *prometheus.CounterVec

	// WorkspaceReconcileClaimsTotal counts workspace provisioning claims by
	// kind and outcome.
	WorkspaceReconcileClaimsTotal *prometheus.CounterVec

	// WorkspaceRetainedGuestStopFailuresTotal counts retained-guest stops the
	// reconciler did not finish, by stage and reason.
	WorkspaceRetainedGuestStopFailuresTotal *prometheus.CounterVec

	// WorkspaceAdmissionOldestSeconds tracks the oldest workspace still being
	// admitted, by provisioning stage.
	WorkspaceAdmissionOldestSeconds *prometheus.GaugeVec

	// RuntimeMetricsCollectionFailuresTotal counts runtime gauge refreshes
	// that failed, by collector.
	RuntimeMetricsCollectionFailuresTotal *prometheus.CounterVec
}

// NewPoolAdmissionMetrics creates the families and registers them with reg.
// Pass nil to skip registration.
func NewPoolAdmissionMetrics(reg prometheus.Registerer) *PoolAdmissionMetrics {
	m := &PoolAdmissionMetrics{
		DBPoolAcquireFailuresTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smithers_db_pool_acquire_failures_total",
			Help: "Connection acquires a pool did not serve, by pool, the duty that asked, and reason: headroom (refused before acquiring), deadline, canceled or unavailable.",
		}, []string{"pool", "duty", "reason"}),
		WorkspaceReconcileClaimsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smithers_workspace_reconcile_claims_total",
			Help: "Workspace provisioning claims, by kind (start, service_start, snapshot_restore, release, retained_guest_stop, failed_start_cleanup) and outcome (admitted, contended, canceled, failed, or the stage that refused).",
		}, []string{"kind", "outcome"}),
		WorkspaceRetainedGuestStopFailuresTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smithers_workspace_retained_guest_stop_failures_total",
			Help: "Retained-guest stops the provisioning reconciler attempted and did not finish, by stage and reason.",
		}, []string{"stage", "reason"}),
		WorkspaceAdmissionOldestSeconds: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "smithers_workspace_admission_oldest_seconds",
			Help: "Age of the oldest workspace still pending or starting, by provisioning stage; zero when none.",
		}, []string{"stage"}),
		RuntimeMetricsCollectionFailuresTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smithers_runtime_metrics_collection_failures_total",
			Help: "Runtime gauge refreshes that failed and kept the gauge's last value, by collector.",
		}, []string{"collector"}),
	}
	if reg != nil {
		reg.MustRegister(
			m.DBPoolAcquireFailuresTotal,
			m.WorkspaceReconcileClaimsTotal,
			m.WorkspaceRetainedGuestStopFailuresTotal,
			m.WorkspaceAdmissionOldestSeconds,
			m.RuntimeMetricsCollectionFailuresTotal,
		)
	}
	return m
}

// ObserveDBPoolAcquireFailure records one acquire a pool did not serve.
// pool, duty and reason are closed source constants.
func (m *SmithersMetrics) ObserveDBPoolAcquireFailure(pool, duty, reason string) {
	if m == nil {
		return
	}
	m.PoolAdmission.DBPoolAcquireFailuresTotal.WithLabelValues(pool, duty, reason).Inc()
}

// ObserveWorkspaceReconcileClaim records one provisioning claim's outcome.
// kind and outcome are closed source constants.
func (m *SmithersMetrics) ObserveWorkspaceReconcileClaim(kind, outcome string) {
	if m == nil {
		return
	}
	m.PoolAdmission.WorkspaceReconcileClaimsTotal.WithLabelValues(kind, outcome).Inc()
}

// ObserveWorkspaceRetainedGuestStopFailure records one retained-guest stop
// that did not finish. stage and reason are closed source constants.
func (m *SmithersMetrics) ObserveWorkspaceRetainedGuestStopFailure(stage, reason string) {
	if m == nil {
		return
	}
	m.PoolAdmission.WorkspaceRetainedGuestStopFailuresTotal.WithLabelValues(stage, reason).Inc()
}

// SetWorkspaceAdmissionOldestSeconds updates the oldest admission's age for
// one stage of the closed admission stage set.
func (m *SmithersMetrics) SetWorkspaceAdmissionOldestSeconds(stage string, seconds float64) {
	if m == nil {
		return
	}
	m.PoolAdmission.WorkspaceAdmissionOldestSeconds.WithLabelValues(stage).Set(seconds)
}

// ObserveRuntimeMetricsCollectionFailure records one failed refresh of a
// runtime gauge collector.
func (m *SmithersMetrics) ObserveRuntimeMetricsCollectionFailure(collector string) {
	if m == nil {
		return
	}
	m.PoolAdmission.RuntimeMetricsCollectionFailuresTotal.WithLabelValues(collector).Inc()
}
