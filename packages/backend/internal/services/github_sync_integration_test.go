package services

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
)

// On an install, a TODO merged in Smithers reaches the install's main only
// through the GitHub sync: GitHub's squash commit (a real commit on the
// fixture's main) is read by the sync, fast-forwarded into the install's
// main with the sync's authority, and folded by the stack. The TODO is
// Merged by GitHub's merge receipt and GitHub's main containing it. Real
// PostgreSQL, real git on both sides, githubfake as GitHub.
func TestInstallMainFollowsAMergeInSmithers(t *testing.T) {
	h := newMergeHarness(t)
	ctx := context.Background()
	q := db.New(h.pool)
	sync := NewGitHubMainPullService(q, h.host, h.connections, h.connections)
	qualifyMainPullFixture(sync)
	sync.SetMainMoved(h.service.MainMoved)
	follows := 0
	h.service.SetMainFollower(func(ctx context.Context, repositoryID int64) {
		follows++
		_, err := sync.Request(ctx, repositoryID)
		require.NoError(t, err)
	})

	// The sync enrolls the repository and finds both mains equal.
	_, err := sync.SyncHealth(ctx)
	var unavailable *GitHubSyncUnavailable
	require.ErrorAs(t, err, &unavailable, "nothing followed yet")
	sync.Sweep(ctx)
	require.NoError(t, sync.PollOnce(ctx))
	row, err := q.GetGithubMainPull(ctx, h.repoID)
	require.NoError(t, err)
	require.Equal(t, "synced", row.State, row.LastError)
	require.Equal(t, []string{h.main, h.main}, []string{row.GithubHead, row.SmithersHead})
	health, err := sync.SyncHealth(ctx)
	require.NoError(t, err)
	require.Equal(t, "fresh", health.State)

	n, head, pr := h.first("Add a greeting")
	require.NoError(t, h.press(h.ctx, n, head))
	h.pass()
	squash := h.githubRef("main")
	require.Equal(t, h.pull(pr).MergeCommitSHA, squash, "GitHub's main is the squash commit")
	require.Equal(t, h.main, h.git(h.github, "rev-parse", squash+"^"))
	require.Equal(t, h.git(h.github, "rev-parse", head+"^{tree}"), h.git(h.github, "rev-parse", squash+"^{tree}"))
	state, _ := h.mergeCard(n)
	require.Equal(t, "merged", state, "Merged by GitHub's receipt and its main containing the merge")
	require.Equal(t, 1, follows, "the merge asks the sync to read main at once")
	require.Equal(t, h.main, h.hostRef("refs/heads/main"), "only the sync writes the install's main")

	writes := len(h.host.metas)
	require.NoError(t, sync.PollOnce(ctx))
	require.Equal(t, squash, h.hostRef("refs/heads/main"))
	row, err = q.GetGithubMainPull(ctx, h.repoID)
	require.NoError(t, err)
	require.Equal(t, "synced", row.State, row.LastError)
	require.Equal(t, []string{squash, squash}, []string{row.GithubHead, row.SmithersHead})
	require.Len(t, h.host.metas, writes+1)
	assert.Equal(t, middleware.CredentialSync, h.host.metas[writes].PusherCredential)
	health, err = sync.SyncHealth(ctx)
	require.NoError(t, err)
	require.Equal(t, "fresh", health.State)
	require.Equal(t, row.LastSyncedAt.Time, *health.LastSuccessAt)

	// The stack folds the main the sync brought in; the TODO stays Merged.
	h.pass()
	stack, err := q.GetMythicalStack(ctx, h.repoID)
	require.NoError(t, err)
	require.Equal(t, squash, stack.LandedMain, stack.LastError)
	require.Equal(t, h.hostTree(squash), h.hostTree(h.hostRef(repohost.MythicalBookmarkRef)), "the stack's tree is main's")
	state, _ = h.mergeCard(n)
	require.Equal(t, "merged", state)

	// Without the request, the sync reads main again 30 s after its last read.
	due := func(age int) bool {
		t.Helper()
		h.exec(`UPDATE github_main_pulls SET last_checked_at = NOW() - make_interval(secs => $1) WHERE repository_id = $2`, age, h.repoID)
		sync.Sweep(ctx)
		row, err := q.GetGithubMainPull(ctx, h.repoID)
		require.NoError(t, err)
		return row.RequestedGeneration > row.SyncedGeneration
	}
	require.False(t, due(29), "read 29 s ago")
	require.True(t, due(31), "read 31 s ago")
}

// The sync records each change to main it brings in, so the scorecard can
// tell a Smithers merge from a laptop commit (T-GH-02, T-REL-03). The
// enrolling read that finds both mains equal records nothing.
func TestInstallMainSyncRecordsChangesToMain(t *testing.T) {
	h := newMergeHarness(t)
	ctx := context.Background()
	q := db.New(h.pool)
	sync := NewGitHubMainPullService(q, h.host, h.connections, h.connections)
	qualifyMainPullFixture(sync)
	sync.SetMainMoved(h.service.MainMoved)
	h.service.SetMainFollower(func(ctx context.Context, repositoryID int64) {
		_, err := sync.Request(ctx, repositoryID)
		require.NoError(t, err)
	})
	inventory := func() map[string]bool {
		t.Helper()
		rows, err := q.ScorecardMainCommits(ctx, db.ScorecardMainCommitsParams{WindowFrom: time.Unix(0, 0), WindowTo: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		out := map[string]bool{}
		for _, row := range rows {
			out[row.CommitID] = row.Smithers
		}
		return out
	}
	sync.Sweep(ctx)
	require.NoError(t, sync.PollOnce(ctx))
	require.Empty(t, inventory(), "history from before the install is not a change to main")
	covered, err := q.ScorecardMainCommitCoverage(ctx, time.Now().Add(time.Minute))
	require.NoError(t, err)
	require.True(t, covered, "the first synced read starts the inventory")
	covered, err = q.ScorecardMainCommitCoverage(ctx, time.Now().Add(-time.Hour))
	require.NoError(t, err)
	require.False(t, covered, "a window that began before the inventory is not covered")

	n, head, _ := h.first("Add a greeting")
	require.NoError(t, h.press(h.ctx, n, head))
	h.pass()
	squash := h.githubRef("main")
	require.NoError(t, sync.PollOnce(ctx))

	// Alice pushes a commit to GitHub's main from her laptop.
	h.git(h.work, "fetch", "-q", h.github, "refs/heads/main")
	h.git(h.work, "checkout", "-q", "FETCH_HEAD")
	laptop := h.commit("Alice's laptop commit", "LAPTOP.md", "from a laptop\n")
	h.git(h.work, "push", "-q", h.github, laptop+":refs/heads/main")
	_, err = sync.Request(ctx, h.repoID)
	require.NoError(t, err)
	require.NoError(t, sync.PollOnce(ctx))
	require.Equal(t, laptop, h.hostRef("refs/heads/main"))
	require.Equal(t, map[string]bool{squash: true, laptop: false}, inventory())
}
