package services

import (
	"bytes"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Every fence that refuses an install issues read must name itself. The
// refusal a person reads is fixed text by design, so with no record an
// install that cannot list its issues is indistinguishable from the other
// installs that cannot either: a real composed install on Linux answered
// GET /api/issues with this 503 and left no record of its cause anywhere in
// the log. The fence name stays in the log; it never joins the answer.
func TestInstallIssuesRefusalNamesItsFence(t *testing.T) {
	const answer = `503 github_unavailable infra Could not read issues from GitHub`
	refusal := func(t *testing.T, err error) {
		t.Helper()
		var typed *TodoControlError
		require.ErrorAs(t, err, &typed)
		require.Equal(t, http.StatusServiceUnavailable, typed.Status)
		require.Equal(t, answer, strings.Join([]string{"503", typed.Code, typed.Class, typed.Message}, " "))
	}
	for _, test := range []struct {
		name  string
		fence string
		call  func(*MythicalService) error
	}{
		{
			name:  "no issue service",
			fence: issuesClosedNoService,
			call: func(s *MythicalService) error {
				_, err := s.InstallIssues(t.Context(), 1, "open", 1)
				return err
			},
		},
		{
			name:  "no install sync",
			fence: issuesClosedNoSync,
			call: func(s *MythicalService) error {
				_, err := s.refreshInstallIssueProjection(t.Context(), mythicalGitHubRepo{Owner: "o", Name: "r"}, false)
				return err
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			var records bytes.Buffer
			service := &MythicalService{logger: slog.New(slog.NewTextHandler(&records, nil))}
			refusal(t, test.call(service))
			require.Contains(t, records.String(), "install.issues_closed")
			require.Contains(t, records.String(), "fence="+test.fence)
		})
	}
}
