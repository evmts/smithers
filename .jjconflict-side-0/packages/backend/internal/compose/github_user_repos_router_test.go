package compose

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

type githubUserReposRouterService struct {
	calls           atomic.Int32
	installURL      string
	installURLCalls atomic.Int32
}

func (s *githubUserReposRouterService) GitHubAppInstallURL(context.Context) (string, error) {
	s.installURLCalls.Add(1)
	return s.installURL, nil
}

func (s *githubUserReposRouterService) ListAuthenticatedUserGitHubRepos(context.Context, int64, url.Values) (services.GitHubRepoListResult, error) {
	s.calls.Add(1)
	return services.GitHubRepoListResult{Repos: []services.GitHubRepoListItem{}}, nil
}

func (s *githubUserReposRouterService) GetAuthenticatedUserGitHubRepo(context.Context, int64, string, string) (services.GitHubRepoMetadataResult, error) {
	s.calls.Add(1)
	return services.GitHubRepoMetadataResult{Body: []byte(`{}`)}, nil
}

func (s *githubUserReposRouterService) ListAuthenticatedUserGitHubRepoMetadata(context.Context, int64, string, string, string, url.Values) (services.GitHubRepoMetadataResult, error) {
	s.calls.Add(1)
	return services.GitHubRepoMetadataResult{Body: []byte(`[]`)}, nil
}

func (s *githubUserReposRouterService) ListAuthenticatedUserGitHubIssueComments(context.Context, int64, string, string, int64, url.Values) (services.GitHubRepoMetadataResult, error) {
	s.calls.Add(1)
	return services.GitHubRepoMetadataResult{Body: []byte(`[]`)}, nil
}

func (s *githubUserReposRouterService) GetAuthenticatedUserGitHubPullDiff(context.Context, int64, string, string, int64) (services.GitHubPullDiffResult, error) {
	s.calls.Add(1)
	return services.GitHubPullDiffResult{Body: []byte("diff --git a/x b/x\n")}, nil
}

func (s *githubUserReposRouterService) ListAuthenticatedUserGitHubPullCommits(context.Context, int64, string, string, int64, url.Values) (services.GitHubRepoMetadataResult, error) {
	s.calls.Add(1)
	return services.GitHubRepoMetadataResult{Body: []byte(`[]`)}, nil
}

func (s *githubUserReposRouterService) GetAuthenticatedUserGitHubCommitCheckRuns(context.Context, int64, string, string, string, url.Values) (services.GitHubRepoMetadataResult, error) {
	s.calls.Add(1)
	return services.GitHubRepoMetadataResult{Body: []byte(`{"total_count":0,"check_runs":[]}`)}, nil
}

func (s *githubUserReposRouterService) GetAuthenticatedUserGitHubPull(context.Context, int64, string, string, int64) (services.GitHubRepoMetadataResult, error) {
	s.calls.Add(1)
	return services.GitHubRepoMetadataResult{Body: []byte(`{"number":7}`)}, nil
}

func (s *githubUserReposRouterService) DiagnoseGitHubAccess(context.Context, int64, string, string, string) (services.GitHubAccessDiagnosis, error) {
	s.calls.Add(1)
	return services.GitHubAccessDiagnosis{Verdict: services.GitHubAccessVerdictOK, Surface: "issues"}, nil
}

func (s *githubUserReposRouterService) RequestAuthenticatedUserGitHubPullReview(context.Context, int64, string, string, int64, services.GitHubPullReviewInput) (jobs.RequestReceipt, error) {
	s.calls.Add(1)
	return jobs.RequestReceipt{OperationID: "op-review", RequestID: "key", Kind: "requested", State: jobs.StateAccepted}, nil
}

func (s *githubUserReposRouterService) GitHubPullReviewStatusOf(context.Context, int64, string) (services.GitHubPullReviewStatus, error) {
	s.calls.Add(1)
	return services.GitHubPullReviewStatus{OperationID: "op-review", State: "completed", Verified: true}, nil
}

