package services

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
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
		return err
	}
	var source struct {
		ID      int64 `json:"id"`
		Private *bool `json:"private"`
	}
	if err := json.Unmarshal(body, &source); err != nil {
		return fmt.Errorf("decode GitHub repository visibility: %w", err)
	}
	if source.ID != row.GithubRepositoryID.Int64 || source.Private == nil {
		return fmt.Errorf("GitHub repository visibility missing or identity changed")
	}
	return s.store.SetGitHubSyncedRepoVisibility(ctx, db.SetGitHubSyncedRepoVisibilityParams{
		ID: row.ID, InstallationID: row.InstallationID, GithubRepositoryID: row.GithubRepositoryID,
		OwnerLogin: row.OwnerLogin, RepoName: row.RepoName,
		GithubPrivate: pgtype.Bool{Bool: *source.Private, Valid: true},
	})
}
