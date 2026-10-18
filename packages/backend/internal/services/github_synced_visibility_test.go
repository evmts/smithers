package services

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

func TestGitHubSyncWritesSourceVisibility(t *testing.T) {
	f := newInstallPollFixture(t)
	ctx := context.Background()
	private := true
	reads := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/acme/app" {
			require.NotEmpty(t, r.Header.Get("Authorization"))
			reads++
			fmt.Fprintf(w, `{"id":100,"private":%t}`, private)
			return
		}
		f.upstream.Handler().ServeHTTP(w, r)
	}))
	defer server.Close()
	t.Setenv(envGitHubAppAPIBaseURL, server.URL)
	for _, value := range []bool{true, false, true} {
		private = value
		f.service.reconcileOnce(ctx)
		var got *bool
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT github_private FROM github_synced_repos WHERE id=$1`, f.row.ID).Scan(&got))
		require.NotNil(t, got)
		require.Equal(t, value, *got)
		f.clock.Add(120)
	}
	require.Equal(t, 3, reads)
}

func TestGitHubSyncVisibilityRejectsIncompleteRepository(t *testing.T) {
	for _, body := range []string{`{"id":100}`, `{"id":100,"private":null}`, `{"id":101,"private":false}`, `broken`} {
		t.Run(body, func(t *testing.T) {
			f := newInstallPollFixture(t)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/repos/acme/app" {
					fmt.Fprint(w, body)
					return
				}
				if r.Method == http.MethodPost {
					f.upstream.Handler().ServeHTTP(w, r)
					return
				}
				t.Errorf("metadata read before visibility confirmed: %s", r.URL.Path)
				http.Error(w, "unexpected", 500)
			}))
			defer server.Close()
			t.Setenv(envGitHubAppAPIBaseURL, server.URL)
			f.service.reconcileOnce(context.Background())
			var visibility *bool
			require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT github_private FROM github_synced_repos WHERE id=$1`, f.row.ID).Scan(&visibility))
			require.Nil(t, visibility)
		})
	}
}

func TestGitHubSyncVisibilityClearedOnRebind(t *testing.T) {
	f := newInstallPollFixture(t)
	ctx := context.Background()
	_, err := f.pool.Exec(ctx, `UPDATE github_synced_repos SET github_private=false WHERE id=$1`, f.row.ID)
	require.NoError(t, err)
	input := db.EnrollGitHubSyncedRepoParams{OwnerLogin: f.row.OwnerLogin, RepoName: f.row.RepoName, InstallationID: f.row.InstallationID, GithubRepositoryID: f.row.GithubRepositoryID, SyncMetadata: true, EnrolledVia: f.row.EnrolledVia}
	row, err := db.New(f.pool).EnrollGitHubSyncedRepo(ctx, input)
	require.NoError(t, err)
	require.True(t, row.GithubPrivate.Valid, "same source keeps receipt")
	input.GithubRepositoryID.Int64++
	row, err = db.New(f.pool).EnrollGitHubSyncedRepo(ctx, input)
	require.NoError(t, err)
	require.False(t, row.GithubPrivate.Valid, "a different source needs a new receipt")
}

func TestGitHubSyncWritesSourceVisibilityHosted(t *testing.T) {
	pool := newProductTestPool(t)
	ctx := context.Background()
	q := db.New(pool)
	row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app", InstallationID: pgtype.Int8{Int64: 91, Valid: true}, GithubRepositoryID: pgtype.Int8{Int64: 100, Valid: true}, SyncMetadata: true, EnrolledVia: GitHubSyncedRepoEnrolledViaInstallation})
	require.NoError(t, err)
	minter, upstream := newScopedTokenMinter(t)
	private := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/acme/app" {
			require.NotEmpty(t, r.Header.Get("Authorization"))
			fmt.Fprintf(w, `{"id":100,"private":%t}`, private)
			return
		}
		upstream.Handler().ServeHTTP(w, r)
	}))
	defer server.Close()
	t.Setenv(envGitHubAppAPIBaseURL, server.URL)
	client := NewGitHubUserReposService(q, nil)
	service := NewGitHubSyncedRepoService(q)
	service.SetFetcherFactory(client.SyncedRepoInstallationFetcherFactory(minter))
	for _, value := range []bool{true, false} {
		private = value
		require.NoError(t, service.backfill(ctx, row, service.preferredFetcher(row, nil)))
		current, err := q.GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: row.OwnerLogin, RepoName: row.RepoName})
		require.NoError(t, err)
		require.True(t, current.GithubPrivate.Valid)
		require.Equal(t, value, current.GithubPrivate.Bool)
	}
}
