package compose

import (
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/admission"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/sandbox/sandboxfake"
)

// plue#839: a worker process publishes the server's health from its own
// one-connection pool, beside a core pool of the shipped four.
func TestHostedWorkerPublishesDatabaseHealth(t *testing.T) {
	repositoryURL, _, pool := splitProcessDatabase(t)
	t.Setenv("SMITHERS_AUTH_MODE", "multitenant")
	t.Setenv("SMITHERS_BILLING_MODE", "metered")
	t.Setenv("SMITHERS_DATABASE_MAX_CONNS", "4")
	t.Setenv("SMITHERS_DATABASE_MIN_CONNS", "1")
	t.Setenv("SMITHERS_METRICS_ADDR", "127.0.0.1:0")
	policy, err := admission.NewMetered(pool, admission.Config{Usage: admission.ProductUsage})
	require.NoError(t, err)
	listeners := make(chan net.Listener, 1)
	original := netListen
	netListen = func(network, address string) (net.Listener, error) {
		listener, err := original(network, address)
		if err == nil {
			select {
			case listeners <- listener:
			default:
			}
		}
		return listener, err
	}
	t.Cleanup(func() { netListen = original })

	remote := repohost.NewClient(&repohost.StaticStorageSetResolver{URL: repositoryURL}, "split-process-repo")
	startSplitProcess(t, Options{Duties: DutiesWorkers, Repository: remote, Admission: policy, ComputeProvider: sandboxfake.New()})
	var address string
	select {
	case listener := <-listeners:
		address = listener.Addr().String()
	default:
		t.Fatal("workers-only process did not open its metrics listener")
	}
	scrape := func() string {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+address+"/metrics", nil)
		require.NoError(t, err)
		request.Header.Set("Authorization", "Bearer split-process-metrics")
		response, err := http.DefaultClient.Do(request)
		require.NoError(t, err)
		defer response.Body.Close()
		body, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		return string(body)
	}
	// Refresh publishes its reads one after another (xmin, lock waits, table
	// tuples), so a scrape can land between them. Wait for every family the
	// worker must publish, not only the first, and then assert on that body.
	families := []string{`smithers_db_lock_wait_oldest_seconds{locktype="advisory"}`, "\nsmithers_db_oldest_xmin_age_seconds ", "\nsmithers_db_oldest_xmin_transactions ", `smithers_db_table_live_tuples{table="workspaces"}`, `smithers_db_table_dead_tuples{table="workspaces"}`}
	var body string
	require.Eventually(t, func() bool {
		body = scrape()
		for _, family := range families {
			if !strings.Contains(body, family) {
				return false
			}
		}
		return true
	}, 20*time.Second, 50*time.Millisecond, "the worker did not publish every database health family")
	require.NotContains(t, body, `smithers_runtime_metrics_collection_failures_total{collector="db_health"}`, "a health read failed")
}
