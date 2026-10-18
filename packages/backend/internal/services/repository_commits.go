package services

import (
	"context"
	"github.com/smithersai/smithers/packages/backend/internal/db"
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
	return detail, repositoryCommitError(err)
}
