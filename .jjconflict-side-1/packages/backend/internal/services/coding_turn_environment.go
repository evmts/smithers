package services

import "regexp"

// codingTestEnvUnavailable is the reason code for a test the agent's sandbox
// could not run: it has no network and installs nothing, so a test that
// needs either fails for the sandbox, not for the change (CEO a-6buk5m).
const codingTestEnvUnavailable = "test_env_unavailable"

var codingTestEnvironmentFailures = []struct {
	pattern *regexp.Regexp
	reason  string
}{
	// A bare package name, never a relative or absolute path: a missing file
	// of the repository's own is the change's failure.
	{regexp.MustCompile(`Cannot find package '[^'./][^']*' imported from|Cannot find module '[^'./][^']*'|ModuleNotFoundError: No module named '[^'.]+'|no required module provides package|missing go\.sum entry|cannot find module providing package`),
		"dependencies not installed in the sandbox"},
	// Name resolution and routing only; a refused connection to a local
	// server is the test's own failure.
	{regexp.MustCompile(`\b(?:ENOTFOUND|EAI_AGAIN|ENETUNREACH|EADDRNOTAVAIL)\b|getaddrinfo|Could not resolve host|Temporary failure in name resolution|Network is unreachable`),
		"the test needs network access, which the sandbox doesn't have"},
	// The sandbox's in-memory home is bounded.
	{regexp.MustCompile(`\bENOSPC\b|No space left on device`),
		"the sandbox ran out of space for the test"},
	{regexp.MustCompile(`(?m)node_modules/\.bin/\S+: (?:not found|No such file or directory)|^(?:/bin/)?(?:sh|bash)(?:: line \d+)?: (?:\d+: )?[^:\s]+: (?:command )?not found\s*$`),
		"the test command isn't installed in the sandbox"},
}

// classifyCodingTestEnvironment says whether a test run failed because the
// sandbox lacks a dependency, the network or the command, and if so why in
// a phrase that completes "Tests not run: ". It is conservative: a passing run is never an environment
// failure, and output it does not recognize is the change's failure.
func classifyCodingTestEnvironment(exitCode int, output string) (string, bool) {
	if exitCode == 0 {
		return "", false
	}
	output = ansiEscape.ReplaceAllString(output, "")
	for _, failure := range codingTestEnvironmentFailures {
		if failure.pattern.MatchString(output) {
			return failure.reason, true
		}
	}
	if exitCode == 127 {
		return "the test command isn't installed in the sandbox", true
	}
	return "", false
}
