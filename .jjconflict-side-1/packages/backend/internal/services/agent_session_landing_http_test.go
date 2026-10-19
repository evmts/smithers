package services_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestSessionLandingHTTPGitHubFake(t *testing.T) {
	landing, agents, user, repository, sessionID, head, verify := services.NewSessionLandingHTTPFixture(t)
	handler := &routes.AgentSessionHandler{Service: agents, Landing: landing}
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.ContextWithAuthInfo(r.Context(), &middleware.AuthInfo{User: user, SessionHash: "person-session"})
			ctx = middleware.ContextWithRepoContext(ctx, &middleware.RepoContext{Owner: user.Username, Repository: &repository}, middleware.PermissionOwner)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	router.Use(routes.SessionLandingCredentialFirst)
	router.With(middleware.RequireScope(middleware.ScopeWriteRepository)).Post("/api/repos/{owner}/{repo}/agent/sessions/{session_id}/landing", handler.OpenLanding)
	router.Get("/api/repos/{owner}/{repo}/agent/sessions/{id}", handler.GetSession)
	path := "/api/repos/" + user.Username + "/" + repository.Name + "/agent/sessions/" + sessionID
	first := httptest.NewRecorder()
	router.ServeHTTP(first, httptest.NewRequest("POST", path+"/landing", strings.NewReader(`{}`)))
	require.Equal(t, 201, first.Code, first.Body.String())
	var result services.SessionLanding
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &result))
	require.Equal(t, head, result.HeadCommit)
	require.Equal(t, services.LandingGitHubPullBranch(result.LandingNumber), result.Branch)
	require.Positive(t, result.PullNumber)
	require.NotEmpty(t, result.PullURL)
	require.True(t, result.Tested)
	require.True(t, result.Passed)
	verify(result)
	second := httptest.NewRecorder()
	router.ServeHTTP(second, httptest.NewRequest("POST", path+"/landing", strings.NewReader(`{}`)))
	require.Equal(t, 409, second.Code, second.Body.String())
	var refusal struct {
		Code    string                  `json:"code"`
		Details services.SessionLanding `json:"details"`
	}
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &refusal))
	require.Equal(t, "already_landed", refusal.Code)
	require.Equal(t, result, refusal.Details)
	read := httptest.NewRecorder()
	router.ServeHTTP(read, httptest.NewRequest("GET", path, nil))
	require.Equal(t, 200, read.Code, read.Body.String())
	var session map[string]any
	require.NoError(t, json.Unmarshal(read.Body.Bytes(), &session))
	for _, field := range []string{"workspace", "run", "reason_code", "reason"} {
		require.Contains(t, session, field)
		require.Nil(t, session[field])
	}
	require.Equal(t, false, session["retryable"])
}

