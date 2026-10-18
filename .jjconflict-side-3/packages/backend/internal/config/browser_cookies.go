package config

import "strings"

const DefaultSessionCookieName = "__Host-smithers_session"
const LocalSessionCookieName = "smithers_local_session"

// BrowserSessionCookieName never accepts the pre-host-isolation cookie name,
// even when an existing deployment still sets the old environment override.
// Only the self-host composition may use its distinct HTTP cookie namespace.
func BrowserSessionCookieName(configured string, localHTTP bool) string {
	if localHTTP {
		return LocalSessionCookieName
	}
	name := strings.TrimSpace(configured)
	if strings.HasPrefix(name, "__Host-") && len(name) > len("__Host-") && !strings.ContainsAny(name, " ;=\r\n\t") {
		return name
	}
	return DefaultSessionCookieName
}
