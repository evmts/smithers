package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/blob"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/sse"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

// A real database and broker exercise every run-record read alias. Cancelling
// on the first flush bounds SSE without replacing its transport or services.
type runRecordRecorder struct {
	*httptest.ResponseRecorder
	cancel context.CancelFunc
}

func (w *runRecordRecorder) Flush() { w.ResponseRecorder.Flush(); w.cancel() }

func runRecordAsUser(req *http.Request, user db.User, guest bool) *http.Request {
	if user.ID > 0 {
		req = withAuth(req, user.ID, user.Username)
	}
	if guest {
		req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{User: &user, IsTokenAuth: true, TokenSystemIssued: true, RawScopes: "read:repository", Scopes: middleware.ParseTokenScopes("read:repository")}))
	}
	return req
}

func TestRunRecordsCreatorOnlyEveryReadSurface(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	alice := runProbeUser(t, q, "run-owner")
	writer := runProbeUser(t, q, "run-writer")
	reader := runProbeUser(t, q, "run-reader")
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: alice.ID, Valid: true}, Name: "public-runs", LowerName: "public-runs", DefaultBookmark: "main"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE repositories SET is_public=true WHERE id=$1`, repo.ID)
	require.NoError(t, err)
	for _, member := range []struct {
		user       db.User
		permission string
	}{{writer, "write"}, {reader, "read"}} {
		_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,$3)`, repo.ID, member.user.ID, member.permission)
		require.NoError(t, err)
	}
	def, err := q.CreateWorkflowDefinition(ctx, db.CreateWorkflowDefinitionParams{RepositoryID: repo.ID, Name: "Probe", Path: ".smithers/flows/probe/flow.ts", Config: json.RawMessage(`{}`)})
	require.NoError(t, err)
	ordinary, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo.ID, WorkflowDefinitionID: def.ID, Status: "running", TriggerEvent: "push", ExecutionPlane: "sandbox"})
	require.NoError(t, err)
	agent := runProbeTurn(t, pool, q, repo.ID, def.ID, alice.ID, "PRIVATE-PROMPT")
	// Retain an old turn via its task payload after the session points elsewhere.
	var session string
	require.NoError(t, pool.QueryRow(ctx, `SELECT id::text FROM agent_sessions WHERE workflow_run_id=$1`, agent.ID).Scan(&session))
	for _, run := range []db.WorkflowRun{ordinary, agent} {
		step, err := q.CreateWorkflowStep(ctx, db.CreateWorkflowStepParams{WorkflowRunID: run.ID, Name: "probe", Position: 0, Status: "running"})
		require.NoError(t, err)
		_, err = q.InsertWorkflowLog(ctx, db.InsertWorkflowLogParams{WorkflowRunID: run.ID, WorkflowStepID: step.ID, Sequence: 1, Stream: "stdout", Entry: "RUN-LOG"})
		require.NoError(t, err)
		if run.ID == agent.ID {
			_, err = q.CreateWorkflowTask(ctx, db.CreateWorkflowTaskParams{RepositoryID: repo.ID, WorkflowRunID: run.ID, WorkflowStepID: step.ID, Status: "pending", Payload: []byte(fmt.Sprintf(`{"session_id":%q}`, session)), AvailableAt: time.Now()})
			require.NoError(t, err)
		}
	}
	_, err = pool.Exec(ctx, `UPDATE agent_sessions SET workflow_run_id=NULL WHERE id=$1::uuid`, session)
	require.NoError(t, err)
	blobs := blob.NewMemoryStore()
	for _, run := range []db.WorkflowRun{ordinary, agent} {
		art, err := q.CreateWorkflowArtifact(ctx, db.CreateWorkflowArtifactParams{RepositoryID: repo.ID, WorkflowRunID: run.ID, Name: "receipt", Size: 7, ContentType: "text/plain", ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `UPDATE workflow_artifacts SET status='ready',confirmed_at=now() WHERE id=$1`, art.ID)
		require.NoError(t, err)
		require.NoError(t, blobs.Put(ctx, art.GcsKey, "text/plain", strings.NewReader("OUTPUT!")))
	}
	service := services.NewWorkflowAPIService(q, nil)
	h := &WorkflowHandler{Service: service}
	artifacts := &WorkflowArtifactHandler{Service: services.NewWorkflowArtifactService(q, blobs, time.Minute)}
	broker := sse.NewBroker(pool)
	require.NoError(t, broker.Start(ctx))
	t.Cleanup(broker.Stop)
	streams := &WorkflowRunHandler{Service: service, Broker: broker}
	// /flows/runs is a UUID job namespace, and background-status is flow-plane
	// only: numeric agent records remain absent there for their creator as well.
	background := &services.HomeBackground{Pool: pool}
	routes := []struct {
		path         string
		serve        http.HandlerFunc
		list, stream bool
	}{
		{"/api/repos/o/r/runs", h.ListAllWorkflowRuns, true, false},
		{"/api/repos/o/r/actions/runs", h.ListAllWorkflowRuns, true, false},
		{"/api/repos/o/r/workflows/runs", h.ListWorkflowRunsV2, true, false},
		{"/api/repos/o/r/workflows/{definition}/runs", h.ListWorkflowRuns, true, false},
		{"/api/repos/o/r/runs/{id}", h.GetWorkflowRun, false, false},
		{"/api/repos/o/r/actions/runs/{id}", h.GetWorkflowRun, false, false},
		{"/api/repos/o/r/workflows/runs/{id}", h.GetWorkflowRunV2, false, false},
		{"/api/repos/o/r/runs/{id}/status", h.GetWorkflowRunStatus, false, false},
		{"/api/repos/o/r/runs/{id}/steps", h.ListWorkflowRunSteps, false, false},
		{"/api/repos/o/r/actions/runs/{id}/steps", h.ListWorkflowRunSteps, false, false},
		{"/api/repos/o/r/workflows/runs/{id}/nodes/probe", h.GetWorkflowRunNode, false, false},
		{"/api/repos/o/r/runs/{id}/artifacts", artifacts.ListArtifacts, false, false},
		{"/api/repos/o/r/actions/runs/{id}/artifacts", artifacts.ListArtifacts, false, false},
		{"/api/repos/o/r/workflow/runs/{id}/artifacts", artifacts.ListArtifacts, false, false},
		{"/api/repos/o/r/runs/{id}/artifacts/receipt/download", artifacts.GetDownloadURL, false, false},
		{"/api/repos/o/r/actions/runs/{id}/artifacts/receipt/download", artifacts.GetDownloadURL, false, false},
		{"/api/repos/o/r/workflow/runs/{id}/artifacts/receipt", artifacts.GetDownloadURL, false, false},
		{"/api/repos/o/r/runs/{id}/logs", streams.WorkflowRunLogsStream, false, true},
		{"/api/repos/o/r/runs/{id}/events", streams.WorkflowRunLogsStream, false, true},
		{"/api/repos/o/r/workflows/runs/{id}/events", streams.WorkflowRunLogsStream, false, true},
		{"/api/repos/o/r/runs/{id}/status/stream", streams.WorkflowRunStatusStream, false, true},
	}
	t.Run("internal bound artifact download", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/internal/runs/%d/artifacts/receipt/download", agent.ID), nil)
		req = withChiParams(req, map[string]string{"id": fmt.Sprint(agent.ID), "name": "receipt"})
		req = req.WithContext(middleware.ContextWithWorkflowRun(req.Context(), &agent))
		rec := httptest.NewRecorder()
		artifacts.GetInternalDownloadURL(rec, req)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		wrong := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/internal/runs/%d/artifacts/receipt/download", ordinary.ID), nil)
		wrong = withChiParams(wrong, map[string]string{"id": fmt.Sprint(ordinary.ID), "name": "receipt"})
		wrong = wrong.WithContext(middleware.ContextWithWorkflowRun(wrong.Context(), &agent))
		bad := httptest.NewRecorder()
		artifacts.GetInternalDownloadURL(bad, wrong)
		require.Equal(t, 403, bad.Code)
	})
	for _, viewer := range []struct {
		name  string
		user  db.User
		guest bool
	}{{"creator", alice, false}, {"writer", writer, false}, {"reader", reader, false}, {"visitor", db.User{}, false}, {"owner-backed guest", alice, true}} {
		t.Run(viewer.name, func(t *testing.T) {
			for _, route := range routes {
				t.Run(route.path, func(t *testing.T) {
					runs := []db.WorkflowRun{agent, ordinary}
					if route.list {
						runs = runs[:1]
					}
					for _, run := range runs {
						path := strings.ReplaceAll(strings.ReplaceAll(route.path, "{id}", strconv.FormatInt(run.ID, 10)), "{definition}", strconv.FormatInt(def.ID, 10))
						req := httptest.NewRequest(http.MethodGet, path, nil)
						req = runRecordAsUser(req, viewer.user, viewer.guest)
						req = withRepoCtx(req, repo.ID, alice.Username, repo.Name)
						req = withChiParams(req, map[string]string{"id": strconv.FormatInt(run.ID, 10), "nodeId": "probe", "name": "receipt"})
						if route.list && strings.Contains(route.path, "{definition}") {
							req = withChiParams(req, map[string]string{"id": strconv.FormatInt(def.ID, 10)})
						}
						requestCtx, cancel := context.WithTimeout(req.Context(), 5*time.Second)
						defer cancel()
						req = req.WithContext(requestCtx)
						rec := &runRecordRecorder{httptest.NewRecorder(), cancel}
						middleware.RunRecordVisibility(q)(route.serve).ServeHTTP(rec, req)
						expected := http.StatusOK
						if !route.list && run.ID == agent.ID && (viewer.user.ID != alice.ID || viewer.guest) {
							expected = http.StatusNotFound
						}
						if route.stream && run.ID == ordinary.ID && viewer.user.ID == 0 {
							expected = http.StatusUnauthorized
						}
						require.Equal(t, expected, rec.Code, "%s: %s", path, rec.Body.String())
						if route.list {
							var body struct {
								Runs         []db.WorkflowRun `json:"runs"`
								WorkflowRuns []db.WorkflowRun `json:"workflow_runs"`
							}
							require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
							listed := append(body.Runs, body.WorkflowRuns...)
							expectedCount := 1
							if viewer.user.ID == alice.ID && !viewer.guest {
								expectedCount = 2
							}
							require.Len(t, listed, expectedCount)
							require.Equal(t, ordinary.ID, listed[len(listed)-1].ID)
							if expectedCount == 1 {
								require.NotContains(t, rec.Body.String(), "agent_message")
							}
						}
					}
				})
			}
			authCtx := ctx
			if viewer.user.ID > 0 {
				authCtx = runRecordAsUser(httptest.NewRequest(http.MethodGet, "/", nil), viewer.user, viewer.guest).Context()
			}
			if viewer.user.ID > 0 {
				t.Run("visible active count", func(t *testing.T) {
					req := runRecordAsUser(httptest.NewRequest(http.MethodGet, "/api/user/workflow-runs/active-count", nil), viewer.user, viewer.guest)
					rec := httptest.NewRecorder()
					(&WorkflowRunCountHandler{Counter: q}).GetActiveWorkflowRunCount(rec, req)
					expected := 1
					if viewer.user.ID == alice.ID && !viewer.guest {
						expected = 2
					}
					require.Equal(t, 200, rec.Code)
					require.JSONEq(t, fmt.Sprintf(`{"active_count":%d}`, expected), rec.Body.String())
				})
			}
			visible, err := service.ListWorkflowRunsByRepo(authCtx, repo.ID, 1, 1)
			require.NoError(t, err)
			require.Len(t, visible, 1)
			expectedID := ordinary.ID
			if viewer.user.ID == alice.ID && !viewer.guest {
				expectedID = agent.ID
			}
			require.Equal(t, expectedID, visible[0].ID)
			second, err := service.ListWorkflowRunsByRepo(authCtx, repo.ID, 2, 1)
			require.NoError(t, err)
			if viewer.user.ID == alice.ID && !viewer.guest {
				require.Len(t, second, 1)
				require.Equal(t, ordinary.ID, second[0].ID)
			} else {
				require.Empty(t, second)
			}
			if viewer.user.ID > 0 {
				count, err := q.CountVisibleActiveWorkflowRunsForUser(authCtx, viewer.user.ID, middleware.RunRecordViewerID(authCtx))
				require.NoError(t, err)
				expected := 1
				if viewer.user.ID == alice.ID && !viewer.guest {
					expected = 2
				}
				require.Equal(t, expected, count)
			}
			_, err = background.Status(authCtx, repo.ID, agent.ID)
			require.Error(t, err)
		})
	}
	// The same entry guard protects controls and UUID-only install status before
	// their auth/write gates; no control is actually executed in this read test.
	for _, pattern := range []string{
		"/api/runs/{id}/background-status", "/api/flows/runs/{id}",
		"/api/repos/o/r/actions/runs/{id}/cancel", "/api/repos/o/r/actions/runs/{id}/rerun",
		"/api/repos/o/r/runs/{id}/cancel", "/api/repos/o/r/runs/{id}/rerun", "/api/repos/o/r/runs/{id}/resume",
		"/api/repos/o/r/workflows/runs/{id}/cancel", "/api/repos/o/r/workflows/runs/{id}/rerun", "/api/repos/o/r/workflows/runs/{id}/resume",
		"/api/repos/o/r/actions/runs/{id}/artifacts/receipt", "/api/repos/o/r/workflow/runs/{id}/artifacts/receipt",
	} {
		for _, user := range []db.User{alice, writer, reader, {}} {
			path := strings.ReplaceAll(pattern, "{id}", strconv.FormatInt(agent.ID, 10))
			req := httptest.NewRequest(http.MethodGet, path, nil)
			if user.ID > 0 {
				req = withAuth(req, user.ID, user.Username)
			}
			rec := httptest.NewRecorder()
			reached := false
			middleware.RunRecordVisibility(q)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true; w.WriteHeader(http.StatusNoContent) })).ServeHTTP(rec, req)
			require.Equal(t, user.ID == alice.ID, reached, path)
			if user.ID != alice.ID {
				require.Equal(t, http.StatusNotFound, rec.Code, path)
			}
		}
	}
	// A chi router proves identity/params survive the global middleware shape.
	router := chi.NewRouter()
	router.Use(middleware.RunRecordVisibility(q))
	router.Get("/api/repos/o/r/runs/{id}", h.GetWorkflowRun)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/repos/o/r/runs/%d", agent.ID), nil))
	require.Equal(t, 404, rec.Code)
}

