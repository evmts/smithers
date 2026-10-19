package services_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// The app finds a session's agent box through the session read, never the
// person's workspace list (hosted P0 A/B contract). With one box per session
// (plue#869) that read names the session's own box, and the same one on
// every later turn.
func TestAgentSessionReadNamesItsOwnStableBox(t *testing.T) {
	turns := services.NewAgentBoxTurnsForTest(t)
	q := db.New(turns.Pool)
	repo, err := q.GetRepoByID(t.Context(), turns.Repo)
	require.NoError(t, err)
	handler := &routes.AgentSessionHandler{Service: services.NewAgentServiceWithPool(q, turns.Pool, services.WithAgentDispatchQuerier(q))}
	router := chi.NewRouter()
	router.Get("/api/repos/{owner}/{repo}/agent/sessions/{id}", handler.GetSession)
	read := func() string {
		t.Helper()
		r := httptest.NewRequest(http.MethodGet, "/api/repos/o/r/agent/sessions/"+turns.Session, nil)
		ctx := middleware.ContextWithAuthInfo(r.Context(), &middleware.AuthInfo{User: &db.User{ID: turns.Person}, SessionHash: "person"})
		ctx = middleware.ContextWithRepoContext(ctx, &middleware.RepoContext{Repository: &repo}, middleware.PermissionWrite)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r.WithContext(ctx))
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		var session struct {
			WorkspaceID string `json:"workspace_id"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &session))
		return session.WorkspaceID
	}

	first := turns.Turn(t)
	require.Equal(t, first.WorkspaceID, read(), "the session read names the session's own box")
	var owner string
	require.NoError(t, turns.Pool.QueryRow(t.Context(), `SELECT agent_session_id::text FROM workspaces WHERE id=$1`, first.WorkspaceID).Scan(&owner))
	require.Equal(t, turns.Session, owner)

	second := turns.Turn(t)
	require.Equal(t, first.WorkspaceID, second.WorkspaceID)
	require.Equal(t, first.WorkspaceID, read(), "the session's box id is stable across its turns")
}