func githubUserReposSecurityRouter(service routes.GitHubUserReposRouteService) http.Handler {
	return buildRouter(
		testConfigAllFlagsOn(),
		nil, // queries
		nil, // pool
		&routes.RepoHandler{},
		nil, // mirrorSyncHandler
		&routes.AuthHandler{},
		&routes.UserHandler{},
		&routes.SSHKeyHandler{},
		nil, // deployKeyHandler
		&routes.LabelHandler{},

		&routes.OrgHandler{},
		&routes.LandingHandler{},
		nil, // buildCacheHandler
		nil, // stackHandler
		&routes.SearchHandler{Service: &mockRouterSearchService{}},
		&routes.IssueHandler{},
		nil, // wikiService
		&routes.GitSmartHandler{Service: &mockRouterGitService{}},
		nil, // notificationHandler
		nil, // adminUserHandler
		nil, // adminOrgHandler
		nil, // adminSystemMetricsHandler
		nil, // adminGitHubAppHandler
		nil, // adminAuditHandler
		nil, // webhookHandler
		nil, // secretHandler
		nil, // providerConnectionHandler
		nil, // variableHandler
		nil, // billingHandler
		nil, // protectedBookmarkHandler
		nil, // commitStatusHandler
		nil, // lfsHandler
		nil, // jjVCSHandler
		nil, // agentInternalHandler
		nil, // agentSessionHandler
		nil, // agentSessionStreamHandler
		nil, // approvalsHandler
		nil, // canaryReportHandler
		nil, // workflowHandler
		nil, // workflowCacheHandler
		nil, // workflowArtifactHandler
		nil, // issueEventHandler
		&routes.WorkspaceHandler{},
		nil, // workspaceInternalHandler
		nil, // repositoryJobHandler
		nil, // gitHubProxyHandler
		nil, // gitHubRepoListHandler
		&routes.GitHubUserReposHandler{Service: service},
		nil, // gitHubSyncedReposHandler
		nil, // gitHubImportHandler
		nil, // workspaceTerminalHandler
		nil, // telemetryHandler
		nil, // featureFlagHandler
		nil, // oauth2Handler
		nil, // gitHubWebhookHandler
		nil, // smithersMetrics
	)
}

func githubUserReposRestrictedRequest(path string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rawScopes := string(middleware.ScopeReadRepository) + "," + middleware.RepositoryRestrictionScope(99)
	return req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
		User:        &db.User{ID: 7, Username: "octo", LowerUsername: "octo"},
		RawScopes:   rawScopes,
		Scopes:      middleware.ParseTokenScopes(rawScopes),
		IsTokenAuth: true,
		TokenSource: middleware.TokenSourcePersonalAccessToken,
	}))
}

func TestServerRouter_GitHubUserRepoRoutesRejectRestrictedPATBeforeService(t *testing.T) {
	service := &githubUserReposRouterService{}
	router := githubUserReposSecurityRouter(service)
	paths := []string{
		"/api/user/github-repos",
		"/api/user/github-repos/smithersai/smithers",
		"/api/user/github-repos/smithersai/smithers/issues?state=open&per_page=100&page=1",
		"/api/user/github-repos/smithersai/smithers/pulls?state=open&per_page=100&page=1",
		"/api/user/github-repos/smithersai/smithers/pulls/7",
		"/api/user/github-repos/smithersai/smithers/issues/7/comments?per_page=100",
		"/api/user/github-repos/smithersai/smithers/pulls/7/diff",
		"/api/user/github-repos/smithersai/smithers/pulls/7/commits",
		"/api/user/github-repos/smithersai/smithers/commits/0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6/check-runs",
		"/api/user/github-app/installations",
		"/api/user/github-app/installations/42",
	}

	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, githubUserReposRestrictedRequest(path))
			require.Equal(t, http.StatusForbidden, rec.Code)
			assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
		})
	}
	assert.Equal(t, int32(0), service.calls.Load(), "router must reject before any user-GitHub service method")
}

