package routes

import "github.com/prometheus/client_golang/prometheus"

// HTTPMetrics holds Prometheus metrics for HTTP request handling, SSE connections,
// database query instrumentation, git-over-HTTP operations, and client-reported errors.
type HTTPMetrics struct {
	// RequestsTotal counts all HTTP requests by method, path, and status code.
	RequestsTotal *prometheus.CounterVec

	// RequestDurationSeconds records request latency as a histogram.
	RequestDurationSeconds *prometheus.HistogramVec

	// SSEActiveConnections tracks open SSE streaming connections.
	SSEActiveConnections prometheus.Gauge

	// DBQueryDurationSeconds records database query latency.
	DBQueryDurationSeconds *prometheus.HistogramVec

	// DBConnectionsActive tracks the number of currently acquired database connections.
	DBConnectionsActive prometheus.Gauge

	// DBConnectionsMax tracks the maximum pool size for database connections.
	DBConnectionsMax prometheus.Gauge

	// ClientErrorsTotal counts client-reported errors by client and error type.
	ClientErrorsTotal *prometheus.CounterVec

	// RepoHostOperationDurationSeconds records repo-host RPC latency.
	RepoHostOperationDurationSeconds *prometheus.HistogramVec

	// GitOperationsTotal counts HTTP smart git operations by command and result.
	GitOperationsTotal *prometheus.CounterVec

	// GitOperationDurationSeconds records the duration of HTTP smart git operations.
	GitOperationDurationSeconds *prometheus.HistogramVec

	// OAuth2TokenOperationsTotal counts OAuth2 token operations by type (issue, refresh, revoke).
	OAuth2TokenOperationsTotal *prometheus.CounterVec

	// ValidationRejectionsTotal counts request validation rejections by resource and field.
	ValidationRejectionsTotal *prometheus.CounterVec

	// LandingOperationsTotal counts landing operations by operation type.
	LandingOperationsTotal *prometheus.CounterVec

	// LandingQueueDepth tracks the depth of the landing queue.
	LandingQueueDepth prometheus.Gauge

	// CodeSearchBacklogRepositories counts repositories without a code-search watermark.
	CodeSearchBacklogRepositories prometheus.Gauge

	// CodeSearchBacklogOldestAgeSeconds tracks the age of the oldest unindexed repository.
	CodeSearchBacklogOldestAgeSeconds prometheus.Gauge

	// AuthOperationsTotal counts authentication operations by method and result.
	AuthOperationsTotal *prometheus.CounterVec

	// WorkspaceLifecycleTotal counts workspace lifecycle events by action and result.
	WorkspaceLifecycleTotal *prometheus.CounterVec

	// WorkspaceProvisionClaimBudget tracks how many provisioning claims this
	// process admits at once, derived from its database pool's real size.
	WorkspaceProvisionClaimBudget prometheus.Gauge

	// CorePoolDutyConnectionsHeld tracks how many core-pool connections each
	// serving background duty is holding right now.
	CorePoolDutyConnectionsHeld *prometheus.GaugeVec

	// CorePoolDutyStallsTotal counts the core-pool bounds that refused, by
	// duty and by the stage the bound belongs to.
	CorePoolDutyStallsTotal *prometheus.CounterVec
}

