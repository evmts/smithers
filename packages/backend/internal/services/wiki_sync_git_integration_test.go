package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

// wikiSyncGit runs git in dir as a user would, isolated from host config.
func wikiSyncGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=Vault", "-c", "user.email=vault@example.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"}, args...)...)
	cmd.Dir = dir
	for _, variable := range os.Environ() {
		if !strings.HasPrefix(variable, "GIT_") {
			cmd.Env = append(cmd.Env, variable)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_NOSYSTEM=1")
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, string(out))
	return strings.TrimSpace(string(out))
}

func latestWikiSyncEvents(t *testing.T, svc *WikiService, actor db.User, repo string) map[string]WikiEvent {
	t.Helper()
	events, err := svc.ListWikiEvents(context.Background(), &actor, actor.Username, repo, 0)
	require.NoError(t, err)
	latest := map[string]WikiEvent{}
	for _, event := range events {
		if !event.Deleted {
			latest[event.Path] = event
		}
	}
	return latest
}

func TestWikiSyncGitSourceCommitProvenance(t *testing.T) {
	ctx := context.Background()
	pool := newProductTestPool(t)
	actor, repo := issueCovSeedUserRepo(t, pool)
	q := db.New(pool)
	svc := newTestWikiService(q, nil, WithWikiCollaboration(q, nil))
	checkout := t.TempDir()
	wikiSyncGit(t, checkout, "init", "-q")
	vault := filepath.Join(checkout, "vault")
	require.NoError(t, os.MkdirAll(filepath.Join(vault, "assets"), 0700))
	markdown := "---\ntags: [ops]\n---\n# Home\n[[Other]]\n"
	image := []byte{0x89, 'P', 'N', 'G', 0, 1, 2, 3}
	require.NoError(t, os.WriteFile(filepath.Join(vault, "Home.md"), []byte(markdown), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(vault, "assets", "logo.png"), image, 0600))
	require.NoError(t, os.WriteFile(filepath.Join(checkout, "outside.md"), []byte("# Outside\n"), 0600))
	wikiSyncGit(t, checkout, "add", ".")
	wikiSyncGit(t, checkout, "commit", "-q", "-m", "vault")
	first := wikiSyncGit(t, checkout, "rev-parse", "HEAD")
	// Untracked bytes in a checkout have no commit to attribute.
	require.NoError(t, os.WriteFile(filepath.Join(vault, "Draft.md"), []byte("# Draft\n"), 0600))
	// Inherited repository overrides must not redirect discovery.
	other := t.TempDir()
	wikiSyncGit(t, other, "init", "-q")
	t.Setenv("GIT_DIR", filepath.Join(other, ".git"))
	t.Setenv("GIT_WORK_TREE", other)

	adapter, err := NewObsidianSync(vault)
	require.NoError(t, err)
	defer adapter.Close()
	run := func() {
		t.Helper()
		require.NoError(t, svc.SyncWiki(ctx, &actor, actor.Username, repo, "git", adapter))
	}
	run()
	events := latestWikiSyncEvents(t, svc, actor, repo)
	require.Len(t, events, 3)
	require.Equal(t, first, events["Home.md"].SourceCommit)
	require.Equal(t, first, events["assets/logo.png"].SourceCommit)
	require.Empty(t, events["Draft.md"].SourceCommit)
	history, _, err := svc.ListWikiPageHistory(ctx, &actor, actor.Username, repo, events["Home.md"].PageID, 1, 10)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, first, history[0].SourceCommit)

	// An uncommitted edit is imported without provenance.
	edited := markdown + "local\n"
	require.NoError(t, os.WriteFile(filepath.Join(vault, "Home.md"), []byte(edited), 0600))
	run()
	events = latestWikiSyncEvents(t, svc, actor, repo)
	require.Equal(t, int64(2), events["Home.md"].Revision)
	require.Empty(t, events["Home.md"].SourceCommit)
	// Committing identical bytes adds no revision and rewrites no history.
	wikiSyncGit(t, checkout, "commit", "-q", "-am", "edit")
	run()
	events = latestWikiSyncEvents(t, svc, actor, repo)
	require.Equal(t, int64(2), events["Home.md"].Revision)
	require.Empty(t, events["Home.md"].SourceCommit)

	// A committed rename records the commit holding the renamed path.
	wikiSyncGit(t, checkout, "mv", "vault/Home.md", "vault/Start.md")
	wikiSyncGit(t, checkout, "commit", "-q", "-m", "rename")
	renamed := wikiSyncGit(t, checkout, "rev-parse", "HEAD")
	run()
	events = latestWikiSyncEvents(t, svc, actor, repo)
	require.Equal(t, int64(3), events["Start.md"].Revision)
	require.Equal(t, renamed, events["Start.md"].SourceCommit)
	history, _, err = svc.ListWikiPageHistory(ctx, &actor, actor.Username, repo, events["Start.md"].PageID, 1, 10)
	require.NoError(t, err)
	sources := map[int64]string{}
	for _, revision := range history {
		sources[revision.Revision] = revision.SourceCommit
	}
	require.Equal(t, map[int64]string{1: first, 2: "", 3: renamed}, sources)

	// A wiki edit written out to the folder is not attributed to any commit.
	body := edited + "from wiki\n"
	page, err := svc.UpdateWikiPage(ctx, &actor, actor.Username, repo, events["Start.md"].Slug, UpdateWikiPageInput{Body: &body})
	require.NoError(t, err)
	run()
	written, err := os.ReadFile(filepath.Join(vault, "Start.md"))
	require.NoError(t, err)
	require.Equal(t, body, string(written))
	events = latestWikiSyncEvents(t, svc, actor, repo)
	require.Equal(t, page.Revision, events["Start.md"].Revision)
	require.Empty(t, events["Start.md"].SourceCommit)
}

