package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGuestConfigurationDefaultsAndOverrides(t *testing.T) {
	clearConfigEnv(t)
	for _, key := range []string{"REPOSITORIES", "PROVIDER", "MODEL", "SPONSOR_ID", "IP_SECRET", "DISABLED", "REQUEST_NANOS", "DAILY_NANOS", "WINDOW_NANOS", "WINDOW_START", "WINDOW_END", "REQUESTS_PER_IP", "OUTPUT_TOKENS"} {
		t.Setenv("SMITHERS_GUEST_"+key, "")
	}
	defaults, err := Load("")
	require.NoError(t, err)
	require.Empty(t, defaults.Guest.Repositories)
	require.Equal(t, int64(100_000_000), defaults.Guest.RequestNanos)
	require.Equal(t, int64(100_000_000_000), defaults.Guest.DailyNanos)
	require.Equal(t, int64(500_000_000_000), defaults.Guest.WindowNanos)
	require.Equal(t, 10, defaults.Guest.RequestsPerIP)
	t.Setenv("SMITHERS_GUEST_REPOSITORIES", "will/effeck,sponsor/public")
	t.Setenv("SMITHERS_GUEST_MODEL", "gpt-6-sol")
	t.Setenv("SMITHERS_GUEST_PROVIDER", "openai")
	t.Setenv("SMITHERS_GUEST_SPONSOR_ID", "42")
	t.Setenv("SMITHERS_GUEST_DISABLED", "true")
	t.Setenv("SMITHERS_GUEST_DAILY_NANOS", "300000000")
	t.Setenv("SMITHERS_GUEST_WINDOW_START", "2026-10-17T00:00:00Z")
	t.Setenv("SMITHERS_GUEST_WINDOW_END", "2026-10-24T00:00:00Z")
	cfg, err := Load("")
	require.NoError(t, err)
	require.Equal(t, []string{"will/effeck", "sponsor/public"}, cfg.Guest.Repositories)
	require.Equal(t, "gpt-6-sol", cfg.Guest.Model)
	require.Equal(t, "openai", cfg.Guest.Provider)
	require.Equal(t, int64(42), cfg.Guest.SponsorID)
	require.True(t, cfg.Guest.Disabled)
	require.Equal(t, int64(300_000_000), cfg.Guest.DailyNanos)
	require.Equal(t, "2026-10-17T00:00:00Z", cfg.Guest.WindowStart)
	require.Equal(t, "2026-10-24T00:00:00Z", cfg.Guest.WindowEnd)
}
