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

// THE HOSTED WORKER'S CORE POOL, composed for real at the four connections
// production ran with from 10-16 (plue#839).
//
// A workers-only process serves no SSE, yet it started the SSE broker, which
// held one of the four core connections for its whole life with no channel to
// listen on. Beside the revocation bus that left exactly one claim's worth of
// pool, and any third holder took the reconciler below a claim on every tick.
// The worker now holds one resident, the revocation bus, and leaves a claim
// its two connections and one to spare.
func TestHostedWorkerLeavesClaimHeadroom(t *testing.T) {
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
	handler := startSplitProcess(t, Options{Duties: DutiesWorkers, Repository: remote,
		Admission: policy, ComputeProvider: sandboxfake.New()})
	require.Nil(t, handler, "a workers-only process has no product handler")

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
		require.Equal(t, http.StatusOK, response.StatusCode)
		body, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		return string(body)
	}

	// The one resident is connected and says so.
	require.Eventually(t, func() bool {
		return strings.Contains(scrape(), "\nsmithers_revocation_bus_connected 1\n")
	}, 20*time.Second, 50*time.Millisecond, "the revocation bus never held its connection")
	body := scrape()
	require.Contains(t, body, "\nsmithers_db_connections_max ", "the worker publishes no pool size")
	// No broker, so no connection held for one.
	require.NotContains(t, body, "smithers_sse_broker_pooled_connections_held",
		"the workers-only process started an SSE broker, which holds a core connection with nothing to serve")
	// The floor a pool of four leaves this worker: its resident and one whole
	// claim, with one connection to spare.
	hosted := topology{multitenant: true, duties: DutiesWorkers}
	require.Equal(t, 1, corePoolResidents(hosted))
	require.Equal(t, 4, corePoolFloor(hosted))
}

// A pool below the floor cannot admit a workspace claim beside the process's
// residents, so composition refuses it before opening it. The api's floor is
// one more than the worker's, for the SSE broker it holds.
func TestCompositionRefusesACorePoolBelowItsFloor(t *testing.T) {
	for _, tc := range []struct {
		name     string
		duties   Duties
		maxConns string
		want     string
	}{
		{name: "api at four", duties: DutiesHTTP, maxConns: "4",
			want: "database.max_conns=4 is below this process's floor of 5: 2 resident listener connection(s), 2 for one workspace claim and 1 for other work"},
		{name: "combined at four", duties: DutiesAll, maxConns: "4",
			want: "database.max_conns=4 is below this process's floor of 5"},
		{name: "worker at three", duties: DutiesWorkers, maxConns: "3",
			want: "database.max_conns=3 is below this process's floor of 4: 1 resident listener connection(s)"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SMITHERS_AUTH_MODE", "multitenant")
			t.Setenv("SMITHERS_DATABASE_MAX_CONNS", tc.maxConns)
			t.Setenv("SMITHERS_DATABASE_MIN_CONNS", "1")
			err := RunWithOptions(context.Background(), nil, io.Discard, io.Discard, Options{Duties: tc.duties})
			require.ErrorContains(t, err, tc.want)
		})
	}
	// At the floor the check passes, whatever else the composition needs.
	for _, t2 := range []struct {
		topology topology
		maxConns int32
	}{{topology{multitenant: true, duties: DutiesHTTP}, 5}, {topology{multitenant: true}, 5}, {topology{duties: DutiesWorkers}, 4}} {
		require.NoError(t, requireCorePoolFloor(t2.maxConns, t2.topology))
		require.Error(t, requireCorePoolFloor(t2.maxConns-1, t2.topology))
	}
}
