package compose

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
)

// The branch list a page may ask each composition for.
//
// /api/branches is the INSTALL's global branch index: every branch is a
// projection of its own workspace (spec §6.3), which only a single-owner
// install has. The hosted composition never mounted it, so the deployed app's
// branch page asked for a route that answered 404 and told the person the app
// had hit an unexpected error (#4028).
//
// Every composition serves the repository-scoped branch list instead:
// GET /api/repos/{owner}/{repo}/bookmarks, under the signed-in account's
// read:repository scope and that repository's own read permission, which is
// what keeps a repository the caller cannot read out of the answer. Reading it
// creates and resumes nothing.
func TestBranchListComposition(t *testing.T) {
	for _, mode := range []string{config.AuthModeSelfHosted, config.AuthModeMultitenant, "unknown"} {
		t.Run(mode, func(t *testing.T) {
			cfg := testConfigAllFlagsOn()
			cfg.Auth.Mode = mode
			served := map[string]servedRoute{}
			walkServedRoutes(t, openAPIConformanceRouter(cfg), served)

			_, global := served["get /api/branches"]
			require.Equal(t, config.IsSingleOwner(cfg.Auth), global,
				"the install-global branch list belongs to the install composition alone")

			require.Contains(t, served, "get /api/repos/{owner}/{repo}/bookmarks",
				"every composition serves the repository-scoped branch list")
		})
	}
}

// The repository-scoped branch list is authorized as a repository read, so a
// caller with no read permission on that repository is refused before any
// branch name is read — the same authority the PR commits and check-runs
// reads already carry.
func TestRepositoryScopedBranchListIsARepositoryRead(t *testing.T) {
	require.Equal(t, "repo.read", middleware.InstallMemberCommand("GET", "/api/repos/acme/app/bookmarks"))
	require.Equal(t, "branches.read", middleware.InstallMemberCommand("GET", "/api/branches"))
}