// Marker variants include pre-marker historical turns, current turns, a
// binding-only launch, broken ownership, and flow-plane background projections.
func TestRunRecordMarkersAndBackgroundVisibility(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	owner := runProbeUser(t, q, "marker-owner")
	other := runProbeUser(t, q, "marker-other")
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "markers", LowerName: "markers"})
	require.NoError(t, err)
	def, err := q.CreateWorkflowDefinition(ctx, db.CreateWorkflowDefinitionParams{RepositoryID: repo.ID, Name: "Markers", Path: ".smithers/flows/markers/flow.ts", Config: json.RawMessage(`{}`)})
	require.NoError(t, err)
	session := "a53e425d-2439-4bb5-83f7-ac3d79fd88f1"
	_, err = pool.Exec(ctx, `INSERT INTO agent_sessions(id,repository_id,user_id,title,status) VALUES($1,$2,$3,'private','active')`, session, repo.ID, owner.ID)
	require.NoError(t, err)
	for _, row := range []struct {
		name, plane, trigger, inputs string
		own, public                  bool
	}{
		{"ordinary", "flow", "push", `{}`, false, true},
		{"ordinary session argument", "flow", "push", `{"session_id":"ordinary-flow-input"}`, false, true},
		{"ordinary array payload", "flow", "push", `["agent_session_id"]`, false, true},
		{"ordinary scalar payload", "flow", "push", `"agent_session_id"`, false, true},
		{"ordinary null session argument", "flow", "push", `{"agent_session_id":null}`, false, true},
		{"ordinary null payload", "flow", "push", `null`, false, true},
		{"ordinary task session argument", "flow", "push", `{}`, false, true},
		{"marker", "flow", "push", fmt.Sprintf(`{"agent_session_id":%q}`, session), true, false},
		{"marker uppercase UUID", "flow", "push", fmt.Sprintf(`{"agent_session_id":%q}`, strings.ToUpper(session)), true, false},
		{"marker compact UUID", "flow", "push", fmt.Sprintf(`{"agent_session_id":%q}`, strings.ReplaceAll(session, "-", "")), true, false},
		{"marker braced UUID", "flow", "push", fmt.Sprintf(`{"agent_session_id":"{%s}"}`, session), true, false},
		{"legacy marker", "agent", "agent_message", fmt.Sprintf(`{"session_id":%q}`, session), true, false},
		{"current session", "agent", "agent_message", `{}`, true, false},
		{"binding", "flow", "push", `{}`, true, false},
		{"orphan plane", "agent", "push", `{}`, false, false},
		{"orphan trigger", "flow", "agent_message", `{}`, false, false},
		{"missing session", "flow", "push", `{"agent_session_id":"not-a-uuid"}`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo.ID, WorkflowDefinitionID: def.ID, Status: "running", ExecutionPlane: row.plane, TriggerEvent: row.trigger, DispatchInputs: []byte(row.inputs)})
			require.NoError(t, err)
			if row.name == "ordinary task session argument" {
				step, err := q.CreateWorkflowStep(ctx, db.CreateWorkflowStepParams{WorkflowRunID: run.ID, Name: "flow", Position: 0, Status: "running"})
				require.NoError(t, err)
				_, err = q.CreateWorkflowTask(ctx, db.CreateWorkflowTaskParams{RepositoryID: repo.ID, WorkflowRunID: run.ID, WorkflowStepID: step.ID, Status: "pending", Payload: []byte(`{"session_id":"ordinary-flow-input"}`), AvailableAt: time.Now()})
				require.NoError(t, err)
			}
			if row.name == "current session" {
				_, err = pool.Exec(ctx, `UPDATE agent_sessions SET workflow_run_id=$1 WHERE id=$2`, run.ID, session)
				require.NoError(t, err)
			}
			if row.name == "binding" {
				payload := fmt.Sprintf(`{"target":{"BindingKind":"agent-session","BindingID":%q}}`, session)
				_, err = pool.Exec(ctx, `INSERT INTO product_job_requests(id,tenant_id,principal_id,operation,request_id,payload_fingerprint,payload,authorization_context,state,request_receipt) VALUES(gen_random_uuid(),$1,$2,'flow.runtime.launch',$3,decode(repeat('00',32),'hex'),$4,'{}','accepted','{}')`, fmt.Sprintf("repository:%d", repo.ID), fmt.Sprintf("user:%d", owner.ID), fmt.Sprintf("agent-run:%d", run.ID), payload)
				require.NoError(t, err)
			}
			for _, viewer := range []int64{0, owner.ID, other.ID} {
				actual, err := q.MayViewWorkflowRun(ctx, run.ID, viewer)
				require.NoError(t, err)
				require.Equal(t, row.public || (row.own && viewer == owner.ID), actual, "viewer=%d", viewer)
				authCtx := ctx
				if viewer > 0 {
					authCtx = withAuth(httptest.NewRequest(http.MethodGet, "/", nil), viewer, "viewer").Context()
				}
				listed, err := services.NewMythicalService(pool, nil).BackgroundRuns(authCtx, repo.ID)
				require.NoError(t, err)
				found := false
				for _, entry := range listed {
					if entry["id"] == fmt.Sprint(run.ID) {
						found = true
					}
				}
				require.Equal(t, (row.plane == "flow") && (row.public || (row.own && viewer == owner.ID)), found)
				if row.plane == "flow" {
					_, err = (&services.HomeBackground{Pool: pool}).Status(authCtx, repo.ID, run.ID)
					if row.public || (row.own && viewer == owner.ID) {
						require.NoError(t, err)
					} else {
						require.Error(t, err)
					}
				}
			}
		})
	}
	visible, err := q.MayViewWorkflowRun(ctx, 9223372036854775807, owner.ID)
	require.NoError(t, err)
	require.False(t, visible)
}
