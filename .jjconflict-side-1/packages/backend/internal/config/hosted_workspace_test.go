package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The hosted staff list (Security item 9, PM d-ytyphi): unset admits nobody,
// a list admits those users, and there is no wildcard. A value that could be
// misread as a wider grant refuses to start rather than guess.
func TestLoad_HostedWorkspaceUserIDs(t *testing.T) {
	clearConfigEnv(t)
	cfg, err := Load("")
	require.NoError(t, err)
	assert.Equal(t, HostedWorkspaceUsers{}, cfg.Sandbox.HostedWorkspaceUsers, "nobody by default")
	assert.False(t, cfg.Sandbox.HostedWorkspaceUsers.Allows(1))

	for value, want := range map[string]HostedWorkspaceUsers{
		"":           {},
		" ":          {},
		"1,60,24":    {UserIDs: []int64{1, 24, 60}},
		" 60 , 1,60": {UserIDs: []int64{1, 60}},
		"1 60":       {UserIDs: []int64{1, 60}},
	} {
		t.Run("valid/"+value, func(t *testing.T) {
			clearConfigEnv(t)
			t.Setenv("SMITHERS_HOSTED_WORKSPACE_USER_IDS", value)
			cfg, err := Load("")
			require.NoError(t, err)
			assert.Equal(t, want, cfg.Sandbox.HostedWorkspaceUsers)
		})
	}
	for _, value := range []string{"*", " * ", "*,1", "1,*", "**", "1*", "abc", "1,abc", "0", "-3", "1;60", "1.5", "0x2", "9223372036854775808"} {
		t.Run("malformed/"+value, func(t *testing.T) {
			clearConfigEnv(t)
			t.Setenv("SMITHERS_HOSTED_WORKSPACE_USER_IDS", value)
			cfg, err := Load("")
			require.ErrorContains(t, err, "sandbox.hosted_workspace_user_ids")
			require.Nil(t, cfg, "a malformed list refuses to start")
		})
	}

	for body, want := range map[string]HostedWorkspaceUsers{
		"sandbox:\n  hosted_workspace_user_ids: [1, 60]\n":  {UserIDs: []int64{1, 60}},
		"sandbox:\n  hosted_workspace_user_ids: 24\n":       {UserIDs: []int64{24}},
		"sandbox:\n  hosted_workspace_user_ids: \"1,60\"\n": {UserIDs: []int64{1, 60}},
	} {
		clearConfigEnv(t)
		file := filepath.Join(t.TempDir(), "config.yaml")
		require.NoError(t, os.WriteFile(file, []byte(body), 0o600))
		cfg, err := Load(file)
		require.NoError(t, err, body)
		assert.Equal(t, want, cfg.Sandbox.HostedWorkspaceUsers, body)
	}
	for _, body := range []string{
		"sandbox:\n  hosted_workspace_user_ids: \"*\"\n",
		"sandbox:\n  hosted_workspace_user_ids: [\"*\"]\n",
		"sandbox:\n  hosted_workspace_user_ids: [1, \"*\"]\n",
	} {
		clearConfigEnv(t)
		file := filepath.Join(t.TempDir(), "config.yaml")
		require.NoError(t, os.WriteFile(file, []byte(body), 0o600))
		cfg, err := Load(file)
		require.ErrorContains(t, err, "sandbox.hosted_workspace_user_ids", body)
		require.Nil(t, cfg, body)
	}
}

func TestHostedWorkspaceUsersAllows(t *testing.T) {
	users := HostedWorkspaceUsers{UserIDs: []int64{1, 24, 60}}
	for id, want := range map[int64]bool{1: true, 24: true, 60: true, 2: false, 0: false, -1: false} {
		assert.Equal(t, want, users.Allows(id), "user %d", id)
	}
	assert.False(t, HostedWorkspaceUsers{}.Allows(1), "the zero value admits nobody")
}
