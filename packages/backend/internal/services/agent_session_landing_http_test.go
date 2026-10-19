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
