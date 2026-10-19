package compose

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

func TestSessionLandingRawAgentCredentialBeforeAuthLoader(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeMultitenant
	router := hostStatusProductionRouter(cfg, db.New(pool), &services.InstallCapacityService{})
	token := "smithers_agent_" + strings.Repeat("ab", 32)
	for _, repository := range []string{"owner/exists", "unknown/absent"} {
		for _, door := range []struct{ method, path string }{{"POST", "/agent/sessions/session/landing"}, {"PUT", "/landings/1/github/pull"}} {
			request := httptest.NewRequest(door.method, "/api/repos/"+repository+door.path, strings.NewReader(`{}`))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer "+token)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			require.Equal(t, 403, response.Code, response.Body.String())
			var body map[string]any
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
			require.Equal(t, "agent_credential_refused", body["code"])
			require.NotContains(t, response.Body.String(), token)
		}
	}

	for _, path := range []string{"/api/repos/owner/exists/agent/sessions/session", "/api/repos/owner/exists/landings"} {
		request := httptest.NewRequest("POST", path, strings.NewReader(`{}`))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		require.Equal(t, 401, response.Code, response.Body.String())
	}
}

func TestSessionLandingRealGuestCookieHasNoAuthority(t *testing.T) {
	f := newGuestFixture(t, config.AuthModeMultitenant, nil)
	for _, repository := range []string{"sponsor/public", "unknown/absent"} {
		result := f.request("POST", "/api/repos/"+repository+"/agent/sessions/session/landing", map[string]any{}, "")
		require.Equal(t, 401, result.Code, result.Body.String())
		var body map[string]any
		require.NoError(t, json.Unmarshal(result.Body.Bytes(), &body))
		require.Equal(t, "sign_in_required", body["code"])
		require.NotContains(t, result.Body.String(), f.cookie.Value)
	}
	require.Zero(t, f.calls.Load(), "guest cannot reach the model or publication")
}

// Both public doors reach LandingGitHubPullService; credentials must be refused
// before even disclosing whether the repository exists.
func TestHostedPullPublicationCredentials(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := t.Context()
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "publisher", LowerUsername: "publisher"})
	require.NoError(t, err)
	repoID := ciTestRepo(t, pool, owner.ID, "app")
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeMultitenant
	router := hostStatusProductionRouter(cfg, q, &services.InstallCapacityService{})
	landingScopes := strings.Join([]string{string(middleware.ScopeWriteRepository), middleware.RepositoryRestrictionScope(repoID), middleware.LandingWorkspaceScope("box"), middleware.PathRestrictionScopes([]string{"**"})[0]}, ",")
	for _, credential := range []struct {
		name, scopes, userType string
		system                 bool
	}{
		{"box-host", landingScopes, "user", true},
		{"agent-session", landingScopes + "," + middleware.AgentSessionRestrictionScope("session"), "user", true},
		{"run", "write:repository", "user", true},
		{"bot", "write:repository", "bot", false},
		{"service", "write:repository", "service", false},
	} {
		t.Run(credential.name, func(t *testing.T) {
			userID := owner.ID
			if credential.userType != "user" {
				user, err := q.CreateUser(ctx, db.CreateUserParams{Username: credential.name, LowerUsername: credential.name})
				require.NoError(t, err)
				_, err = pool.Exec(ctx, "UPDATE users SET user_type = $1 WHERE id = $2", credential.userType, user.ID)
				require.NoError(t, err)
				userID = user.ID
			}
			tokenSum := sha256.Sum256([]byte(credential.name))
			token := "smithers_" + hex.EncodeToString(tokenSum[:])[:40]
			sum := sha256.Sum256([]byte(token))
			hash := hex.EncodeToString(sum[:])
			_, err := q.CreateAccessToken(ctx, db.CreateAccessTokenParams{UserID: userID, Name: credential.name, TokenHash: hash, TokenLastEight: hash[len(hash)-8:], Scopes: credential.scopes, SystemIssued: credential.system, ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}})
			require.NoError(t, err)
			for _, repository := range []string{"publisher/app", "missing/absent"} {
				for _, door := range []struct{ method, path string }{{"PUT", "/landings/1/github/pull"}, {"POST", "/agent/sessions/session/landing"}} {
					request := httptest.NewRequest(door.method, "/api/repos/"+repository+door.path, strings.NewReader(`{}`))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set("Authorization", "Bearer "+token)
					response := httptest.NewRecorder()
					router.ServeHTTP(response, request)
					require.Equal(t, 403, response.Code, response.Body.String())
					var body map[string]any
					require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
					require.Equal(t, "agent_credential_refused", body["code"], door.path)
					require.NotContains(t, response.Body.String(), token)
				}
			}
		})
	}
}

