package compose

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// HOSTED STARTS NO WORKFLOW-INVOKE HOST (PM d-nds5gd, release pin). POST
// /invoke booted a box whose developer has root for any repository writer
// (production run 17939, still retrying on 10-19). Hosted now answers the
// invoke 503 and creates nothing; an install still invokes.

type invokeFixture struct {
	pool   *pgxpool.Pool
	q      *db.Queries
	repoID int64
	token  string
}

func newInvokeFixture(t *testing.T) invokeFixture {
	t.Helper()
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "trig-owner", LowerUsername: "trig-owner", DisplayName: "Owner"})
	require.NoError(t, err)
	repoID := ciTestRepo(t, pool, owner.ID, "app")
	plaintext := "smithers_" + hex.EncodeToString([]byte("hosted-invoke-token-padding-bytes"))[:40]
	sum := sha256.Sum256([]byte(plaintext))
	hash := hex.EncodeToString(sum[:])
	_, err = q.CreateAccessToken(ctx, db.CreateAccessTokenParams{
		UserID: owner.ID, Name: "personal", TokenHash: hash, TokenLastEight: hash[len(hash)-8:],
		Scopes: string(middleware.ScopeWriteRepository), ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	})
	require.NoError(t, err)
	return invokeFixture{pool: pool, q: q, repoID: repoID, token: plaintext}
}

// invokedFlows composes the invoke service as main.go does for mode.
func (f invokeFixture) invokedFlows(t *testing.T, mode string, resolver flowruntime.ResolverFunc) (*services.InvokedFlowService, *flowdispatch.Service) {
	t.Helper()
	jobStore, err := jobs.NewStore(f.pool)
	require.NoError(t, err)
	invoked := services.NewInvokedFlowService(f.pool, services.NewRepositoryJobService(f.q, nil, f.pool), nil)
	dispatcher, err := flowdispatch.New(flowdispatch.Config{Store: jobStore, Resolver: resolver, Projector: invoked})
	require.NoError(t, err)
	invoked.SetFlowDispatcher(dispatcher)
	invoked.SetFlowSourceReader(invokeTestSources{})
	if mode != "" {
		services.ScopeFlowHosts(config.IsSingleOwner(config.AuthConfig{Mode: mode}), true, invoked, nil)
	}
	return invoked, dispatcher
}

func (f invokeFixture) invoke(t *testing.T, mode string, invoked *services.InvokedFlowService) *httptest.ResponseRecorder {
	t.Helper()
	cfg := testConfigAllFlagsOn()
	if mode == config.AuthModeMultitenant {
		cfg.Auth.Mode = mode
	}
	router := buildWorkflowTriggerRouter(f.q, f.pool, &routes.WorkflowHandler{
		Service: services.NewWorkflowAPIService(f.q, services.NewWorkflowRunService(f.q), services.WithWorkflowAPIFlowInvoker(invoked)),
	}, cfg)
	req := httptest.NewRequest(http.MethodPost, "/api/repos/trig-owner/app/invoke", bytes.NewBufferString(`{"flow":"ci"}`))
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func (f invokeFixture) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT count(*) FROM `+table).Scan(&n))
	return n
}

func noFlowHost(context.Context, flowruntime.Target) (flowruntime.Runtime, error) {
	return nil, context.Canceled
}

func TestHostedInvokeAnswers503AndStartsNoHost(t *testing.T) {
	t.Run("hosted", func(t *testing.T) {
		f := newInvokeFixture(t)
		invoked, _ := f.invokedFlows(t, config.AuthModeMultitenant, noFlowHost)

		rec := f.invoke(t, config.AuthModeMultitenant, invoked)

		require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
		var body struct {
			Code  string `json:"code"`
			Fault string `json:"fault"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Equal(t, "service_unavailable", body.Code, "the typed refusal, never a box")
		require.Equal(t, "infra", body.Fault)
		require.Zero(t, f.count(t, "workflow_runs"), "no run")
		require.Zero(t, f.count(t, "workflow_run_flow_invocations"), "no launch")
		require.Zero(t, f.count(t, "workspaces"), "no workspace row of any kind")
	})
	t.Run("a composition that never scopes its hosts refuses", func(t *testing.T) {
		f := newInvokeFixture(t)
		invoked, _ := f.invokedFlows(t, "", noFlowHost)

		rec := f.invoke(t, config.AuthModeMultitenant, invoked)

		require.Equal(t, http.StatusServiceUnavailable, rec.Code, "fail closed: %s", rec.Body.String())
		require.Zero(t, f.count(t, "workflow_runs"))
		require.Zero(t, f.count(t, "workspaces"))
	})
	t.Run("an install still invokes", func(t *testing.T) {
		f := newInvokeFixture(t)
		invoked, _ := f.invokedFlows(t, config.AuthModeSelfHosted, noFlowHost)

		rec := f.invoke(t, config.AuthModeSelfHosted, invoked)

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		require.Equal(t, 1, f.count(t, "workflow_run_flow_invocations"))
	})
}

// A workflow-invoke launch queued before the pin (run 17939) fails terminally
// on hosted at its first resolution, before its box exists, and never
// retries.
func TestAQueuedInvokeOnHostedFailsOnceAndNeverRetries(t *testing.T) {
	f := newInvokeFixture(t)
	// The launch was admitted while hosted still invoked.
	admitted, _ := f.invokedFlows(t, config.AuthModeSelfHosted, noFlowHost)
	rec := f.invoke(t, config.AuthModeSelfHosted, admitted)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var run struct {
		RunID int64 `json:"run_id"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &run))

	// The pinned hosted process resolves it.
	var resolutions atomic.Int32
	var hosted *services.InvokedFlowService
	hosted, dispatcher := f.invokedFlows(t, config.AuthModeMultitenant, func(ctx context.Context, target flowruntime.Target) (flowruntime.Runtime, error) {
		resolutions.Add(1)
		_, err := hosted.ResolveFlowHostTarget(ctx, target)
		if err == nil {
			t.Error("a hosted invoke target resolved")
		}
		return nil, err
	})
	workerCtx, stop := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- dispatcher.RunWorker(workerCtx, jobs.WorkerConfig{WorkerID: "hosted-invoke", Capacity: 1, Lease: time.Second,
			PollInterval: 5 * time.Millisecond, RetryDelay: 5 * time.Millisecond, MaxRetryDelay: 10 * time.Millisecond})
	}()
	t.Cleanup(func() { stop(); <-done })

	status := func() string {
		var s string
		require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT status FROM workflow_runs WHERE id=$1`, run.RunID).Scan(&s))
		return s
	}
	require.Eventually(t, func() bool {
		switch status() {
		case "queued", "pending", "running", "waiting":
			return false
		}
		return true
	}, 30*time.Second, 10*time.Millisecond, "the run reaches a terminal state")
	require.Never(t, func() bool { return resolutions.Load() > 1 }, 500*time.Millisecond, 10*time.Millisecond, "it is never retried")
	t.Logf("run %d ended %s after %d resolution(s)", run.RunID, status(), resolutions.Load())
	require.Equal(t, int32(1), resolutions.Load())
	require.Zero(t, f.count(t, "workspaces"), "no box was created")
}
