package services

import (
	"context"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/internal/repohostffi"
	"github.com/smithersai/smithers/packages/backend/internal/repohostserver"
)

// A seeded public mirror (public_mirror_seed.go) starts as an empty
// repository. The pull's first write creates main with GitHub's whole history
// on a real repo-host (jj + git stores), and its second is a fast-forward.
func TestGitHubMainPullFillsAnEmptyRepository_Native(t *testing.T) {
	library := os.Getenv("SMITHERS_FFI_LIBRARY_PATH")
	if library == "" {
		t.Skip("set SMITHERS_FFI_LIBRARY_PATH to the built smithers-ffi library")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	ctx := context.Background()
	root := t.TempDir()
	f := &gitFixture{t: t, root: root, work: filepath.Join(root, "work")}
	f.git(root, "init", "-q", "--initial-branch=main", f.work)
	a := f.commit("a", "a.txt", "a")
	f.git(f.work, "checkout", "-q", "-b", "side", a)
	d := f.commit("d", "d.txt", "d")
	f.git(f.work, "checkout", "-q", "main")
	f.commit("c", "README.md", "# Smithers\n")
	f.git(f.work, "merge", "-q", "--no-ff", "-m", "merge side", d)
	merge := f.git(f.work, "rev-parse", "HEAD")
	github := f.bare("github.git")
	f.git(f.work, "push", "-q", github, merge+":refs/heads/main", "side")
	server := serveFixtureGitHub(t, root)

	cfg := repohostserver.Config{StoragePath: t.TempDir(), AuthToken: "public-mirror", FFILibraryPath: library}
	native := repohostffi.New(library)
	require.NoError(t, native.Load())
	backend, err := repohostserver.NewWithFFI(cfg, native)
	require.NoError(t, err)
	repoHost := httptest.NewServer(backend.Handler())
	defer repoHost.Close()
	host := repohost.NewClient(&repohost.StaticStorageSetResolver{URL: repoHost.URL}, cfg.AuthToken)
	// What RepoService does for a seeded mirror: no first commit.
	require.NoError(t, host.InitRepo(ctx, "smithersai", "smithers", "main", false))
	bookmarks, _, err := host.ListBookmarks(ctx, "smithersai", "smithers", "", 100)
	require.NoError(t, err)
	require.Empty(t, bookmarks)

	store := newFakeMainPullStore()
	store.repos[19] = db.Repository{ID: 19, Name: "smithers", LowerName: "smithers", DefaultBookmark: "main", OrgID: pgtype.Int8{Int64: 2, Valid: true}}
	service := NewGitHubMainPullService(store, host, &fixtureTokens{}, nil)
	service.gitHubGitBaseURL = func() string { return server.URL }
	service.readPolicy = func(context.Context, string, string, string, string) (string, error) { return "pull", nil }
	pull := func() {
		t.Helper()
		_, err := service.Request(ctx, 19)
		require.NoError(t, err)
		require.NoError(t, service.PollOnce(ctx))
		row, err := store.GetGithubMainPull(ctx, 19)
		require.NoError(t, err)
		require.Equal(t, "synced", row.State, row.LastError)
	}

	pull()
	main, err := host.GetBookmark(ctx, "smithersai", "smithers", "main")
	require.NoError(t, err)
	assert.Equal(t, merge, main.TargetCommitID, "jj holds main at GitHub's tip")
	gitDir := cfg.GitBackendPath("smithersai", "smithers")
	assert.Equal(t, "4", f.git(gitDir, "rev-list", "--count", "refs/heads/main"), "the whole history arrives")
	bookmarks, _, err = host.ListBookmarks(ctx, "smithersai", "smithers", "", 100)
	require.NoError(t, err)
	require.Len(t, bookmarks, 1, "no other GitHub branch is copied")
	readme, err := host.GetFileAtChange(ctx, "smithersai", "smithers", main.TargetChangeID, "README.md")
	require.NoError(t, err)
	assert.Equal(t, "# Smithers\n", readme.Content, "a reader gets the repository's files")

	next := f.commit("e", "e.txt", "e")
	f.git(f.work, "push", "-q", github, next+":refs/heads/main")
	pull()
	main, err = host.GetBookmark(ctx, "smithersai", "smithers", "main")
	require.NoError(t, err)
	assert.Equal(t, next, main.TargetCommitID)
}
