package services

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// The repository inventory says which tracker each repository's ordinary
// issues live in (#4030). Before this, a hosted origin's `/issues.close 6`
// meant the Smithers Cloud row for every repository, because the inventory
// carried no source at all: an imported GitHub repository needed
// `--source github` on every single act, and a Cloud-only write read back as
// though GitHub had done it.
//
// The answer comes from the repository's OWN GitHub binding, through the
// canonical query the landing and job paths already use
// (db.ListRepositoryGitHubSources: the sync registry's current binding, which
// follows GitHub renames, else the latest ready import bound to this exact
// native repository). Nothing is inferred from a display name, a number or a
// summary — and the two repositories below are deliberately named identically
// apart from their binding.
func TestAuthenticatedUserReposNameTheirIssueTrackerFromTheGitHubBinding(t *testing.T) {
	pool := setupTestPool(t)
	ctx := context.Background()
	queries := db.New(pool)
	service := NewUserService(queries)

	base := fmt.Sprintf("%d", time.Now().UnixNano())
	owner := "tracker-" + base
	var ownerID int64
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users(username,lower_username,email,lower_email) VALUES ($1,$1,$2,$2) RETURNING id`,
		owner, owner+"@example.com").Scan(&ownerID))

	repoID := func(name string) int64 {
		t.Helper()
		var id int64
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,$2,$2) RETURNING id`, ownerID, name).Scan(&id))
		return id
	}
	imported := repoID("imported")
	native := repoID("native")

	// The imported repository's binding, exactly as the import path records
	// it: a sync-registry row whose mirror IS this repository.
	enrolled, err := queries.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{
		OwnerLogin: "octo-" + base, RepoName: "upstream", SyncRefs: true, SyncMetadata: true, EnrolledVia: "import",
	})
	require.NoError(t, err)
	require.NoError(t, queries.SetGitHubSyncedRepoMirror(ctx, db.SetGitHubSyncedRepoMirrorParams{
		ID: enrolled.ID, MirrorOwner: owner, MirrorRepo: "imported",
	}))

	result, err := service.ListAuthenticatedUserRepos(ctx, ownerID, 1, 50)
	require.NoError(t, err)
	trackers := map[string]string{}
	for _, item := range result.Items {
		trackers[item.Name] = item.IssueTracker
	}
	assert.Equal(t, IssueTrackerGitHub, trackers["imported"],
		"an imported GitHub repository's ordinary issues are GitHub's, with no flag on the act")
	assert.Equal(t, IssueTrackerSmithers, trackers["native"],
		"a Smithers Cloud repository keeps its own tracker")

	// The binding is the authority, not the name: the sources query itself
	// answers the same two verdicts.
	sources, err := queries.ListRepositoryGitHubSources(ctx, imported)
	require.NoError(t, err)
	require.Len(t, sources, 1)
	assert.Equal(t, "upstream", sources[0].GithubRepo)
	sources, err = queries.ListRepositoryGitHubSources(ctx, native)
	require.NoError(t, err)
	assert.Empty(t, sources)
}

// A store that cannot answer the binding declares NO tracker: the field is
// absent rather than defaulted, so a reader is told "unknown" instead of
// being told Smithers Cloud for a repository whose issues are GitHub's.
func TestIssueTrackersAreAbsentWhenTheBindingCannotBeRead(t *testing.T) {
	service := &UserService{queries: trackerlessQuerier{}}
	trackers := service.issueTrackersOf(context.Background(), []db.Repository{{ID: 7}})
	assert.Nil(t, trackers, "no binding reader means no tracker claim at all")
}

// A querier without the sources capability; every other method is unused here.
type trackerlessQuerier struct{ UserQuerier }
