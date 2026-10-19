package services

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

// Hosted composition leaves GitHubSyncedRepoService.install nil, so webhook
// payloads are written to the shared cache directly. A delivery that does not
// show a public repository must close a warm public receipt first
// (guardian-review b-sgrzop).
func TestHostedWebhookClosesWarmPublicVisibilityUnlessPublic(t *testing.T) {
	for _, repository := range []struct {
		name   string
		json   string
		closes bool
	}{
		{"private", `{"id":100,"name":"widget","full_name":"octo/widget","private":true,"visibility":"private","owner":{"login":"octo"}}`, true},
		{"internal", `{"id":100,"name":"widget","full_name":"octo/widget","private":false,"visibility":"internal","owner":{"login":"octo"}}`, true},
		{"visibility missing", `{"id":100,"name":"widget","full_name":"octo/widget","private":false,"owner":{"login":"octo"}}`, true},
		{"public", `{"id":100,"name":"widget","full_name":"octo/widget","private":false,"visibility":"public","owner":{"login":"octo"}}`, false},
	} {
		for _, event := range []string{"issues", "pull_request", "issue_comment", "repository", "push"} {
			t.Run(repository.name+"/"+event, func(t *testing.T) {
				ctx := context.Background()
				store := newFakeSyncedRepoStore()
				synced := NewGitHubSyncedRepoService(store)
				require.Nil(t, synced.install, "exercise hosted topology, not install polling")
				row, err := synced.EnrollGitHubRepo(ctx, EnrollGitHubRepoInput{
					Owner: "octo", Repo: "widget", InstallationID: 41, GitHubRepositoryID: 100,
				})
				require.NoError(t, err)
				require.NoError(t, store.MarkGitHubSyncedRepoSynced(ctx, row.ID))
				store.repos[syncedRepoKey("octo", "widget")].GithubPrivate = pgtype.Bool{Bool: false, Valid: true}
				var envelope gitHubWebhookEnvelope
				require.NoError(t, json.Unmarshal([]byte(`{
					"repository":`+repository.json+`,
					"issue":{"id":1,"number":4,"state":"open","title":"NEW_ITEM","comments":1,"updated_at":"2026-10-18T23:00:00Z"},
					"pull_request":{"id":2,"number":11,"state":"open","title":"NEW_PULL","updated_at":"2026-10-18T23:00:00Z"},
					"comment":{"id":900,"body":"NEW_COMMENT","updated_at":"2026-10-18T23:00:00Z"}
				}`), &envelope))
				webhook := NewGitHubWebhookService(nil, nil, WithGitHubWebhookSyncedRepos(synced))
				webhook.applySyncedRepoEvent(ctx, event, "created", envelope)
				visibility := store.repoByID(row.ID).GithubPrivate
				if repository.closes {
					require.False(t, visibility.Valid, "a delivery that does not show a public repository closes anonymous access")
				} else {
					require.Equal(t, pgtype.Bool{Bool: false, Valid: true}, visibility, "a public delivery leaves the sync's receipt alone")
				}
			})
		}
	}
}
