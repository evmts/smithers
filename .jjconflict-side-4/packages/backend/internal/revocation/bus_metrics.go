package revocation

import "github.com/prometheus/client_golang/prometheus"

// busMetrics makes a stalled or unpositioned bus visible. A pod whose bus is
// not positioned, not connected, or not advancing its cursor stops
// terminating revoked streams without any other signal.
type busMetrics struct {
	eventsApplied   *prometheus.CounterVec
	catchUpErrors   prometheus.Counter
	catchUpRefusals prometheus.Counter
	reconnects      prometheus.Counter
}

func newBusMetrics() busMetrics {
	return busMetrics{
		eventsApplied: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smithers_revocation_events_applied_total",
			Help: "Revocation events applied by this process's bus, by kind.",
		}, []string{"kind"}),
		catchUpErrors: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "smithers_revocation_catchup_errors_total",
			Help: "Failed reads of the revocation event log (cursor position or catch-up).",
		}),
		catchUpRefusals: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "smithers_revocation_catchup_refusals_total",
			Help: "Catch-up reads that hit their own written read bound while this bus held its LISTEN connection. It says the read's budget expired, NOT why: a full pool, a blocked query, the network and slow IO all land here. Distinct from catchup_errors, so a bound expiring never reads as an unreadable event log.",
		}),
		reconnects: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "smithers_revocation_reconnects_total",
			Help: "Revocation LISTEN connections lost or never acquired, each followed by a retry.",
		}),
	}
}

// MetricsCollectors returns the bus's Prometheus collectors for registration
// on the Smithers metrics registry.
func (b *Bus) MetricsCollectors() []prometheus.Collector {
	if b == nil {
		return nil
	}
	return []prometheus.Collector{
		b.metrics.eventsApplied,
		b.metrics.catchUpErrors,
		b.metrics.catchUpRefusals,
		b.metrics.reconnects,
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name: "smithers_revocation_bus_positioned",
			Help: "1 once the bus has read its starting cursor from the event log.",
		}, func() float64 { return boolGauge(b.Positioned()) }),
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name: "smithers_revocation_bus_connected",
			Help: "1 while the bus holds a LISTEN connection.",
		}, func() float64 { return boolGauge(b.connectedNow()) }),
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name: "smithers_revocation_bus_cursor",
			Help: "Highest revocation event ID this process has read. Compare with the database max ID for lag.",
		}, func() float64 { return float64(b.Cursor()) }),
		// WHAT THIS BUS IS DOING TO A FULL POOL, by role, in two series that
		// do not measure the same thing and must not be added together.
		//
		// smithers_revocation_bus_connected is a HELD connection: the resident
		// LISTEN connection this bus holds from Start to Stop, in every
		// composition and before any topology branch.
		//
		// The gauge below is an OPERATION IN FLIGHT: the nested catch-up read
		// it makes underneath that hold, once per poll interval, which is the
		// half that used to be unbounded. An in-flight read may be holding a
		// second connection, or it may be WAITING for one it does not have, and
		// this gauge cannot tell those apart. So 1 here plus 1 connected is not
		// "2 connections of this pool" — it is one connection held and one read
		// outstanding. What it does establish is that a pool reading full has
		// this duty's resident hold and this duty's nested read in it, rather
		// than leaving a process to assume a resident count.
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name: "smithers_revocation_bus_nested_reads_in_flight",
			Help: "Catch-up reads in flight right now, while this bus holds its LISTEN connection. Each is either using a second pooled connection or still waiting for one; this gauge does not distinguish them.",
		}, func() float64 { return float64(b.nestedReads.Load()) }),
	}
}

func (b *Bus) connectedNow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.connected
}

func (b *Bus) setConnected(connected bool) {
	b.mu.Lock()
	b.connected = connected
	b.mu.Unlock()
}

func boolGauge(v bool) float64 {
	if v {
		return 1
	}
	return 0
}
