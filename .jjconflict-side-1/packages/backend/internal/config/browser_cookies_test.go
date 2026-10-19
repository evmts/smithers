package config

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestBrowserSessionCookieName(t *testing.T) {
	for _, name := range []string{"", "smithers_session", "custom_session", "__Host-", "__Host-bad;name", "__Host-bad\nname", LocalSessionCookieName} {
		require.Equal(t, DefaultSessionCookieName, BrowserSessionCookieName(name, false), name)
		require.Equal(t, LocalSessionCookieName, BrowserSessionCookieName(name, true), name)
	}
	require.Equal(t, "__Host-custom", BrowserSessionCookieName(" __Host-custom ", false))
}