func TestServerRouter_GitHubRepoObjectRouteAllowsSessionAndCallsService(t *testing.T) {
	service := &githubUserReposRouterService{}
	router := githubUserReposSecurityRouter(service)
	req := httptest.NewRequest(http.MethodGet, "/api/user/github-repos/smithersai/smithers", nil)
	req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
		User:        &db.User{ID: 7, Username: "octo", LowerUsername: "octo"},
		IsTokenAuth: false,
	}))
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{}`, rec.Body.String())
	assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
	assert.Equal(t, int32(1), service.calls.Load())
}

func TestServerRouter_GitHubAppInstallationsServesSessionUser(t *testing.T) {
	service := &githubUserReposRouterService{installURL: "https://github.com/apps/team-install/installations/new"}
	router := githubUserReposSecurityRouter(service)
	for _, path := range []string{"/api/user/github-app/installations", "/api/user/github-app/installations/42"} {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
				User:        &db.User{ID: 7, Username: "octo", LowerUsername: "octo"},
				IsTokenAuth: false,
			}))
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			require.Equal(t, http.StatusOK, rec.Code)
			assert.JSONEq(t, `{"repos":[],"install_url":"https://github.com/apps/team-install/installations/new"}`, rec.Body.String())
			assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
		})
	}
	unauthenticated := httptest.NewRecorder()
	router.ServeHTTP(unauthenticated, httptest.NewRequest(http.MethodGet, "/api/user/github-app/installations", nil))
	assert.Equal(t, http.StatusUnauthorized, unauthenticated.Code)
	assert.Equal(t, int32(2), service.installURLCalls.Load(), "signed-out reads must never load credential metadata")
}

/*
 * The review write (#4038) is the one non-GET among these surfaces, so it
 * carries the write scope — and a read-only or repository-restricted
 * credential must be refused before any GitHub credential is loaded.
 */
func TestServerRouter_GitHubPullReviewRouteRefusesBeforeService(t *testing.T) {
	const path = "/api/user/github-repos/smithersai/smithers/pulls/7/reviews"
	body := `{"event":"APPROVE","body":"","commit_id":"0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6"}`
	for name, scopes := range map[string]string{
		"read-only":             string(middleware.ScopeReadRepository),
		"repository-restricted": string(middleware.ScopeWriteRepository) + "," + middleware.RepositoryRestrictionScope(99),
	} {
		t.Run(name, func(t *testing.T) {
			service := &githubUserReposRouterService{}
			router := githubUserReposSecurityRouter(service)
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
				User:        &db.User{ID: 7, Username: "octo", LowerUsername: "octo"},
				RawScopes:   scopes,
				Scopes:      middleware.ParseTokenScopes(scopes),
				IsTokenAuth: true,
				TokenSource: middleware.TokenSourcePersonalAccessToken,
			}))
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			require.Equal(t, http.StatusForbidden, rec.Code)
			assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
			assert.Equal(t, int32(0), service.calls.Load(), "the router must refuse before the review service")
		})
	}

	t.Run("signed-out", func(t *testing.T) {
		service := &githubUserReposRouterService{}
		router := githubUserReposSecurityRouter(service)
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Equal(t, int32(0), service.calls.Load())
	})

	// A session write still answers to the browser write gate, like every
	// other non-GET door.
	t.Run("session without a csrf token", func(t *testing.T) {
		service := &githubUserReposRouterService{}
		router := githubUserReposSecurityRouter(service)
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
			User: &db.User{ID: 7, Username: "octo", LowerUsername: "octo"}, IsTokenAuth: false,
		}))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusForbidden, rec.Code)
		assert.Equal(t, int32(0), service.calls.Load())
	})

	t.Run("session person reaches the service", func(t *testing.T) {
		service := &githubUserReposRouterService{}
		router := githubUserReposSecurityRouter(service)
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "review-csrf"})
		req.Header.Set("X-CSRF-Token", "review-csrf")
		req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
			User:        &db.User{ID: 7, Username: "octo", LowerUsername: "octo"},
			IsTokenAuth: false,
		}))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		// A durable admission, not a review: 202 and one operation.
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
		assert.Contains(t, rec.Body.String(), `"operationId":"op-review"`)
		assert.Contains(t, rec.Body.String(), `"state":"accepted"`)
		assert.Equal(t, int32(1), service.calls.Load())
	})

	// Reading what became of one is a READ of the caller's own account
	// surface: it takes the read stack, and a write-less read-only credential
	// may ask (which is what makes the lost-acknowledgment path a read).
	t.Run("the request door is a read", func(t *testing.T) {
		service := &githubUserReposRouterService{}
		router := githubUserReposSecurityRouter(service)
		const scopes = string(middleware.ScopeReadRepository)
		req := httptest.NewRequest(http.MethodGet, "/api/user/github-pull-review-requests/10000000-0000-4000-8000-000000000001", nil)
		req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
			User:        &db.User{ID: 7, Username: "octo", LowerUsername: "octo"},
			RawScopes:   scopes,
			Scopes:      middleware.ParseTokenScopes(scopes),
			IsTokenAuth: true,
			TokenSource: middleware.TokenSourcePersonalAccessToken,
		}))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
		assert.Equal(t, int32(1), service.calls.Load())
	})

	// And a repository-restricted credential is refused it, like every other
	// surface on this family.
	t.Run("the request door refuses a repository-restricted credential", func(t *testing.T) {
		service := &githubUserReposRouterService{}
		router := githubUserReposSecurityRouter(service)
		scopes := string(middleware.ScopeReadRepository) + "," + middleware.RepositoryRestrictionScope(99)
		req := httptest.NewRequest(http.MethodGet, "/api/user/github-pull-review-requests/10000000-0000-4000-8000-000000000001", nil)
		req = req.WithContext(middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
			User:        &db.User{ID: 7, Username: "octo", LowerUsername: "octo"},
			RawScopes:   scopes,
			Scopes:      middleware.ParseTokenScopes(scopes),
			IsTokenAuth: true,
			TokenSource: middleware.TokenSourcePersonalAccessToken,
		}))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusForbidden, rec.Code)
		assert.Equal(t, int32(0), service.calls.Load())
	})
}
