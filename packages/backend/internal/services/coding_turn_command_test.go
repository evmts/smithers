package services

import (
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func codingTestTree(files map[string]string) codingTestFile {
	return func(path string) (string, bool, error) {
		text, ok := files[path]
		return text, ok, nil
	}
}

// The server resolves the test exactly as the coding flow detects it
// (check-detection.ts and project-config.ts), from the repository alone.
func TestResolveCodingTestCommand(t *testing.T) {
	for _, tc := range []struct {
		name   string
		files  map[string]string
		argv   []string
		reason string
	}{
		{"declared detected test wins", map[string]string{
			codingProjectPath: `{"detected":[{"flow":"checks/lint","argv":["eslint","."],"timeoutMs":1},{"flow":"checks/test","argv":["node","--test"],"timeoutMs":1}]}`,
			"package.json":    `{"scripts":{"test":"vitest"}}`,
		}, []string{"node", "--test"}, ""},
		{"declared checks without a test command", map[string]string{
			codingProjectPath: `{"checks":[{"id":"review","target":".","flow":"review/x","tier":"slow","required":true}]}`,
			"package.json":    `{"scripts":{"test":"vitest"}}`,
		}, nil, "declares checks"},
		{"invalid project file", map[string]string{codingProjectPath: `[`}, nil, "not a JSON object"},
		{"project without checks falls back to detection", map[string]string{codingProjectPath: `{"wiki":false}`, "package.json": `{"scripts":{"test":"vitest"}}`}, []string{"npm", "run", "test"}, ""},
		{"npm", map[string]string{"package.json": `{"scripts":{"test":"node --test"}}`}, []string{"npm", "run", "test"}, ""},
		{"pnpm", map[string]string{"package.json": `{"scripts":{"test":"x"}}`, "pnpm-lock.yaml": "", "yarn.lock": ""}, []string{"pnpm", "run", "test"}, ""},
		{"yarn", map[string]string{"package.json": `{"scripts":{"test":"x"}}`, "yarn.lock": ""}, []string{"yarn", "run", "test"}, ""},
		{"bun lockb", map[string]string{"package.json": `{"scripts":{"test":"x"}}`, "bun.lockb": ""}, []string{"bun", "run", "test"}, ""},
		{"bun lock", map[string]string{"package.json": `{"scripts":{"test":"x"}}`, "bun.lock": ""}, []string{"bun", "run", "test"}, ""},
		{"npm init placeholder is no test", map[string]string{"package.json": `{"scripts":{"test":"echo \"Error: no test specified\" && exit 1"}}`, "Makefile": "test:\n\tgo test\n"}, []string{"make", "test"}, ""},
		{"non-string script is no test", map[string]string{"package.json": `{"scripts":{"test":1}}`, "go.mod": "module x"}, []string{"go", "test", "./..."}, ""},
		{"makefile", map[string]string{"Makefile": "build:\n\ttrue\ntest :\n\ttrue\n"}, []string{"make", "test"}, ""},
		{"cargo", map[string]string{"Cargo.toml": "", "go.mod": ""}, []string{"cargo", "test", "--quiet"}, ""},
		{"go", map[string]string{"go.mod": "", "pyproject.toml": ""}, []string{"go", "test", "./..."}, ""},
		{"pytest from setup.py", map[string]string{"setup.py": ""}, []string{"python3", "-m", "pytest", "-q"}, ""},
		{"pytest from pytest.ini", map[string]string{"pytest.ini": ""}, []string{"python3", "-m", "pytest", "-q"}, ""},
		{"nothing declared", map[string]string{"README.md": "hi", "package.json": `{"scripts":{"build":"tsc"}}`}, nil, "declares no test"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			argv, reason, err := resolveCodingTestCommand(codingTestTree(tc.files))
			require.NoError(t, err)
			require.Equal(t, tc.argv, argv)
			if tc.reason == "" {
				require.Empty(t, reason)
			} else {
				require.Contains(t, reason, tc.reason)
			}
		})
	}
	down := errors.New("repo host down")
	for _, failing := range []string{codingProjectPath, "package.json", "pnpm-lock.yaml", "Makefile", "go.mod"} {
		_, _, err := resolveCodingTestCommand(func(path string) (string, bool, error) {
			if path == failing {
				return "", false, down
			}
			if path == "package.json" && failing == "pnpm-lock.yaml" {
				return `{"scripts":{"test":"x"}}`, true, nil
			}
			return "", false, nil
		})
		require.ErrorIs(t, err, down, failing)
	}
}

// The command shown is the argv the server ran, quoted as checks.ts quotes it.
func TestCodingCommandLine(t *testing.T) {
	require.Equal(t, "npm run test", codingCommandLine([]string{"npm", "run", "test"}))
	require.Equal(t, `go test ./... "-run=A B" "<&>" "a\"b"`, codingCommandLine([]string{"go", "test", "./...", "-run=A B", "<&>", `a"b`}))
	require.Equal(t, `node --test "" "\n"`, codingCommandLine([]string{"node", "--test", "", "\n"}))
}

