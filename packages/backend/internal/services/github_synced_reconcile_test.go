package services

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

func TestSyncedRepos_ReconcilerDoesNotStarveBehindCredentialGaps(t *testing.T) {
	pool := newProductTestPool(t)
	q := db.New(pool)
	ctx := context.Background()
	service := NewGitHubSyncedRepoService(q)
	for i := 0; i < 25; i++ {
		_, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: fmt.Sprintf("unbound-%d", i), SyncMetadata: true, EnrolledVia: "import"})
		require.NoError(t, err)
	}
	row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: "serviceable", InstallationID: pgtype.Int8{Int64: 42, Valid: true}, SyncMetadata: true, EnrolledVia: "import"})
	require.NoError(t, err)
	service.SetFetcherFactory(func(db.GithubSyncedRepo) GitHubSyncedRepoPageFetcher { return fixedIssuesFetcher(0, nil) })
	claimed := false
	service.syncDone = func(id int64, _ error) {
		if id == row.ID {
			claimed = true
		}
	}
	service.reconcileOnce(ctx)
	service.reconcileOnce(ctx)
	require.True(t, claimed, "serviceable row must be claimed within two sweeps")
	var synced bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT last_synced_at IS NOT NULL FROM github_synced_repos WHERE repo_name='unbound-0'`).Scan(&synced))
	require.False(t, synced, "deferring credentials must not fabricate a sync")
}

func TestSyncedRepos_ReconcilerDiscoversImportInstallation(t *testing.T) {
	for _, outcome := range []string{"visible", "absent", "wrong-owner", "wrong-repo"} {
		t.Run(outcome, func(t *testing.T) {
			pool := newProductTestPool(t)
			q := db.New(pool)
			ctx := context.Background()
			minter, upstream := newScopedTokenMinter(t)
			order := []string{}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasSuffix(r.URL.Path, "/installation") {
					require.True(t, strings.HasPrefix(r.Header.Get("Authorization"), "Bearer "))
					order = append(order, "installation")
					if outcome == "absent" {
						http.NotFound(w, r)
						return
					}
					owner := "acme"
					if outcome == "wrong-owner" {
						owner = "other"
					}
					fmt.Fprintf(w, `{"id":91,"account":{"login":%q}}`, owner)
					return
				}
				if r.URL.Path == "/repos/acme/app" {
					order = append(order, "repository")
					name := "app"
					if outcome == "wrong-repo" {
						name = "other"
					}
					fmt.Fprintf(w, `{"id":100,"name":%q,"owner":{"login":"acme"},"private":false}`, name)
					return
				}
				if r.Method == "GET" {
					order = append(order, "discussion")
				}
				upstream.Handler().ServeHTTP(w, r)
			}))
			defer server.Close()
			t.Setenv(envGitHubAppAPIBaseURL, server.URL)
			service := NewGitHubSyncedRepoService(q)
			client := NewGitHubUserReposService(q, nil, WithGitHubUserReposCredentialStore(minter.githubAppCredentials), WithGitHubUserReposHTTPClient(server.Client()), WithGitHubUserReposSyncedStore(service))
			service.SetFetcherFactory(client.SyncedRepoInstallationFetcherFactory(minter))
			service.SetInstallationResolver(client.SyncedRepoInstallationResolver(minter))
			row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app", SyncMetadata: true, EnrolledVia: "import"})
			require.NoError(t, err)
			service.reconcileOnce(ctx)
			got, err := q.GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app"})
			require.NoError(t, err)
			if outcome == "visible" {
				require.Equal(t, int64(91), got.InstallationID.Int64)
				require.Equal(t, int64(100), got.GithubRepositoryID.Int64)
				require.True(t, got.LastSyncedAt.Valid)
				require.True(t, got.GithubPrivate.Valid)
				require.False(t, got.GithubPrivate.Bool)
				require.GreaterOrEqual(t, len(order), 4)
				require.Equal(t, []string{"installation", "repository", "repository", "discussion"}, order[:4], "visibility is refreshed before discussion sync")
			} else {
				require.False(t, got.InstallationID.Valid)
				require.False(t, got.LastSyncedAt.Valid)
				require.NotContains(t, order, "discussion")
				due, err := q.ListDueGitHubSyncedRepos(ctx, 20)
				require.NoError(t, err)
				require.Empty(t, due, "unserviceable row must be backed off")
			}
			require.Equal(t, row.ID, got.ID)
		})
	}
}

func TestSyncedRepos_ReconcilerDoesNotStarveBehindBudget(t *testing.T) {
	pool := newProductTestPool(t)
	q := db.New(pool)
	ctx := context.Background()
	budget := NewBudgetTrackerWithLimits(1, time.Hour)
	allowed, _ := budget.Allow(42)
	require.True(t, allowed)
	service := NewGitHubSyncedRepoService(q, WithGitHubSyncedRepoBudget(budget))
	for i := 0; i < 25; i++ {
		_, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: fmt.Sprintf("limited-%d", i), InstallationID: pgtype.Int8{Int64: 42, Valid: true}, SyncMetadata: true, EnrolledVia: "import"})
		require.NoError(t, err)
	}
	row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: "available", InstallationID: pgtype.Int8{Int64: 43, Valid: true}, SyncMetadata: true, EnrolledVia: "import"})
	require.NoError(t, err)
	service.SetFetcherFactory(func(db.GithubSyncedRepo) GitHubSyncedRepoPageFetcher { return fixedIssuesFetcher(0, nil) })
	claimed := false
	service.syncDone = func(id int64, _ error) {
		if id == row.ID {
			claimed = true
		}
	}
	service.reconcileOnce(ctx)
	service.reconcileOnce(ctx)
	require.True(t, claimed, "exhausted installation must not block other installations")
}

func TestSyncedRepos_ReconcileDeferralKeepsFullSyncReceiptAndLogThrottle(t *testing.T) {
	pool := newProductTestPool(t)
	q := db.New(pool)
	ctx := context.Background()
	row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: "widget", SyncMetadata: true, EnrolledVia: "import"})
	require.NoError(t, err)
	require.NoError(t, q.MarkGitHubSyncedRepoSynced(ctx, row.ID))
	row, err = q.GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: "widget"})
	require.NoError(t, err)
	service := NewGitHubSyncedRepoService(q)
	next := time.Now().Add(time.Hour)
	service.deferReconcile(ctx, row, next, "no_fetcher")
	service.deferReconcile(ctx, row, next, "installation_budget")
	got, err := q.GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: "widget"})
	require.NoError(t, err)
	require.Equal(t, row.LastSyncedAt, got.LastSyncedAt)
	require.Equal(t, row.SyncState, got.SyncState)
	require.Zero(t, got.ConsecutiveFailures)
	require.False(t, got.SyncingSince.Valid)
	require.True(t, got.NextReconcileAt.Valid)
	require.WithinDuration(t, next, got.NextReconcileAt.Time, time.Microsecond)
	claimed, err := q.ClaimGitHubSyncedRepoSkipLog(ctx, row.ID)
	require.NoError(t, err)
	require.Zero(t, claimed, "another replica must not log the row again this hour")
	_, err = pool.Exec(ctx, `UPDATE github_synced_repos SET reconcile_skip_logged_at=NOW()-INTERVAL '1 hour',next_reconcile_at=NOW()-INTERVAL '1 second' WHERE id=$1`, row.ID)
	require.NoError(t, err)
	claimed, err = q.ClaimGitHubSyncedRepoSkipLog(ctx, row.ID)
	require.NoError(t, err)
	require.EqualValues(t, 1, claimed)
	due, err := q.ListDueGitHubSyncedRepos(ctx, 20)
	require.NoError(t, err)
	require.Len(t, due, 1, "deferred row must become eligible again")
}

func TestSyncedRepos_InstallationBindingGuardsConcurrentSourceChanges(t *testing.T) {
	for _, mutation := range []string{"installation_id=92", "owner_login='other',owner_login_lower='other'", "repo_name='other',repo_name_lower='other'", "github_repository_id=101"} {
		t.Run(mutation, func(t *testing.T) {
			pool := newProductTestPool(t)
			q := db.New(pool)
			ctx := context.Background()
			row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app", SyncMetadata: true, EnrolledVia: "import"})
			require.NoError(t, err)
			service := NewGitHubSyncedRepoService(q)
			service.SetInstallationResolver(func(ctx context.Context, _ db.GithubSyncedRepo) (int64, int64, error) {
				// A webhook or transfer wins while the App lookup is in flight.
				_, err := pool.Exec(ctx, "UPDATE github_synced_repos SET "+mutation+" WHERE id=$1", row.ID)
				require.NoError(t, err)
				return 91, 100, nil
			})
			_, err = service.bindReconcileInstallation(ctx, row)
			require.Error(t, err, "a changed source must not receive the looked-up installation")
			var bound bool
			require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(installation_id=91,false) FROM github_synced_repos WHERE id=$1`, row.ID).Scan(&bound))
			require.False(t, bound)
		})
	}
}

func TestSyncedRepos_UntouchedNeverSyncedRowsPrecedeExpiredRetries(t *testing.T) {
	pool := newProductTestPool(t)
	q := db.New(pool)
	ctx := context.Background()
	retryAt := time.Now().Add(-time.Minute)
	for i := 0; i < 25; i++ {
		row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: fmt.Sprintf("retry-%d", i), SyncMetadata: true, EnrolledVia: "import"})
		require.NoError(t, err)
		require.NoError(t, q.DeferGitHubSyncedRepoSync(ctx, db.DeferGitHubSyncedRepoSyncParams{ID: row.ID, NextReconcileAt: pgtype.Timestamptz{Time: retryAt, Valid: true}}))
	}
	row, err := q.EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "octo", RepoName: "untouched", SyncMetadata: true, EnrolledVia: "import"})
	require.NoError(t, err)
	due, err := q.ListDueGitHubSyncedRepos(ctx, 20)
	require.NoError(t, err)
	require.Len(t, due, 20)
	require.Equal(t, row.ID, due[0].ID, "expired low-id retries cannot monopolize the next batch")
	require.Less(t, due[1].ID, due[2].ID, "equal retry deadlines retain oldest-first ordering")
}
