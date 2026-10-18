package services

import (
	"context"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"strings"
)

// RepositoryBranch enriches the existing bookmark projection with its immutable head.
type RepositoryBranch struct {
	Name      string `json:"name"`
	Head      string `json:"head"`
	Author    string `json:"author"`
	Updated   string `json:"updated"`
	Title     string `json:"title"`
	IsDefault bool   `json:"is_default"`
}

// RepositoryBranchPage uses the existing bookmark cursor without an alternate ref reader.
type RepositoryBranchPage struct {
	Items      []RepositoryBranch `json:"items"`
	NextCursor string             `json:"next_cursor,omitempty"`
}

// ListRepositoryBranches reuses ListBookmarks and history for head metadata.
func (s *RepoService) ListRepositoryBranches(ctx context.Context, viewer *db.User, owner, repo, cursor string, limit int) (RepositoryBranchPage, error) {
	repository, err := s.resolveReadableRepo(ctx, viewer, owner, repo)
	if err != nil {
		return RepositoryBranchPage{}, err
	}
	if limit < 1 || limit > 100 {
		return RepositoryBranchPage{}, errors.BadRequest("invalid branch limit")
	}
	reader, ok := s.repoHost.(repositoryCommitReader)
	if !ok {
		return RepositoryBranchPage{}, errors.Internal("repository history unavailable")
	}
	owner = strings.TrimSpace(owner)
	bookmarks, next, err := s.repoHost.ListBookmarks(ctx, owner, repository.Name, cursor, limit)
	if err != nil {
		return RepositoryBranchPage{}, repositoryCommitError(err)
	}
	page := RepositoryBranchPage{Items: make([]RepositoryBranch, 0, len(bookmarks)), NextCursor: next}
	for _, bookmark := range bookmarks {
		head := bookmark.TargetCommitID
		var err error
		if !immutableCommitSHA(head) {
			head, err = s.resolveContentsCommit(ctx, owner, repository.Name, bookmark.Name)
		}
		if err != nil {
			return RepositoryBranchPage{}, err
		}
		history, err := reader.ListRepositoryCommits(ctx, owner, repository.Name, head, "", "", 1)
		if err != nil {
			return RepositoryBranchPage{}, repositoryCommitError(err)
		}
		if len(history.Items) != 1 || history.Items[0].SHA != head {
			return RepositoryBranchPage{}, errors.Internal("invalid branch head")
		}
		commit := history.Items[0]
		page.Items = append(page.Items, RepositoryBranch{Name: bookmark.Name, Head: head, Author: commit.Author, Updated: commit.CommittedAt, Title: commit.Title, IsDefault: bookmark.Name == repository.DefaultBookmark})
	}
	return page, nil
}