// NewHTTPMetrics creates a new HTTPMetrics instance and registers all metrics
// with the provided Prometheus registerer. Pass nil to skip registration.
func NewHTTPMetrics(reg prometheus.Registerer) *HTTPMetrics {
	m := &HTTPMetrics{
		RequestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_http_requests_total",
				Help: "Total number of HTTP requests processed, labeled by method, path, and status code.",
			},
			[]string{"method", "path", "status"},
		),
		RequestDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "smithers_http_request_duration_seconds",
				Help:    "Duration of HTTP requests in seconds.",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"method", "path"},
		),
		SSEActiveConnections: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_sse_active_connections",
			Help: "Number of active Server-Sent Events (SSE) streaming connections.",
		}),
		DBQueryDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "smithers_db_query_duration_seconds",
				Help:    "Duration of PostgreSQL query executions in seconds.",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"query"},
		),
		DBConnectionsActive: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_db_connections_active",
			Help: "Number of currently acquired database connections.",
		}),
		DBConnectionsMax: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_db_connections_max",
			Help: "Maximum number of connections in the database pool.",
		}),
		ClientErrorsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_client_errors_total",
				Help: "Total number of client-reported errors, labeled by client and error type.",
			},
			[]string{"client", "error_type"},
		),
		RepoHostOperationDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "smithers_repo_host_client_operation_duration_seconds",
				Help:    "Duration of repo-host RPC operations in seconds.",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"operation"},
		),
		GitOperationsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_http_git_operations_total",
				Help: "Total HTTP smart git operations, labeled by command and result.",
			},
			[]string{"command", "result"},
		),
		GitOperationDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "smithers_http_git_operation_duration_seconds",
				Help:    "Duration of HTTP smart git operations in seconds.",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"command"},
		),
		OAuth2TokenOperationsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_oauth2_token_operations_total",
				Help: "Total OAuth2 token operations, labeled by operation type.",
			},
			[]string{"operation"},
		),
		ValidationRejectionsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_validation_rejections_total",
				Help: "Total request validation rejections, labeled by resource and field.",
			},
			[]string{"resource", "field"},
		),
		LandingOperationsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_landing_operations_total",
				Help: "Total landing operations, labeled by operation type.",
			},
			[]string{"operation"},
		),
		LandingQueueDepth: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_landing_queue_depth",
			Help: "Current depth of the landing queue.",
		}),
		CodeSearchBacklogRepositories: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_code_search_backlog_repositories",
			Help: "Repositories whose default bookmark has no code-search index yet.",
		}),
		CodeSearchBacklogOldestAgeSeconds: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_code_search_backlog_oldest_age_seconds",
			Help: "Age of the oldest repository without a code-search index; zero when none.",
		}),
		AuthOperationsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_auth_operations_total",
				Help: "Total authentication operations, labeled by method and result.",
			},
			[]string{"method", "result"},
		),
		WorkspaceLifecycleTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_workspace_lifecycle_total",
				Help: "Total workspace lifecycle events, labeled by action and result.",
			},
			[]string{"action", "result"},
		),
		// smithers_db_connections_active over _max says the pool is full. It
		// cannot say WHO filled it: it reads 4 of 4 for a worker that is
		// working and for one whose background duties are each holding a
		// connection while reaching for a second, and it names no duty at all.
		// That blind spot is why fifteen minutes of a stopped reconciler
		// produced no operable signal. These three answer the three questions
		// it cannot: how many claims this process admits, which duty is
		// holding core-pool connections right now, and which written bound
		// refused. Both label sets are closed source constants (see
		// services/core_pool_duty.go): no identifier, error text, SQL or
		// customer value can reach them.
		WorkspaceProvisionClaimBudget: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smithers_workspace_provision_claim_budget",
			Help: "Concurrent workspace provisioning claims this process admits, derived from its database pool size.",
		}),
		CorePoolDutyConnectionsHeld: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "smithers_core_pool_duty_connections_held",
				Help: "Core-pool database connections held right now by each serving background duty.",
			},
			[]string{"duty"},
		),
		CorePoolDutyStallsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "smithers_core_pool_duty_stalls_total",
				Help: "Total core-pool acquire or hold bounds that refused, labeled by background duty and stage.",
			},
			[]string{"duty", "stage"},
		),
	}

	if reg != nil {
		reg.MustRegister(
			m.RequestsTotal,
			m.RequestDurationSeconds,
			m.SSEActiveConnections,
			m.DBQueryDurationSeconds,
			m.DBConnectionsActive,
			m.DBConnectionsMax,
			m.ClientErrorsTotal,
			m.RepoHostOperationDurationSeconds,
			m.GitOperationsTotal,
			m.GitOperationDurationSeconds,
			m.OAuth2TokenOperationsTotal,
			m.ValidationRejectionsTotal,
			m.LandingOperationsTotal,
			m.LandingQueueDepth,
			m.CodeSearchBacklogRepositories,
			m.CodeSearchBacklogOldestAgeSeconds,
			m.AuthOperationsTotal,
			m.WorkspaceLifecycleTotal,
			m.WorkspaceProvisionClaimBudget,
			m.CorePoolDutyConnectionsHeld,
			m.CorePoolDutyStallsTotal,
		)
	}

	return m
}
