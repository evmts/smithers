package reposites

// ReservedName includes every checked-in docs redirect and infrastructure door.
// The inventory contract test compares this set with the owning edge config.
func ReservedName(name string) bool {
	switch name {
	case "admin", "agent", "api", "artifacts", "assets", "auth", "build", "canary", "canonical", "capability", "cdn", "chain", "cli", "control", "core", "crypto", "database", "docs", "engine", "engine-store", "errors", "evals", "flow", "flows", "fs", "gateway", "harness", "integrations", "jj", "journal", "kernel", "keys", "mcp", "memory", "migrate", "model", "notifications", "observability", "plan", "plan-store", "platform-browser", "platform-bun", "platform-node", "plugin", "registry", "run-store", "sandbox", "scorers", "signin", "sites", "smithers-patterns", "smithers-sync", "smthrs", "ssh", "status", "std", "step-cache", "testing", "time-travel", "triggers", "www":
		return true
	default:
		return false
	}
}
