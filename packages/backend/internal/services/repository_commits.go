package services

import (
	"context"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/diffview"
	"github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"strings"
)

type repositoryCommitReader interface {
	ListRepositoryCommits(context.Context, string, string, string, string, string, int) (repohost.RepositoryCommitPage, error)
	GetRepositoryCommit(context.Context, string, string, string) (repohost.RepositoryCommitDetail, error)
}

func repositoryCommitError(err error) error {
	if err == nil {
		return nil
	}
	if status, ok := repohost.IsStatusError(err); ok {
		switch status.StatusCode {
		case 404:
			return errors.NotFound(status.Message)
		case 400:
			return errors.BadRequest(status.Message)
		}
	}
	return errors.Internal("repository history unavailable").WithCause(err)
}

// ListRepositoryCommits uses the contents authorization and bookmark resolver.
func (s *RepoService) ListRepositoryCommits(ctx context.Context, viewer *db.User, owner, repo, ref, path, cursor string, limit int) (repohost.RepositoryCommitPage, error) {
	repository, err := s.resolveReadableRepo(ctx, viewer, owner, repo)
	if err != nil {
		return repohost.RepositoryCommitPage{}, err
	}
	if err := ValidateRepositoryPath(path); path != "" && err != nil {
		return repohost.RepositoryCommitPage{}, err
	}
	if ref == "" {
		ref = repository.DefaultBookmark
	}
	commit, err := s.resolveContentsCommit(ctx, strings.TrimSpace(owner), repository.Name, ref)
	if err != nil {
		return repohost.RepositoryCommitPage{}, err
	}
	reader, ok := s.repoHost.(repositoryCommitReader)
	if !ok {
		return repohost.RepositoryCommitPage{}, errors.Internal("repository history unavailable")
	}
	page, err := reader.ListRepositoryCommits(ctx, strings.TrimSpace(owner), repository.Name, commit, path, cursor, limit)
	return page, repositoryCommitError(err)
}

// GetRepositoryCommit never resolves a mutable branch name in the commit door.
func (s *RepoService) GetRepositoryCommit(ctx context.Context, viewer *db.User, owner, repo, sha string) (repohost.RepositoryCommitDetail, error) {
	repository, err := s.resolveReadableRepo(ctx, viewer, owner, repo)
	if err != nil {
		return repohost.RepositoryCommitDetail{}, err
	}
	if !immutableCommitSHA(sha) {
		return repohost.RepositoryCommitDetail{}, errors.NotFound("unknown commit")
	}
	reader, ok := s.repoHost.(repositoryCommitReader)
	if !ok {
		return repohost.RepositoryCommitDetail{}, errors.Internal("repository history unavailable")
	}
	detail, err := reader.GetRepositoryCommit(ctx, strings.TrimSpace(owner), repository.Name, sha)
	if err != nil {
		return detail, repositoryCommitError(err)
	}
	patches, err := diffview.BuildChangeDiff(ctx, repositoryCommitDiffReader{s: s, detail: detail}, strings.TrimSpace(owner), repository.Name, sha, diffview.BuildOptions{})
	if err != nil {
		return repohost.RepositoryCommitDetail{}, repositoryCommitError(err)
	}
	for i, patch := range patches.FileDiffs {
		detail.Files[i].Patch = patch.Patch
		detail.Files[i].Binary = patch.IsBinary
		detail.Files[i].TooLarge = patch.TooLarge
	}
	return detail, nil
}

// repositoryCommitDiffReader adapts immutable history to the PR diff builder.
// File bytes keep the existing contents reader and its immutable cache.
type repositoryCommitDiffReader struct {
	s      *RepoService
	detail repohost.RepositoryCommitDetail
}

func (r repositoryCommitDiffReader) GetChange(context.Context, string, string, string) (repohost.Change, error) {
	change := repohost.Change{}
	if len(r.detail.Parents) > 0 {
		change.ParentCommitID = r.detail.Parents[0]
	}
	return change, nil
}
func (r repositoryCommitDiffReader) GetChangeDiff(context.Context, string, string, string) (repohost.ChangeDiff, error) {
	out := repohost.ChangeDiff{FileDiffs: make([]repohost.FileDiff, 0, len(r.detail.Files))}
	for _, file := range r.detail.Files {
		out.FileDiffs = append(out.FileDiffs, repohost.FileDiff{Path: file.Path, OldPath: file.From, ChangeType: file.Status})
	}
	return out, nil
}
func (r repositoryCommitDiffReader) GetFileAtChange(ctx context.Context, owner, repo, sha, path string) (repohost.FileContent, error) {
	if cached, ok := r.s.repoHost.(interface {
		GetFileAtCommit(context.Context, string, string, string, string) (repohost.FileContent, error)
	}); ok {
		return cached.GetFileAtCommit(ctx, owner, repo, sha, path)
	}
	return r.s.repoHost.GetFileAtChange(ctx, owner, repo, sha, path)
}
