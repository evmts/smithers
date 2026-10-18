package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/stretchr/testify/require"
)

func TestSessionLandingCredentialFirst(t *testing.T) {
	for _, tc := range []struct {
		name   string
		user   *db.User
		run    bool
		status int
		code   string
	}{
		{"signed out", nil, false, 401, "sign_in_required"},
		{"guest", &db.User{ID: 1, UserType: "guest"}, false, 403, "guest_refused"},
		{"agent account", &db.User{ID: 1, UserType: "bot"}, false, 403, "agent_credential_refused"},
		{"agent credential", &db.User{ID: 1}, true, 403, "agent_credential_refused"},
		{"person", &db.User{ID: 1}, false, 204, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			handler := SessionLandingCredentialFirst(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) }))
			request := httptest.NewRequest("POST", "/api/repos/o/r/agent/sessions/s/landing", nil)
			ctx := middleware.ContextWithAuthInfo(context.Background(), &middleware.AuthInfo{User: tc.user, IsTokenAuth: tc.run, TokenSystemIssued: tc.run})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request.WithContext(ctx))
			require.Equal(t, tc.status, response.Code)
			require.Equal(t, tc.status == 204, called)
			if tc.code != "" {
				var body map[string]any
				require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
				require.Equal(t, tc.code, body["code"])
			}
		})
	}
}
