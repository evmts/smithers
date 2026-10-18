package services

import (
	"context"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/stretchr/testify/require"
)

func TestSessionLandingRefusesNonPeopleBeforeReading(t *testing.T) {
	s := &AgentSessionLandingService{}
	for _, tc := range []struct {
		name  string
		user  *db.User
		agent bool
		code  pkgerrors.Code
	}{
		{"signed out", nil, false, pkgerrors.CodeSignInRequired},
		{"guest", &db.User{ID: 1, UserType: "guest"}, false, pkgerrors.CodeGuestRefused},
		{"bot", &db.User{ID: 1, UserType: "bot"}, false, pkgerrors.CodeAgentCredentialRefused},
		{"run", &db.User{ID: 1}, true, pkgerrors.CodeAgentCredentialRefused},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			if tc.agent {
				ctx = middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: tc.user, IsTokenAuth: true, TokenSystemIssued: true})
			}
			_, err := s.Open(ctx, tc.user, "owner", "repo", "session", nil)
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, tc.code, api.Code)
		})
	}
}
