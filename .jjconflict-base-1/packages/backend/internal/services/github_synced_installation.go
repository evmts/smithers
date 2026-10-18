package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// GitHubSyncedRepoInstallationResolver discovers a source through the App's
// repository installation lookup, without a signed-in user's credentials.
type GitHubSyncedRepoInstallationResolver func(context.Context, db.GithubSyncedRepo) (installationID, repositoryID int64, err error)

// SetInstallationResolver wires App discovery before the reconciler starts.
func (s *GitHubSyncedRepoService) SetInstallationResolver(resolve GitHubSyncedRepoInstallationResolver) {
	s.installationResolver = resolve
}

// SyncedRepoInstallationResolver reuses App JWT lookup and metadata-only
// installation tokens. Discovery never grants a user access to the source.
func (s *GitHubUserReposService) SyncedRepoInstallationResolver(issuer GitHubInstallationTokenMinter) GitHubSyncedRepoInstallationResolver {
	return func(ctx context.Context, row db.GithubSyncedRepo) (int64, int64, error) {
		installation, found, err := s.lookupRepoInstallation(ctx, row.OwnerLogin, row.RepoName)
		if err != nil {
			return 0, 0, err
		}
		if !found {
			return 0, 0, nil
		}
		if !strings.EqualFold(installation.Account.Login, row.OwnerLogin) {
			return 0, 0, fmt.Errorf("GitHub installation owner changed")
		}
		if issuer == nil {
			return 0, 0, ErrGitHubAppNotConfigured
		}
		scope := GitHubTokenScope{Permissions: map[string]string{"metadata": "read"}}
		if row.GithubRepositoryID.Valid {
			scope.RepositoryIDs = []int64{row.GithubRepositoryID.Int64}
		} else {
			scope.AllRepositories = true
		}
		token, err := issuer.CreateGitHubInstallationToken(ctx, installation.ID, scope)
		if err != nil {
			return 0, 0, err
		}
		if token.Token == "" || token.InstallationID != installation.ID {
			return 0, 0, gitHubFetchUnavailable()
		}
		result, err := s.requestGitHubRepoObject(ctx, token.Token, row.OwnerLogin, row.RepoName)
		if err != nil {
			return 0, 0, err
		}
		var source struct {
			ID    int64  `json:"id"`
			Name  string `json:"name"`
			Owner struct {
				Login string `json:"login"`
			} `json:"owner"`
		}
		if err := json.Unmarshal(result.Body, &source); err != nil {
			return 0, 0, err
		}
		if source.ID <= 0 || !strings.EqualFold(source.Owner.Login, row.OwnerLogin) || !strings.EqualFold(source.Name, row.RepoName) || (row.GithubRepositoryID.Valid && row.GithubRepositoryID.Int64 != source.ID) {
			return 0, 0, fmt.Errorf("GitHub repository identity changed")
		}
		return installation.ID, source.ID, nil
	}
}

func (s *GitHubSyncedRepoService) bindReconcileInstallation(ctx context.Context, row db.GithubSyncedRepo) (db.GithubSyncedRepo, error) {
	if row.InstallationID.Valid || s.installationResolver == nil {
		return row, nil
	}
	installationID, repositoryID, err := s.installationResolver(ctx, row)
	if err != nil {
		return row, err
	}
	if installationID <= 0 || repositoryID <= 0 {
		return row, nil
	}
	return s.store.BindGitHubSyncedRepoInstallation(ctx, db.BindGitHubSyncedRepoInstallationParams{
		ID: row.ID, OwnerLogin: row.OwnerLogin, RepoName: row.RepoName,
		InstallationID: nullableSyncedRepoInt64(installationID), GithubRepositoryID: nullableSyncedRepoInt64(repositoryID),
	})
}