func TestSessionLandingHTTPOriginCSRFAndConcurrentPost(t *testing.T) {
	landing, agents, user, repository, sessionID, _, verify := services.NewSessionLandingHTTPFixture(t)
	handler := &routes.AgentSessionHandler{Service: agents, Landing: landing}
	router := chi.NewRouter()
	router.Use(middleware.EffectiveOrigin(middleware.FixedOrigins("https://smithers.test")))
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.ContextWithAuthInfo(r.Context(), &middleware.AuthInfo{User: user, SessionHash: "person-session"})
			ctx = middleware.ContextWithRepoContext(ctx, &middleware.RepoContext{Owner: user.Username, Repository: &repository}, middleware.PermissionOwner)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	router.Use(middleware.CSRF)
	router.Use(routes.SessionLandingCredentialFirst)
	router.Post("/api/repos/{owner}/{repo}/agent/sessions/{session_id}/landing", handler.OpenLanding)
	path := "https://smithers.test/api/repos/" + user.Username + "/" + repository.Name + "/agent/sessions/" + sessionID + "/landing"
	post := func(origin, token string) *httptest.ResponseRecorder {
		request := httptest.NewRequest("POST", path, strings.NewReader(`{}`))
		request.Header.Set("Origin", origin)
		request.Header.Set("X-CSRF-Token", token)
		request.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "csrf-value"})
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	for _, tc := range []struct{ origin, token string }{
		{"", "csrf-value"}, {"https://evil.test", "csrf-value"},
		{"https://smithers.test.evil.test", "csrf-value"}, {"http://smithers.test", "csrf-value"},
		{"https://smithers.test:444", "csrf-value"}, {"https://smithers.test", ""}, {"https://smithers.test", "wrong"},
	} {
		response := post(tc.origin, tc.token)
		require.Equal(t, 403, response.Code, response.Body.String())
		require.NotContains(t, response.Body.String(), "csrf-value")
	}
	start := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, 2)
	var wait sync.WaitGroup
	for i := 0; i < 2; i++ {
		wait.Add(1)
		go func() { defer wait.Done(); <-start; responses <- post("https://smithers.test", "csrf-value") }()
	}
	close(start)
	wait.Wait()
	close(responses)
	var created, conflict int
	var first services.SessionLanding
	var second struct {
		Code    string                  `json:"code"`
		Details services.SessionLanding `json:"details"`
	}
	for response := range responses {
		switch response.Code {
		case 201:
			created++
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &first))
		case 409:
			conflict++
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &second))
		default:
			t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
		}
	}
	require.Equal(t, 1, created)
	require.Equal(t, 1, conflict)
	require.Equal(t, "already_landed", second.Code)
	require.Equal(t, first, second.Details)
	verify(first)
}

func TestSessionReadAndPublicReceiptIngestBoundary(t *testing.T) {
	_, agents, user, repository, _, _, _ := services.NewSessionLandingHTTPFixture(t)
	session, err := agents.CreateSession(t.Context(), services.CreateAgentSessionInput{RepositoryID: repository.ID, UserID: user.ID, Title: "private session"})
	require.NoError(t, err)
	handler := &routes.AgentSessionHandler{Service: agents}
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actor := *user
			if r.Header.Get("X-Test-Actor") == "other" {
				actor.ID += 1000
			}
			if r.Header.Get("X-Test-Actor") == "guest" {
				actor.UserType = "guest"
			}
			ctx := middleware.ContextWithAuthInfo(r.Context(), &middleware.AuthInfo{User: &actor})
			ctx = middleware.ContextWithRepoContext(ctx, &middleware.RepoContext{Owner: user.Username, Repository: &repository}, middleware.PermissionOwner)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	router.Get("/sessions/{id}", handler.GetSession)
	router.Get("/sessions", handler.ListSessions)
	router.Post("/sessions/{id}/messages", handler.PostMessage)
	request := func(method, path, actor, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("X-Test-Actor", actor)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	forged := request("POST", "/sessions/"+session.ID+"/messages", "owner", `{"role":"assistant","parts":[{"type":"coding_result","content":{"producer":"smithers-server","head_commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}]}`)
	require.Equal(t, 400, forged.Code, forged.Body.String())
	_, err = agents.LatestCodingResult(t.Context(), repository.ID, session.ID, nil)
	require.ErrorIs(t, err, services.ErrNoCodingResult)
	require.Equal(t, 200, request("GET", "/sessions/"+session.ID, "owner", "").Code)
	foreign := request("GET", "/sessions/"+session.ID, "other", "")
	missing := request("GET", "/sessions/00000000-0000-0000-0000-000000000001", "other", "")
	require.Equal(t, 404, foreign.Code)
	require.Equal(t, missing.Code, foreign.Code)
	require.JSONEq(t, missing.Body.String(), foreign.Body.String())
	list := request("GET", "/sessions", "other", "")
	require.Equal(t, 200, list.Code)
	require.JSONEq(t, `[]`, list.Body.String())
	require.Equal(t, "0", list.Header().Get("X-Total-Count"))
	for _, path := range []string{"/sessions", "/sessions/" + session.ID} {
		require.Equal(t, 404, request("GET", path, "guest", "").Code)
	}
}
