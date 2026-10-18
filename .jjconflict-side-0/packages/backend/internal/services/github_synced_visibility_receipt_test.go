package services

import (
	"context"
	"encoding/json"
	"net/url"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

// Migration 0173 added github_visibility and nulled github_private. During the
// rollout a replica still on the old code re-read five rows and wrote
// github_private=false without github_visibility (prod 2026-10-19
// 16:16-16:17Z, the launch repository's source among them). Only a complete
// receipt opens the door to visitors, so such a row must be read from GitHub
// again on the next sweep, not after its cadence (8 h with a fresh webhook).
func TestHostedReconcileRereadsAVisibilityReceiptWithoutVisibility(t *testing.T) {
	ctx := context.Background()
	store := newFakeSyncedRepoStore()
	synced := NewGitHubSyncedRepoService(store)
	require.Nil(t, synced.install, "exercise hosted topology, not install polling")
	var reads atomic.Int64
	synced.SetFetcherFactory(func(db.GithubSyncedRepo) GitHubSyncedRepoPageFetcher {
		return func(_ context.Context, resource string, _ url.Values) (json.RawMessage, error) {
			if resource == "" {
				reads.Add(1)
				return json.RawMessage(`{"id":100,"private":false,"visibility":"public"}`), nil
			}
			return json.RawMessage(`[]`), nil
		}
	})
	row, err := synced.EnrollGitHubRepo(ctx, EnrollGitHubRepoInput{
		Owner: "octo", Repo: "widget", InstallationID: 41, GitHubRepositoryID: 100,
	})
	require.NoError(t, err)
	require.NoError(t, store.MarkGitHubSyncedRepoSynced(ctx, row.ID))
	store.repos[syncedRepoKey("octo", "widget")].GithubPrivate = pgtype.Bool{Bool: false, Valid: true}
	require.False(t, githubSourceIsPublic(store.repoByID(row.ID)), "a receipt without visibility keeps the door closed")

	synced.reconcileOnce(ctx)

	require.Positive(t, reads.Load(), "the incomplete receipt is read from GitHub on the next sweep")
	got := store.repoByID(row.ID)
	require.Equal(t, pgtype.Text{String: "public", Valid: true}, got.GithubVisibility)
	require.True(t, githubSourceIsPublic(got), "GitHub's own read reopens the door")
}
