package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plue#839: production ran both session bounds at 0. A statement is bounded
// at 15 minutes. An idle open transaction is bounded at a day, because a
// workspace provisioning claim holds its transaction idle while its work
// boots a guest and clones the repository; see
// services.TestIdleTransactionTimeoutOutlastsTheProvisioningClaim.
func TestLoad_DatabaseSessionTimeoutDefaults(t *testing.T) {
	clearConfigEnv(t)
	cfg, err := Load("")
	require.NoError(t, err)
	assert.Equal(t, 900, cfg.Database.StatementTimeout)
	assert.Equal(t, 86400, cfg.Database.IdleInTransactionSessionTimeout)
	assert.Equal(t, DefaultDatabaseIdleInTransactionSessionTimeoutSecs, cfg.Database.IdleInTransactionSessionTimeout)
}

func TestLoad_DatabaseSessionTimeoutsFromEnvironment(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("SMITHERS_DATABASE_STATEMENT_TIMEOUT_SECS", "120")
	t.Setenv("SMITHERS_DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_SECS", "300")
	cfg, err := Load("")
	require.NoError(t, err)
	assert.Equal(t, 120, cfg.Database.StatementTimeout)
	assert.Equal(t, 300, cfg.Database.IdleInTransactionSessionTimeout)
}

// A value that is not a whole number of seconds refuses to load, so a typo
// never starts a pool with an unbounded session.
func TestLoad_DatabaseSessionTimeoutsRefuseMalformedValues(t *testing.T) {
	for _, env := range []string{"SMITHERS_DATABASE_STATEMENT_TIMEOUT_SECS", "SMITHERS_DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_SECS"} {
		for _, value := range []string{"15m", "abc", "1.5"} {
			t.Run(env+"="+value, func(t *testing.T) {
				clearConfigEnv(t)
				t.Setenv(env, value)
				_, err := Load("")
				require.Error(t, err)
			})
		}
	}
}

// Zero or negative is refused at startup: zero would disable the bound.
func TestValidateServerStartup_DatabaseSessionTimeoutsMustBePositive(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Config)
		want   string
	}{
		{"zero statement", func(c *Config) { c.Database.StatementTimeout = 0 }, "database.statement_timeout_secs must be > 0"},
		{"negative statement", func(c *Config) { c.Database.StatementTimeout = -1 }, "database.statement_timeout_secs must be > 0"},
		{"zero idle", func(c *Config) { c.Database.IdleInTransactionSessionTimeout = 0 }, "database.idle_in_transaction_session_timeout_secs must be > 0"},
		{"negative idle", func(c *Config) { c.Database.IdleInTransactionSessionTimeout = -5 }, "database.idle_in_transaction_session_timeout_secs must be > 0"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := validStartupConfig()
			require.NoError(t, ValidateServerStartup(cfg))
			tc.mutate(cfg)
			err := ValidateServerStartup(cfg)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.want)
		})
	}
}
