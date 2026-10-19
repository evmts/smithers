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
	// An unqualified repository never reaches GitHub, not even for a token.
	if s.install != nil {
		if err := s.authorizeFetched(ctx, row); err != nil {
			return s.forgetSourceVisibility(ctx, row, err)
		}
	}
	// Deliberately discard the commit closure: visibility requires a fresh body,
	// never a committed ETag/304 that could preserve a revoked public receipt.
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
		ID         int64  `json:"id"`
		Private    *bool  `json:"private"`
		Visibility string `json:"visibility"`
	}
	if err := json.Unmarshal(body, &source); err != nil {
		return s.forgetSourceVisibility(ctx, row, fmt.Errorf("decode GitHub repository visibility: %w", err))
	}
	if source.ID != row.GithubRepositoryID.Int64 || source.Private == nil || (source.Visibility != "public" && source.Visibility != "private" && source.Visibility != "internal") {
		return s.forgetSourceVisibility(ctx, row, fmt.Errorf("GitHub repository visibility missing or identity changed"))
	}
	return s.setSourceVisibility(ctx, row, pgtype.Bool{Bool: *source.Private, Valid: true}, pgtype.Text{String: source.Visibility, Valid: true})
}

// forgetSourceVisibility closes a previously public source when GitHub
// refuses the repository or answers without a usable visibility: unknown
// counts as private until a later sync confirms it again.
func (s *GitHubSyncedRepoService) forgetSourceVisibility(ctx context.Context, row db.GithubSyncedRepo, cause error) error {
	if err := s.setSourceVisibility(ctx, row, pgtype.Bool{}, pgtype.Text{}); err != nil {
		return errors.Join(cause, err)
	}
	return cause
}

func (s *GitHubSyncedRepoService) setSourceVisibility(ctx context.Context, row db.GithubSyncedRepo, visibility pgtype.Bool, reported pgtype.Text) error {
	return s.store.SetGitHubSyncedRepoVisibility(ctx, db.SetGitHubSyncedRepoVisibilityParams{
		ID: row.ID, InstallationID: row.InstallationID, GithubRepositoryID: row.GithubRepositoryID,
		OwnerLogin: row.OwnerLogin, RepoName: row.RepoName,
		GithubPrivate: visibility, GithubVisibility: reported, VisibilityGeneration: row.VisibilityGeneration,
	})
}

// CloseSourceVisibility forgets a public visibility receipt when a webhook
// delivery cannot show that the repository is public. Only a sync re-opens it.
func (s *GitHubSyncedRepoService) CloseSourceVisibility(ctx context.Context, owner, repo string, githubRepoID int64) error {
	row, ok, err := s.lookupEnrolled(ctx, owner, repo, githubRepoID)
	if err != nil || !ok {
		return err
	}
	if row.GithubPrivate.Valid && row.GithubPrivate.Bool {
		// Already closed; clearing it would only queue a full backfill per delivery.
		return nil
	}
	return s.setSourceVisibility(ctx, row, pgtype.Bool{}, pgtype.Text{})
}

// githubSourceIsPublic is the shared visibility gate for source discovery and
// anonymous metadata. A failed mirror cannot serve its last public receipt.
func githubSourceIsPublic(row db.GithubSyncedRepo) bool {
	return row.GithubPrivate.Valid && !row.GithubPrivate.Bool && row.GithubVisibility.Valid && row.GithubVisibility.String == "public" && row.SyncState != "failed" && row.SyncState != "disabled"
}
