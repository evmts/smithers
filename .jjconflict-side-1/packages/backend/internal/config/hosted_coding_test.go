package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Hosted coding is open only to the accounts a deployment lists (PM d-6jzbq9,
// d-d97hx9). Unset admits nobody, a list admits those users, and only the
// exact value "*" admits everyone. A value that could be misread as a wider
// grant refuses to start rather than guess what the operator meant.
func TestLoad_HostedCodingUserIDs(t *testing.T) {
	clearConfigEnv(t)
	cfg, err := Load("")
	require.NoError(t, err)
	assert.Equal(t, HostedCodingUsers{}, cfg.Agents.HostedCodingUsers, "nobody by default")
	assert.False(t, cfg.Agents.HostedCodingUsers.Allows(1))

	for value, want := range map[string]HostedCodingUsers{
		"":             {},
		" ":            {},
		"12,34":        {UserIDs: []int64{12, 34}},
		" 34 , 12,34 ": {UserIDs: []int64{12, 34}},
		"12 34":        {UserIDs: []int64{12, 34}},
		"*":            {Everyone: true},
	} {
		t.Run("valid/"+value, func(t *testing.T) {
			clearConfigEnv(t)
			t.Setenv("SMITHERS_HOSTED_CODING_USER_IDS", value)
			cfg, err := Load("")
			require.NoError(t, err)
			assert.Equal(t, want, cfg.Agents.HostedCodingUsers)
		})
	}
	// "*" is the whole value or it is an error: none of these may widen
	// access, and none may silently narrow it either.
	for _, value := range []string{"*,12", "12,*", "*x", "x*", " *", "* ", " * ", "*,*", "**", "abc", "12,abc", "0", "-3", "12;34", "1.5", "0x2", "9223372036854775808"} {
		t.Run("malformed/"+value, func(t *testing.T) {
			clearConfigEnv(t)
			t.Setenv("SMITHERS_HOSTED_CODING_USER_IDS", value)
			cfg, err := Load("")
			require.ErrorContains(t, err, "agents.hosted_coding_user_ids")
			require.Nil(t, cfg, "a malformed list refuses to start")
		})
	}

	for body, want := range map[string]HostedCodingUsers{
		"agents:\n  hosted_coding_user_ids: [12, 34]\n": {UserIDs: []int64{12, 34}},
		"agents:\n  hosted_coding_user_ids: \"*\"\n":    {Everyone: true},
		"agents:\n  hosted_coding_user_ids: 12\n":       {UserIDs: []int64{12}},
		"agents:\n  hosted_coding_user_ids: [\"*\"]\n":  {Everyone: true},
	} {
		clearConfigEnv(t)
		file := filepath.Join(t.TempDir(), "config.yaml")
		require.NoError(t, os.WriteFile(file, []byte(body), 0o600))
		cfg, err := Load(file)
		require.NoError(t, err, body)
		assert.Equal(t, want, cfg.Agents.HostedCodingUsers, "a config file may set them: %s", body)
	}
	for _, body := range []string{
		"agents:\n  hosted_coding_user_ids: [\"*\", 12]\n",
		"agents:\n  hosted_coding_user_ids: [\" * \"]\n",
	} {
		clearConfigEnv(t)
		file := filepath.Join(t.TempDir(), "config.yaml")
		require.NoError(t, os.WriteFile(file, []byte(body), 0o600))
		cfg, err := Load(file)
		require.ErrorContains(t, err, "agents.hosted_coding_user_ids", body)
		require.Nil(t, cfg)
	}
}

func TestHostedCodingUsersAllows(t *testing.T) {
	nobody := HostedCodingUsers{}
	listed := HostedCodingUsers{UserIDs: []int64{12, 34}}
	everyone := HostedCodingUsers{Everyone: true}
	for _, tc := range []struct {
		users  HostedCodingUsers
		userID int64
		want   bool
	}{
		{nobody, 12, false},
		{listed, 12, true},
		{listed, 34, true},
		{listed, 13, false},
		{everyone, 9, true},
		// No authenticated account has a non-positive id; refuse it even
		// when everyone is admitted.
		{everyone, 0, false},
		{listed, -12, false},
	} {
		assert.Equal(t, tc.want, tc.users.Allows(tc.userID), "%+v.Allows(%d)", tc.users, tc.userID)
	}
}