func TestParseCodingTestsRun(t *testing.T) {
	count := func(n int) *int { return &n }
	for _, tc := range []struct {
		name   string
		output string
		want   *int
	}{
		{"node spec", "✔ a (1ms)\nℹ tests 3\nℹ suites 0\nℹ pass 2\nℹ fail 1\n", count(3)},
		{"node tap", "TAP version 13\nok 1 - a\n1..1\n# tests 1\n# pass 1\n", count(1)},
		{"node zero", "ℹ tests 0\nℹ pass 0\n", count(0)},
		{"node colored", "\x1b[34mℹ tests 4\x1b[39m\n", count(4)},
		{"vitest total", " Test Files  2 passed (2)\n      Tests  1 failed | 4 passed (5)\n", count(5)},
		{"vitest without total", "      Tests  2 passed\n", count(2)},
		{"bun ran", " 3 pass\n 1 fail\nRan 4 tests across 2 files. [9.00ms]\n", count(4)},
		{"bun counts", " 3 pass\n 1 fail\n", count(4)},
		{"pytest quiet", "..F                                [100%]\n1 failed, 2 passed in 0.05s\n", count(3)},
		{"pytest banner", "==== 5 passed, 1 skipped, 2 warnings in 0.10s ====\n", count(5)},
		{"pytest none", "==== no tests ran in 0.01s ====\n", count(0)},
		{"go packages", "ok  \texample.com/a\t0.012s\nFAIL\texample.com/b\t0.020s\nok  \texample.com/c\t(cached)\n?   \texample.com/d\t[no test files]\n", count(3)},
		{"go no tests to run", "ok  \texample.com/a\t0.012s [no tests to run]\n", count(0)},
		{"go no test files", "?   \texample.com/d\t[no test files]\n", count(0)},
		{"tap ok lines are not go", "ok 1 - a\nok 2 - b\n", nil},
		{"unknown", "done\n", nil},
		{"empty", "", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, parseCodingTestsRun(tc.output))
		})
	}
}

// Contract B3 as Security d-cey74a superseded it: the line names the agent's
// sandbox, never says passed or verified, and shows a failure as it is.
func TestCodingResultSummary(t *testing.T) {
	head := "0123456789abcdef0123456789abcdef01234567"
	count := func(n int) *int { return &n }
	result := func(exit int, tests *int, commit string) CodingResult {
		h := head
		return CodingResult{HeadCommit: &h, TestReceipt: &CodingTestReceipt{Command: "npm run test", ExitCode: exit, Commit: commit, TestsRun: tests}}
	}
	for _, tc := range []struct {
		name   string
		result CodingResult
		want   string
	}{
		{"tested, count known", result(0, count(12), head), "`npm run test` exited 0 in the agent's sandbox at 0123456789ab · 12 tests"},
		{"tested and failing", result(1, count(12), head), "`npm run test` exited 1 in the agent's sandbox at 0123456789ab · 12 tests"},
		{"one test", result(0, count(1), head), "`npm run test` exited 0 in the agent's sandbox at 0123456789ab · 1 test"},
		{"count unknown", result(2, nil, head), "`npm run test` exited 2 in the agent's sandbox at 0123456789ab"},
		{"zero tests", result(0, count(0), head), "`npm run test` ran 0 tests in the agent's sandbox"},
		{"no receipt", CodingResult{HeadCommit: &head}, "Tests not run at this commit"},
		{"receipt at another commit", result(0, count(3), "fedcba9876543210fedcba9876543210fedcba98"), "Tests not run at this commit"},
		{"no head", CodingResult{TestReceipt: &CodingTestReceipt{Command: "x", Commit: head}}, "Tests not run at this commit"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := CodingResultSummary(tc.result)
			require.Equal(t, tc.want, got)
			require.NotContains(t, strings.ToLower(got), "passed")
			require.NotContains(t, strings.ToLower(got), "verified")
		})
	}
	backticks := result(0, nil, head)
	backticks.TestReceipt.Command = "sh -c \"echo `date`\""
	require.Equal(t, "`` sh -c \"echo `date`\" `` exited 0 in the agent's sandbox at 0123456789ab", CodingResultSummary(backticks))
}

// The masked tail has no secret value, credential shape or URL password, is
// valid UTF-8 without NUL, and keeps at most the last 4 KiB.
func TestMaskCodingOutput(t *testing.T) {
	secret := "repo-secret-value-1234"
	output := strings.Repeat("é", 3000) + "\x00\n" +
		"value " + secret + "\n" +
		"token smithers_" + strings.Repeat("a", 40) + " and smithers_flowhost_abcdefgh12345678\n" +
		"github ghp_" + strings.Repeat("B", 36) + "\n" +
		"openai sk-" + strings.Repeat("c", 40) + "\n" +
		"slack xoxb-1234567890-abc and aws AKIAABCDEFGHIJKLMNOP\n" +
		"clone https://x-access-token:hunter2@github.com/o/r.git\n" +
		"jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U\n" +
		"ℹ tests 2\n"
	masked := maskCodingOutput(map[string]string{"S": secret}, []byte(output))
	require.LessOrEqual(t, len(masked), codingResultTailBytes)
	require.True(t, strings.HasSuffix(masked, "ℹ tests 2\n"))
	require.True(t, utf8ValidNoNUL(masked))
	for _, leaked := range []string{secret, "smithers_aaaa", "smithers_flowhost_", "ghp_", "sk-ccc", "xoxb-", "AKIAABCD", "hunter2", "eyJhbGci"} {
		require.NotContains(t, masked, leaked)
	}
	require.Contains(t, masked, "https://********@github.com/o/r.git")
	require.Equal(t, "plain", maskCodingOutput(nil, []byte("plain")))
}

func utf8ValidNoNUL(text string) bool {
	return !strings.Contains(text, "\x00") && strings.ToValidUTF8(text, "") == text
}
