package compose

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/admission"
	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// A box start the payer's plan refuses ends its run at once, typed (QA
// b-jpt11m, PM d-4q4e0t). It used to be an untyped error the resolver
// retried as runtime_start_failed: three starts over four minutes, then the
// turn ended as flow_host_unavailable and its box was stopped, still holding
// its instance.
func TestAPlanRefusedHostStartEndsItsRunAtOnceTyped(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var person, repo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('limit-owner','limit-owner') RETURNING id`).Scan(&person))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,default_bookmark) VALUES ($1,'repo','repo','main') RETURNING id`, person).Scan(&repo))
	policy, err := admission.NewMetered(pool, admission.Config{Usage: admission.ProductUsage})
	require.NoError(t, err)
	var attempts atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	launcher, err := newAdmittedFlowLauncher(refusingHostTransport{server.URL}, db.New(pool), policy, nil)
	require.NoError(t, err)
	for _, vm := range []string{"other", "this"} {
		_, err := pool.Exec(ctx, `INSERT INTO workspaces(id,repository_id,user_id,vm_id,name,status) VALUES ($1,$2,$3,$4,$4,'running')`, uuid.NewString(), repo, person, vm)
		require.NoError(t, err)
	}
	var machine string
	require.NoError(t, pool.QueryRow(ctx, `SELECT id::text FROM workspaces WHERE vm_id='this'`).Scan(&machine))

	_, err = launcher.StartFlowHost(ctx, flowhost.HostLaunch{Authority: flowhost.Authority{RepositoryID: repo, UserID: person, WorkspaceID: machine}})

	require.Zero(t, attempts.Load(), "a refused start never reaches the host")
	var refused flowruntime.Failure
	require.ErrorAs(t, err, &refused)
	require.Equal(t, "plan_limit:concurrent_sandboxes", refused.FlowRuntimeCode())
	require.False(t, refused.FlowRuntimeRetryable(), "retrying cannot free the payer's other machine: the run ends at once")
	var detailed interface{ FlowRuntimeDetail() string }
	require.ErrorAs(t, err, &detailed)
	require.Equal(t, "You can run one machine at a time. Wait for your other change to finish, then try again.", detailed.FlowRuntimeDetail())
}