func TestSessionLandingHostedExactOriginComposed(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	user, err := q.CreateUser(t.Context(), db.CreateUserParams{Username: "browser", LowerUsername: "browser"})
	require.NoError(t, err)
	ciTestRepo(t, pool, user.ID, "app")
	raw := "browser-session"
	hash := sha256.Sum256([]byte(raw))
	_, err = q.CreateAuthSession(t.Context(), db.CreateAuthSessionParams{UserID: user.ID, Username: user.Username, SessionKey: hex.EncodeToString(hash[:]), ExpiresAt: time.Now().Add(time.Hour)})
	require.NoError(t, err)
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeMultitenant
	cfg.Auth.SessionCookieName = "__Host-smithers_session"
	cfg.Server.AllowedOrigins = []string{"https://smithers.test"}
	publication := &hostedPublicationProbe{userID: user.ID}
	router := hostStatusProductionRouter(cfg, q, &services.InstallCapacityService{}, conformanceServices{landing: &routes.LandingHandler{GitHubPull: publication}, agentSession: &routes.AgentSessionHandler{Landing: publication}})
	// The edge fetches the API by its own host and forwards the public host from
	// a non-loopback peer (apps/server/src/edge.ts), so neither Host nor
	// X-Forwarded-Host may decide the outcome: only the configured origins do.
	hosts := []struct{ host, forwarded string }{
		{"smithers.test", ""},
		{"api.internal.example:8080", "smithers.test"},
		{"api.internal.example:8080", "evil.test"},
		{"evil.test", ""},
	}
	for _, h := range hosts {
		for _, origin := range []string{"", "https://evil.test", "https://sub.smithers.test", "http://smithers.test", "https://smithers.test:444", "https://smithers.test"} {
			t.Run(h.host+"/"+h.forwarded+"/"+origin, func(t *testing.T) {
				req := httptest.NewRequest("POST", "https://smithers.test/api/repos/browser/app/agent/sessions/session/landing", strings.NewReader(`{}`))
				req.Host = h.host
				if h.forwarded != "" {
					req.Header.Set("X-Forwarded-Host", h.forwarded)
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Origin", origin)
				req.AddCookie(&http.Cookie{Name: cfg.Auth.SessionCookieName, Value: raw})
				req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "csrf-proof"})
				req.Header.Set("X-CSRF-Token", "csrf-proof")
				rec := httptest.NewRecorder()
				router.ServeHTTP(rec, req)
				if origin == "https://smithers.test" {
					require.Equal(t, 201, rec.Code, rec.Body.String())
				} else {
					require.Equal(t, 403, rec.Code, rec.Body.String())
					var body map[string]any
					require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
					require.Equal(t, "origin", body["code"])
				}
			})
		}
	}
	req := httptest.NewRequest("PUT", "https://smithers.test/api/repos/browser/app/landings/1/github/pull", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://smithers.test")
	req.AddCookie(&http.Cookie{Name: cfg.Auth.SessionCookieName, Value: raw})
	req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "csrf-proof"})
	req.Header.Set("X-CSRF-Token", "csrf-proof")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, 201, rec.Code, rec.Body.String())
}

// Publication is outside this router authorization seam; the service is tested
// independently with real Git and githubfake in internal/services.
type hostedPublicationProbe struct{ userID int64 }

func (p *hostedPublicationProbe) Open(ctx context.Context, actor *db.User, _, _, _ string, _ *int64) (services.SessionLanding, error) {
	if actor == nil || actor.ID != p.userID || middleware.AuthInfoFromContext(ctx).IsAgent() {
		panic("wrong publication actor")
	}
	return services.SessionLanding{PullNumber: 41}, nil
}
func (p *hostedPublicationProbe) OpenLandingGitHubPull(ctx context.Context, actor *db.User, _, _ string, _ int64, _ services.LandingGitHubPullInput) (services.LandingGitHubPull, error) {
	if actor == nil || actor.ID != p.userID || middleware.AuthInfoFromContext(ctx).IsAgent() {
		panic("wrong publication actor")
	}
	return services.LandingGitHubPull{Number: 41, Created: true}, nil
}
