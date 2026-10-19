package compose

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

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
		request := httptest.NewRequest("POST", "/api/repos/"+repository+"/agent/sessions/session/landing", strings.NewReader(`{}`))
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
