package services

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	api "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// WikiSyncSourceReporter is implemented by adapters whose documents can come
// from versioned storage. SourceCommit returns the commit whose tree holds
// exactly data at the document's path, or "" when no such commit is known.
type WikiSyncSourceReporter interface {
	SourceCommit(context.Context, SyncDocument, []byte) (string, error)
}

var wikiGitObjectID = regexp.MustCompile(`^([0-9a-f]{40}|[0-9a-f]{64})$`)

// SourceCommit reports HEAD when the folder is inside a git work tree and the
// imported bytes equal the blob HEAD records at that path. Uncommitted edits,
// untracked files, filtered content (LFS, eol conversion) and folders outside
// a work tree have no provenance. The commit is resolved once and the blob is
// compared against the bytes actually imported, so a concurrent commit can
// never attribute other bytes to it.
func (a *ObsidianSync) SourceCommit(ctx context.Context, d SyncDocument, data []byte) (string, error) {
	if err := validSyncPath(d.Path); err != nil {
		return "", err
	}
	prefix, err := a.git(ctx, nil, "rev-parse", "--show-prefix")
	if err != nil {
		var exit *exec.ExitError
		if errors.Is(err, exec.ErrNotFound) || errors.As(err, &exit) {
			return "", nil // not a git work tree, or no git on this host
		}
		return "", err
	}
	commit, err := a.git(ctx, nil, "rev-parse", "--verify", "--quiet", "HEAD^{commit}")
	if err != nil || !wikiGitObjectID.MatchString(commit) {
		return "", ctx.Err() // unborn HEAD
	}
	recorded, err := a.git(ctx, nil, "rev-parse", "--verify", "--quiet", commit+":"+prefix+d.Path)
	if err != nil {
		return "", ctx.Err() // not tracked at HEAD
	}
	imported, err := a.git(ctx, bytes.NewReader(data), "hash-object", "--no-filters", "--stdin")
	if err != nil {
		return "", err
	}
	if imported != recorded {
		return "", nil
	}
	return commit, nil
}

// git runs read-only plumbing in the folder. Inherited repository overrides
// are dropped so discovery always starts at the configured folder.
func (a *ObsidianSync) git(ctx context.Context, stdin io.Reader, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"--no-optional-locks", "-c", "core.fsmonitor=false"}, args...)...)
	cmd.Dir = a.folder
	for _, variable := range os.Environ() {
		if !strings.HasPrefix(variable, "GIT_") {
			cmd.Env = append(cmd.Env, variable)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_TERMINAL_PROMPT=0")
	cmd.Stdin = stdin
	out, err := cmd.Output()
	return strings.TrimSuffix(string(out), "\n"), err
}

type wikiSourceStore interface {
	RecordWikiRevisionSource(context.Context, db.RecordWikiRevisionSourceParams) (int64, error)
}

// recordWikiSyncSource attaches provenance to the revision this import just
// wrote. It runs after the write, so a crash in between leaves the revision
// without provenance (unknown), never with a wrong one; the author and empty
// guards keep it from annotating another writer's or an annotated revision.
func (s *WikiService) recordWikiSyncSource(ctx context.Context, actor *db.User, owner, repo string, event WikiEvent, commit string) (string, error) {
	if !wikiGitObjectID.MatchString(commit) {
		return "", api.BadRequest("invalid source commit")
	}
	store, ok := s.queries.(wikiSourceStore)
	if !ok {
		return "", wikiUnavailable("wiki provenance is unavailable")
	}
	repository, err := s.resolveRepoByOwnerAndName(ctx, owner, repo)
	if err != nil {
		return "", err
	}
	recorded, err := store.RecordWikiRevisionSource(ctx, db.RecordWikiRevisionSourceParams{SourceCommit: commit, RepositoryID: repository.ID, Visibility: wikiVisibility(ctx), PageID: event.PageID, Revision: event.Revision, AuthorID: pgtype.Int8{Int64: actor.ID, Valid: true}})
	if err != nil || recorded != 1 {
		return "", err
	}
	return commit, nil
}
