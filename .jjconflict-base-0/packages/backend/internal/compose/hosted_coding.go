package compose

import "github.com/smithersai/smithers/packages/backend/internal/config"

// hostedCodingUsers is who the agent service lets run hosted coding turns. A
// multitenant deployment admits exactly the users agents.hosted_coding_user_ids
// lists, nobody by default. A single-owner install has one account, the
// machine's owner, so the allowlist does not apply: an unset list must not lock
// the owner out of coding on their own machine.
func hostedCodingUsers(cfg *config.Config) config.HostedCodingUsers {
	if config.IsSingleOwner(cfg.Auth) {
		return config.HostedCodingUsers{Everyone: true}
	}
	return cfg.Agents.HostedCodingUsers
}