func TestWikiSyncGitSourceCommitRefusals(t *testing.T) {
	ctx := context.Background()
	t.Run("folder outside a work tree", func(t *testing.T) {
		adapter, err := NewObsidianSync(t.TempDir())
		require.NoError(t, err)
		defer adapter.Close()
		commit, err := adapter.SourceCommit(ctx, SyncDocument{Path: "Home.md"}, []byte("# Home\n"))
		require.NoError(t, err)
		require.Empty(t, commit)
	})
	t.Run("unborn head", func(t *testing.T) {
		checkout := t.TempDir()
		wikiSyncGit(t, checkout, "init", "-q")
		adapter, err := NewObsidianSync(checkout)
		require.NoError(t, err)
		defer adapter.Close()
		commit, err := adapter.SourceCommit(ctx, SyncDocument{Path: "Home.md"}, []byte("# Home\n"))
		require.NoError(t, err)
		require.Empty(t, commit)
	})
	t.Run("bytes differ from the committed blob", func(t *testing.T) {
		checkout := t.TempDir()
		wikiSyncGit(t, checkout, "init", "-q")
		// Line-ending conversion makes the working bytes differ from the blob.
		require.NoError(t, os.WriteFile(filepath.Join(checkout, ".gitattributes"), []byte("*.md text eol=crlf\n"), 0600))
		require.NoError(t, os.WriteFile(filepath.Join(checkout, "Home.md"), []byte("# Home\n"), 0600))
		wikiSyncGit(t, checkout, "add", ".")
		wikiSyncGit(t, checkout, "commit", "-q", "-m", "crlf")
		require.NoError(t, os.Remove(filepath.Join(checkout, "Home.md")))
		wikiSyncGit(t, checkout, "checkout", "--", "Home.md")
		data, err := os.ReadFile(filepath.Join(checkout, "Home.md"))
		require.NoError(t, err)
		require.Equal(t, "# Home\r\n", string(data))
		adapter, err := NewObsidianSync(checkout)
		require.NoError(t, err)
		defer adapter.Close()
		commit, err := adapter.SourceCommit(ctx, SyncDocument{Path: "Home.md"}, data)
		require.NoError(t, err)
		require.Empty(t, commit)
		commit, err = adapter.SourceCommit(ctx, SyncDocument{Path: "Home.md"}, []byte("# Home\n"))
		require.NoError(t, err)
		require.Equal(t, wikiSyncGit(t, checkout, "rev-parse", "HEAD"), commit)
	})
	t.Run("invalid path", func(t *testing.T) {
		adapter, err := NewObsidianSync(t.TempDir())
		require.NoError(t, err)
		defer adapter.Close()
		for _, name := range []string{"../escape.md", ".git/config", "/abs.md"} {
			_, err = adapter.SourceCommit(ctx, SyncDocument{Path: name}, nil)
			require.Error(t, err, name)
		}
	})
	t.Run("cancelled", func(t *testing.T) {
		checkout := t.TempDir()
		wikiSyncGit(t, checkout, "init", "-q")
		require.NoError(t, os.WriteFile(filepath.Join(checkout, "Home.md"), []byte("# Home\n"), 0600))
		wikiSyncGit(t, checkout, "add", ".")
		wikiSyncGit(t, checkout, "commit", "-q", "-m", "home")
		adapter, err := NewObsidianSync(checkout)
		require.NoError(t, err)
		defer adapter.Close()
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		_, err = adapter.SourceCommit(cancelled, SyncDocument{Path: "Home.md"}, []byte("# Home\n"))
		require.ErrorIs(t, err, context.Canceled)
	})
}

