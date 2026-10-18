package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

// Exercise the real router's identity-loader composition, before RequireAuth.
// The routes integration matrix separately exercises the actual read handlers.
func TestRunRecordVisibilityBeforeAuthentication(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := context.Background()
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "turn-owner", LowerUsername: "turn-owner"})
	require.NoError(t, err)
	other, err := q.CreateUser(ctx, db.CreateUserParams{Username: "turn-reader", LowerUsername: "turn-reader"})
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "turns", LowerName: "turns", IsPublic: true})
	require.NoError(t, err)
	def, err := q.UpsertAgentWorkflowDefinition(ctx, repo.ID)
	require.NoError(t, err)
	session := "b51690fd-f6b9-4d6c-980a-de3bbe1433f0"
	_, err = pool.Exec(ctx, `INSERT INTO agent_sessions(id,repository_id,user_id,title,status) VALUES($1,$2,$3,'private','active')`, session, repo.ID, owner.ID)
	require.NoError(t, err)
	input, _ := json.Marshal(map[string]string{"agent_session_id": session})
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo.ID, WorkflowDefinitionID: def.ID, ExecutionPlane: "agent", TriggerEvent: "agent_message", Status: "running", DispatchInputs: input})
	require.NoError(t, err)
	for _, path := range []string{
		"/api/repos/o/r/runs/%d", "/api/repos/o/r/runs/%d/events", "/api/repos/o/r/runs/%d/status/stream",
		"/api/runs/%d/background-status", "/api/flows/runs/%d",
	} {
		for _, viewer := range []db.User{owner, other, {}} {
			t.Run(fmt.Sprintf(path, run.ID)+fmt.Sprint(viewer.ID), func(t *testing.T) {
				req := httptest.NewRequest(http.MethodGet, fmt.Sprintf(path, run.ID), nil)
				if viewer.ID > 0 {
					req = req.WithContext(context.WithValue(req.Context(), middleware.UserContextKey, &viewer))
				}
				rec := httptest.NewRecorder()
				authLoader(q, config.AuthConfig{Mode: config.AuthModeMultitenant})(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))).ServeHTTP(rec, req)
				expected := 404
				if viewer.ID == owner.ID {
					expected = 204
				}
				require.Equal(t, expected, rec.Code, rec.Body.String())
			})
		}
	}
}

func TestRunRecordPreflightDoesNotRevealUnreadableOrdinaryRuns(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := context.Background()
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "private-run-owner", LowerUsername: "private-run-owner"})
	require.NoError(t, err)
	other, err := q.CreateUser(ctx, db.CreateUserParams{Username: "private-run-reader", LowerUsername: "private-run-reader"})
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "private-runs", LowerName: "private-runs"})
	require.NoError(t, err)
	def, err := q.CreateWorkflowDefinition(ctx, db.CreateWorkflowDefinitionParams{RepositoryID: repo.ID, Name: "Ordinary", Path: ".smithers/flows/ordinary/flow.ts", Config: json.RawMessage(`{}`)})
	require.NoError(t, err)
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo.ID, WorkflowDefinitionID: def.ID, Status: "running", TriggerEvent: "push", ExecutionPlane: "sandbox"})
	require.NoError(t, err)
	for _, viewer := range []db.User{owner, other, {}} {
		for _, id := range []int64{run.ID, 9223372036854775807} {
			t.Run(fmt.Sprintf("viewer-%d/run-%d", viewer.ID, id), func(t *testing.T) {
				req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/repos/private-run-owner/private-runs/runs/%d/logs", id), nil)
				if viewer.ID > 0 {
					req = req.WithContext(context.WithValue(req.Context(), middleware.UserContextKey, &viewer))
				}
				rec := httptest.NewRecorder()
				authLoader(q, config.AuthConfig{Mode: config.AuthModeMultitenant})(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))).ServeHTTP(rec, req)
				expected := 404
				if viewer.ID == owner.ID && id == run.ID {
					expected = 204
				}
				require.Equal(t, expected, rec.Code, rec.Body.String())
			})
		}
	}
}

func TestRunRecordVisibilityUsesSSETicketIdentity(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := context.Background()
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "ticket-run-owner", LowerUsername: "ticket-run-owner"})
	require.NoError(t, err)
	other, err := q.CreateUser(ctx, db.CreateUserParams{Username: "ticket-run-reader", LowerUsername: "ticket-run-reader"})
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "ticket-runs", LowerName: "ticket-runs", IsPublic: true})
	require.NoError(t, err)
	def, err := q.UpsertAgentWorkflowDefinition(ctx, repo.ID)
	require.NoError(t, err)
	session := "cc2175c0-348e-444e-8e68-c180af61bc56"
	_, err = pool.Exec(ctx, `INSERT INTO agent_sessions(id,repository_id,user_id,title,status) VALUES($1,$2,$3,'private','active')`, session, repo.ID, owner.ID)
	require.NoError(t, err)
	input, _ := json.Marshal(map[string]string{"agent_session_id": session})
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: repo.ID, WorkflowDefinitionID: def.ID, ExecutionPlane: "agent", TriggerEvent: "agent_message", Status: "running", DispatchInputs: input})
	require.NoError(t, err)
	tickets := services.NewSSETicketService(q)
	ticketAuth := middleware.SSETicketAuth(tickets, nil)
	for _, user := range []db.User{owner, other} {
		key := fmt.Sprintf("run-ticket-session-%d", user.ID)
		_, err = q.CreateAuthSession(ctx, db.CreateAuthSessionParams{SessionKey: key, UserID: user.ID, Username: user.Username, ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		for _, path := range []string{"/api/repos/o/r/runs/%d/logs", "/api/repos/o/r/runs/%d/events", "/api/repos/o/r/workflows/runs/%d/events", "/api/repos/o/r/runs/%d/status/stream"} {
			t.Run(fmt.Sprintf("viewer-%d/", user.ID)+path, func(t *testing.T) {
				ticket, err := tickets.CreateTicket(ctx, user.ID, false, "", key)
				require.NoError(t, err)
				req := httptest.NewRequest(http.MethodGet, fmt.Sprintf(path, run.ID)+"?ticket="+ticket.Ticket, nil)
				rec := httptest.NewRecorder()
				// Match the run-stream group's identity/ticket/guard composition.
				authLoader(q, config.AuthConfig{Mode: config.AuthModeMultitenant}, ticketAuth)(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))).ServeHTTP(rec, req)
				expected := 404
				if user.ID == owner.ID {
					expected = 204
				}
				require.Equal(t, expected, rec.Code, rec.Body.String())
			})
		}
	}
	for _, pair := range []struct {
		name            string
		initial, ticket db.User
		status          int
	}{
		{"owner ticket replaces another cookie", other, owner, 204},
		{"another ticket replaces owner cookie", owner, other, 404},
	} {
		t.Run(pair.name, func(t *testing.T) {
			ticket, err := tickets.CreateTicket(ctx, pair.ticket.ID, false, "", fmt.Sprintf("run-ticket-session-%d", pair.ticket.ID))
			require.NoError(t, err)
			req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/repos/o/r/runs/%d/logs?ticket=%s", run.ID, ticket.Ticket), nil)
			req = req.WithContext(context.WithValue(req.Context(), middleware.UserContextKey, &pair.initial))
			rec := httptest.NewRecorder()
			authLoader(q, config.AuthConfig{Mode: config.AuthModeMultitenant}, ticketAuth)(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))).ServeHTTP(rec, req)
			require.Equal(t, pair.status, rec.Code, rec.Body.String())
		})
	}

}
