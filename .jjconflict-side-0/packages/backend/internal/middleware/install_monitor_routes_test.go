package middleware

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// The repository's own monitor reads are the install's `monitor` command, the
// same one `/api/runs` runs (#4032). Nothing wider: only these three GETs.
func TestInstallMonitorCommandRoutes(t *testing.T) {
	for _, path := range []string{
		"/api/runs",
		"/api/runs/thrash-run",
		"/api/runs/box:thrash-run/trace",
		"/api/repos/maya/demo/monitors",
		"/api/repos/maya/demo/monitors/thrash-run",
		"/api/repos/maya/demo/monitors/box:thrash-run/trace",
	} {
		require.Equal(t, "monitor", InstallMemberCommand(http.MethodGet, path), path)
	}
	for _, unmapped := range []struct{ method, path string }{
		{http.MethodPost, "/api/repos/maya/demo/monitors"},
		{http.MethodPost, "/api/repos/maya/demo/monitors/thrash-run"},
		{http.MethodDelete, "/api/repos/maya/demo/monitors/thrash-run"},
		{http.MethodGet, "/api/repos/maya/demo/monitors/thrash-run/trace/extra"},
		{http.MethodGet, "/api/repos/maya/demo/monitors/thrash-run/cancel"},
		{http.MethodGet, "/api/monitors"},
	} {
		require.Empty(t, InstallMemberCommand(unmapped.method, unmapped.path), unmapped.method+" "+unmapped.path)
	}
	// The CI workflow-run list keeps its own command; the monitor rule must
	// not reach `/runs` on a repository.
	require.Equal(t, "runs.list", InstallMemberCommand(http.MethodGet, "/api/repos/maya/demo/runs"))
}
