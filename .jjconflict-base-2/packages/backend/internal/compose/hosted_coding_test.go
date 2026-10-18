package compose

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/smithersai/smithers/packages/backend/internal/config"
)

// A hosted (multitenant) deployment admits exactly the users its operator
// lists, nobody by default. A single-owner install has one account, the
// machine's owner, so the allowlist does not apply there: an unset list must
// not lock the owner out of coding on their own machine.
func TestHostedCodingUsersFollowsTheIdentityBoundary(t *testing.T) {
	listed := config.HostedCodingUsers{UserIDs: []int64{12}}
	for _, tc := range []struct {
		mode  string
		users config.HostedCodingUsers
		want  config.HostedCodingUsers
	}{
		{config.AuthModeMultitenant, config.HostedCodingUsers{}, config.HostedCodingUsers{}},
		{config.AuthModeMultitenant, listed, listed},
		{config.AuthModeSelfHosted, config.HostedCodingUsers{}, config.HostedCodingUsers{Everyone: true}},
		{config.AuthModeSelfHosted, listed, config.HostedCodingUsers{Everyone: true}},
	} {
		cfg := &config.Config{Auth: config.AuthConfig{Mode: tc.mode}, Agents: config.AgentsConfig{HostedCodingUsers: tc.users}}
		assert.Equal(t, tc.want, hostedCodingUsers(cfg), "%s with %+v", tc.mode, tc.users)
	}
}
