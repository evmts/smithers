package routes

import "strings"

// OAuth's browser binding is a credential too: a Domain-injected verifier can
// complete an attacker's otherwise valid OAuth state in another browser.
func isolatedAuthCookieName(name string, secure bool) string {
	if secure {
		return name
	}
	return strings.Replace(name, "__Host-smithers_", "smithers_local_", 1)
}
