package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The pull request body is the coding_result's one line: where the test ran
// and how it exited, never "passed" or "verified", with no token, URL or
// output (contract B3, Security d-cey74a).
func TestSessionLandingBodyStatesTheSandboxResult(t *testing.T) {
	for _, tc := range []struct{ name, receipt, notRun, want string }{
		{"count known", `{"command":"npm run test","exit_code":0,"commit":"%[1]s","finished_at":"2026-10-19T05:00:00Z","output_tail":"smithers_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa https://u:p@example.com","tests_run":2}`, `null`, "`npm run test` exited 0 in the agent's sandbox at %[2]s · 2 tests"},
		{"failing", `{"command":"npm run test","exit_code":1,"commit":"%[1]s","finished_at":"2026-10-19T05:00:00Z","output_tail":"","tests_run":2}`, `null`, "`npm run test` exited 1 in the agent's sandbox at %[2]s · 2 tests"},
		{"count unknown", `{"command":"make test","exit_code":0,"commit":"%[1]s","finished_at":"2026-10-19T05:00:00Z","output_tail":"","tests_run":null}`, `null`, "`make test` exited 0 in the agent's sandbox at %[2]s"},
		{"zero tests", `{"command":"npm run test","exit_code":0,"commit":"%[1]s","finished_at":"2026-10-19T05:00:00Z","output_tail":"","tests_run":0}`, `null`, "`npm run test` ran 0 tests in the agent's sandbox"},
		{"not run", `null`, `{"reason_code":"test_env_unavailable","reason":"dependencies not installed in the sandbox"}`, "Tests not run: dependencies not installed in the sandbox"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			x := newSessionLandingTestFixture(t)
			receipt := tc.receipt
			if receipt != "null" {
				receipt = fmt.Sprintf(receipt, x.head)
			}
			raw := fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":%s,"test_not_run":%s}`, x.head, x.changeID, receipt, tc.notRun)
			_, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(raw))
			require.NoError(t, err)
			_, err = x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, nil)
			require.NoError(t, err)
			creates := x.f.pullCreates()
			require.Len(t, creates, 1)
			body := creates[0]["body"].(string)
			want := tc.want
			if strings.Contains(want, "%[2]s") {
				want = fmt.Sprintf(want, x.head, x.head[:12])
			}
			require.True(t, strings.HasPrefix(body, want+"\n\n---\nSmithers landing #"), body)
			for _, banned := range []string{"passed", "verified", "smithers_", "https://", "u:p@"} {
				require.NotContains(t, strings.ToLower(body), strings.ToLower(banned))
			}
		})
	}
}
