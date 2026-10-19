package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// refreshSourceVisibility runs only inside sync, using its installation token.
// Missing or malformed visibility never becomes a public visibility receipt.
func (s *GitHubSyncedRepoService) refreshSourceVisibility(ctx context.Context, row db.GithubSyncedRepo, fetch gitHubSyncedRepoPageFetcher) error {
	if !row.InstallationID.Valid || !row.GithubRepositoryID.Valid {
		return nil
	}
	fetch, _ = s.conditionalPages(row, fetch)
	if fetch == nil {
		return gitHubFetchUnavailable()
	}
	body, err := fetch(ctx, "", nil)
	if err != nil {
		var limited *pkgerrors.APIError
		if ctx.Err() != nil || errors.As(err, &limited) && limited.Code == pkgerrors.CodeGitHubRateLimited {
			// A cancelled sync or a rate limit says nothing about the
			// repository; the stream's pause retries and keeps the receipt.
			return err
		}
		// GitHub refused the repository or gave no usable answer.
		return s.forgetSourceVisibility(ctx, row, err)
	}
	var source struct {
		ID      int64 `json:"id"`
		Private *bool `json:"private"`
	}
	if err := json.Unmarshal(body, &source); err != nil {
		return s.forgetSourceVisibility(ctx, row, fmt.Errorf("decode GitHub repository visibility: %w", err))
	}
	if source.ID != row.GithubRepositoryID.Int64 || source.Private == nil {
		return s.forgetSourceVisibility(ctx, row, fmt.Errorf("GitHub repository visibility missing or identity changed"))
	}
	return s.setSourceVisibility(ctx, row, pgtype.Bool{Bool: *source.Private, Valid: true})
}

// forgetSourceVisibility closes a previously public source when GitHub
// refuses the repository or answers without a usable visibility: unknown
// counts as private until a later sync confirms it again.
func (s *GitHubSyncedRepoService) forgetSourceVisibility(ctx context.Context, row db.GithubSyncedRepo, cause error) error {
	if err := s.setSourceVisibility(ctx, row, pgtype.Bool{}); err != nil {
		return errors.Join(cause, err)
	}
	return cause
}

func (s *GitHubSyncedRepoService) setSourceVisibility(ctx context.Context, row db.GithubSyncedRepo, visibility pgtype.Bool) error {
	return s.store.SetGitHubSyncedRepoVisibility(ctx, db.SetGitHubSyncedRepoVisibilityParams{
		ID: row.ID, InstallationID: row.InstallationID, GithubRepositoryID: row.GithubRepositoryID,
		OwnerLogin: row.OwnerLogin, RepoName: row.RepoName,
		GithubPrivate: visibility,
	})
}

// CloseSourceVisibility forgets a public visibility receipt when a webhook
// delivery cannot show that the repository is public. Only a sync re-opens it.
func (s *GitHubSyncedRepoService) CloseSourceVisibility(ctx context.Context, owner, repo string, githubRepoID int64) error {
	row, ok, err := s.lookupEnrolled(ctx, owner, repo, githubRepoID)
	if err != nil || !ok || !row.GithubPrivate.Valid || row.GithubPrivate.Bool {
		return err
	}
	return s.setSourceVisibility(ctx, row, pgtype.Bool{})
}
