package services_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// Real PostgreSQL backs every authorization and transcript read; identity and
// repository permission are supplied at the middleware boundary.
func TestAgentSessionCreatorOnlyHTTPPostgres(t *testing.T) {
	_, agents, creator, repository, sessionID, _, _ := services.NewSessionLandingHTTPFixture(t)
	handler := &routes.AgentSessionHandler{Service: agents}
	stream := &routes.AgentSessionStreamHandler{Service: agents}
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			actor := *creator
			permission := middleware.PermissionWrite
			switch r.Header.Get("X-Test-Actor") {
			case "member":
				actor.ID += 1000
			case "reader":
				actor.ID += 2000
				permission = middleware.PermissionRead
			}
			if r.Header.Get("X-Test-Actor") != "anonymous" {
				ctx = middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: &actor})
			}
			ctx = middleware.ContextWithRepoContext(ctx, &middleware.RepoContext{Owner: creator.Username, Repository: &repository}, permission)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	router.Get("/sessions", handler.ListSessions)
	router.Get("/sessions/{id}", handler.GetSession)
	router.Get("/sessions/{id}/messages", handler.ListMessages)
	router.Get("/sessions/{id}/stream", stream.AgentSessionStream)
	for _, actor := range []string{"creator", "member", "reader", "anonymous"} {
		for _, suffix := range []string{"", "/messages", "/stream", "/stream?replay=1"} {
			if actor == "creator" && strings.HasPrefix(suffix, "/stream") {
				continue
			} // live/replay broker covered separately
			t.Run(actor+suffix, func(t *testing.T) {
				req := httptest.NewRequest("GET", "/sessions/"+sessionID+suffix, nil)
				req.Header.Set("X-Test-Actor", actor)
				if strings.Contains(suffix, "replay") {
					req.Header.Set("Last-Event-ID", "1")
				}
				out := httptest.NewRecorder()
				router.ServeHTTP(out, req)
				want := 404
				if actor == "creator" {
					want = 200
				}
				require.Equal(t, want, out.Code, out.Body.String())
			})
		}
		t.Run(actor+"/list", func(t *testing.T) {
			for _, cursor := range []string{"0", "1", "100"} {
				req := httptest.NewRequest("GET", "/sessions?limit=1&cursor="+cursor, nil)
				req.Header.Set("X-Test-Actor", actor)
				out := httptest.NewRecorder()
				router.ServeHTTP(out, req)
				if actor == "anonymous" {
					require.Equal(t, 404, out.Code)
					continue
				}
				require.Equal(t, 200, out.Code, out.Body.String())
				if actor != "creator" {
					require.JSONEq(t, `[]`, out.Body.String())
					require.Equal(t, "0", out.Header().Get("X-Total-Count"))
				} else {
					require.Equal(t, "1", out.Header().Get("X-Total-Count"))
					var rows []services.AgentSessionResponse
					require.NoError(t, json.Unmarshal(out.Body.Bytes(), &rows))
					for _, row := range rows {
						require.Equal(t, creator.ID, row.UserID)
					}
				}
			}
		})
	}
	// Service calls without an HTTP actor must fail closed as well.
	require.Error(t, agents.GetSessionForRepo(context.Background(), sessionID, repository.ID))
	_, _, err := agents.ListSessions(context.Background(), repository.ID, 1, 30)
	require.Error(t, err)
}
