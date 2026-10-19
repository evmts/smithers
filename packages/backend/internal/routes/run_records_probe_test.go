package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// Regression ported from the tech lead's real-Postgres exposure probe.
// Another member must see only their own agent turns.
func TestRunRecordsProbeAnotherMembersAgentTurn(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	alice := runProbeUser(t, q, "alice-runs")
	bea := runProbeUser(t, q, "bea-runs")
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: alice.ID, Valid: true}, Name: "runs", LowerName: "runs", DefaultBookmark: "main"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO collaborators (repository_id, user_id, permission) VALUES ($1, $2, 'write')`, repo.ID, bea.ID)
	require.NoError(t, err)
	definition, err := q.UpsertAgentWorkflowDefinition(ctx, repo.ID)
	require.NoError(t, err)
	aliceTurn := runProbeTurn(t, pool, q, repo.ID, definition.ID, alice.ID, "ALICE-TURN-PROMPT")
	beaTurn := runProbeTurn(t, pool, q, repo.ID, definition.ID, bea.ID, "BEA-TURN-PROMPT")

	handler := &WorkflowHandler{Service: services.NewWorkflowAPIService(q, nil)}
	read := func(serve http.HandlerFunc, path string, params map[string]string) (int, string) {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req = withAuth(req, bea.ID, bea.Username)
		req = withRepoCtx(req, repo.ID, alice.Username, repo.Name)
		if params != nil {
			req = withChiParams(req, params)
		}
		rec := httptest.NewRecorder()
		serve(rec, req)
		return rec.Code, rec.Body.String()
	}
	listed := func(body string, run db.WorkflowRun) bool {
		return strings.Contains(body, `"id":`+strconv.FormatInt(run.ID, 10)+`,`)
	}

	for _, route := range []struct {
		path  string
		serve http.HandlerFunc
	}{
		{"/api/repos/o/r/runs", handler.ListAllWorkflowRuns},
		{"/api/repos/o/r/actions/runs", handler.ListAllWorkflowRuns},
		{"/api/repos/o/r/workflows/runs", handler.ListWorkflowRunsV2},
	} {
		code, body := read(route.serve, route.path, nil)
		t.Logf("PROBE %s as bea: status=%d lists_alice_turn=%v lists_bea_turn=%v carries_turn_content=%v body=%s",
			route.path, code, listed(body, aliceTurn), listed(body, beaTurn), strings.Contains(body, "ALICE-TURN-PROMPT"), body)
		require.Equal(t, http.StatusOK, code, route.path)
		require.False(t, listed(body, aliceTurn), "%s lists another member's agent turn", route.path)
		require.True(t, listed(body, beaTurn), "%s lists bea's own turn (control)", route.path)
		require.NotContains(t, body, "ALICE-TURN-PROMPT", "%s carries no turn content", route.path)
		require.Contains(t, body, `"execution_plane":"agent"`)
	}

	for _, run := range []db.WorkflowRun{aliceTurn, beaTurn} {
		code, body := read(handler.GetWorkflowRun, "/api/repos/o/r/runs/"+strconv.FormatInt(run.ID, 10), map[string]string{"id": strconv.FormatInt(run.ID, 10)})
		t.Logf("PROBE /runs/%d as bea: status=%d carries_turn_content=%v body=%s", run.ID, code, strings.Contains(body, "TURN-PROMPT"), body)
		if run.ID == aliceTurn.ID {
			require.Equal(t, http.StatusNotFound, code)
		} else {
			require.Equal(t, http.StatusOK, code)
		}
		require.NotContains(t, body, "TURN-PROMPT")
	}

	background := &services.HomeBackground{Pool: pool}
	_, err = background.Status(ctx, repo.ID, aliceTurn.ID)
	t.Logf("PROBE /api/runs/%d/background-status as bea: %v", aliceTurn.ID, err)
	var refusal *services.TodoControlError
	require.ErrorAs(t, err, &refusal)
	require.Equal(t, http.StatusNotFound, refusal.Status, "background-status reads only flow-plane runs")

	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	flows := &services.InstallFlowRuns{Jobs: store}
	for _, id := range []string{strconv.FormatInt(aliceTurn.ID, 10), uuid.NewString()} {
		_, err = flows.Status(ctx, repo.ID, bea.ID, id)
		t.Logf("PROBE /api/flows/runs/%s as bea: %v", id, err)
		require.Error(t, err, "flows/runs answers only an install flow-run job of the caller")
	}
}

func runProbeUser(t *testing.T, q *db.Queries, name string) db.User {
	t.Helper()
	user, err := q.CreateUser(context.Background(), db.CreateUserParams{Username: name, LowerUsername: name})
	require.NoError(t, err)
	return user
}

// runProbeTurn records one agent turn of person: an active agent session and
// its run on the agent plane, whose dispatch inputs carry prompt.
func runProbeTurn(t *testing.T, pool *pgxpool.Pool, q *db.Queries, repo, definition, person int64, prompt string) db.WorkflowRun {
	t.Helper()
	ctx := context.Background()
	session := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO agent_sessions (id, repository_id, user_id, title, status) VALUES ($1, $2, $3, 'turn', 'active')`, session, repo, person)
	require.NoError(t, err)
	inputs, err := json.Marshal(map[string]string{"prompt": prompt, "session_id": session.String()})
	require.NoError(t, err)
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo, WorkflowDefinitionID: definition, Status: "running",
		TriggerEvent: "agent_message", TriggerRef: "main", DispatchInputs: inputs, ExecutionPlane: "agent"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE agent_sessions SET workflow_run_id = $2 WHERE id = $1`, session, run.ID)
	require.NoError(t, err)
	return run
}