func TestWikiRevisionSourceRecordGuards(t *testing.T) {
	ctx := context.Background()
	pool := newProductTestPool(t)
	actor, repo := issueCovSeedUserRepo(t, pool)
	q := db.New(pool)
	svc := newTestWikiService(q, nil, WithWikiCollaboration(q, nil))
	page, err := svc.CreateWikiPage(ctx, &actor, actor.Username, repo, CreateWikiPageInput{Title: "Home", Body: "# Home\n"})
	require.NoError(t, err)
	event := WikiEvent{PageID: page.ID, Revision: page.Revision}
	commit := strings.Repeat("a", 40)
	_, err = svc.recordWikiSyncSource(ctx, &actor, actor.Username, repo, event, "HEAD")
	require.Error(t, err)
	// Another author's revision is never annotated.
	other := actor
	other.ID++
	recorded, err := svc.recordWikiSyncSource(ctx, &other, actor.Username, repo, event, commit)
	require.NoError(t, err)
	require.Empty(t, recorded)
	recorded, err = svc.recordWikiSyncSource(ctx, &actor, actor.Username, repo, event, commit)
	require.NoError(t, err)
	require.Equal(t, commit, recorded)
	// Provenance is written once.
	recorded, err = svc.recordWikiSyncSource(ctx, &actor, actor.Username, repo, event, strings.Repeat("b", 64))
	require.NoError(t, err)
	require.Empty(t, recorded)
	// Storage refuses rewriting a receipt, other fields, and malformed commits.
	_, err = pool.Exec(ctx, `UPDATE wiki_page_revisions SET source_commit=$2 WHERE page_id=$1`, page.ID, strings.Repeat("b", 40))
	require.ErrorContains(t, err, "wiki revisions are immutable")
	_, err = pool.Exec(ctx, `UPDATE wiki_page_revisions SET body='rewritten' WHERE page_id=$1`, page.ID)
	require.ErrorContains(t, err, "wiki revisions are immutable")
	second, err := svc.UpdateWikiPage(ctx, &actor, actor.Username, repo, page.Slug, UpdateWikiPageInput{Body: new("# Home\nmore\n")})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE wiki_page_revisions SET source_commit='not-a-commit' WHERE page_id=$1 AND revision=$2`, page.ID, second.Revision)
	require.ErrorContains(t, err, "check constraint")
	page = second
	history, _, err := svc.ListWikiPageHistory(ctx, &actor, actor.Username, repo, page.ID, 1, 10)
	require.NoError(t, err)
	require.Len(t, history, 2)
	for _, revision := range history {
		if revision.Revision == 1 {
			require.Equal(t, commit, revision.SourceCommit)
		} else {
			require.Empty(t, revision.SourceCommit)
		}
	}
}

// wrapGit puts a git on PATH that fails hash-object and runs the real git
// otherwise, so an unexpected plumbing failure is observable.
func wrapGit(t *testing.T) {
	t.Helper()
	real, err := exec.LookPath("git")
	require.NoError(t, err)
	bin := t.TempDir()
	script := "#!/bin/sh\nfor a in \"$@\"; do [ \"$a\" = hash-object ] && { echo broken >&2; exit 3; }; done\nexec " + real + " \"$@\"\n"
	require.NoError(t, os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0700))
	t.Setenv("PATH", bin)
}

func TestWikiSyncGitSourceCommitFailures(t *testing.T) {
	ctx := context.Background()
	checkout := t.TempDir()
	wikiSyncGit(t, checkout, "init", "-q")
	require.NoError(t, os.WriteFile(filepath.Join(checkout, "Home.md"), []byte("# Home\n"), 0600))
	wikiSyncGit(t, checkout, "add", ".")
	wikiSyncGit(t, checkout, "commit", "-q", "-m", "home")
	adapter, err := NewObsidianSync(checkout)
	require.NoError(t, err)
	defer adapter.Close()
	t.Run("no git on the host", func(t *testing.T) {
		t.Setenv("PATH", t.TempDir())
		commit, err := adapter.SourceCommit(ctx, SyncDocument{Path: "Home.md"}, []byte("# Home\n"))
		require.NoError(t, err)
		require.Empty(t, commit)
	})
	t.Run("plumbing failure fails the import", func(t *testing.T) {
		wrapGit(t)
		_, err := adapter.SourceCommit(ctx, SyncDocument{Path: "Home.md"}, []byte("# Home\n"))
		var exit *exec.ExitError
		require.ErrorAs(t, err, &exit)
		pool := newProductTestPool(t)
		actor, repo := issueCovSeedUserRepo(t, pool)
		q := db.New(pool)
		svc := newTestWikiService(q, nil, WithWikiCollaboration(q, nil))
		require.ErrorAs(t, svc.SyncWiki(ctx, &actor, actor.Username, repo, "git", adapter), &exit)
		pages, _, err := svc.ListWikiPages(ctx, &actor, actor.Username, repo, ListWikiPagesInput{})
		require.NoError(t, err)
		require.Empty(t, pages)
	})
}

func TestWikiRevisionSourceRecordUnavailable(t *testing.T) {
	ctx := context.Background()
	actor := &db.User{ID: 1, Username: "alice"}
	commit := strings.Repeat("a", 40)
	_, err := newTestWikiService(&mockWikiQuerier{}, nil).recordWikiSyncSource(ctx, actor, "alice", "demo", WikiEvent{PageID: 1, Revision: 1}, commit)
	require.ErrorContains(t, err, "provenance is unavailable")
	pool := newProductTestPool(t)
	q := db.New(pool)
	_, err = newTestWikiService(q, nil).recordWikiSyncSource(ctx, actor, "nobody", "missing", WikiEvent{PageID: 1, Revision: 1}, commit)
	require.Error(t, err)
}
