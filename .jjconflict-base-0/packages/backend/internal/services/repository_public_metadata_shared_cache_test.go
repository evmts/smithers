package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

// One upstream feeds one shared cache row. User A keeps a public mirror of
// acme/app; user B imports the same upstream privately and B's authorized
// installation keeps syncing it. When the upstream turns private, B's next
// sync must close A's anonymous door, so B's private updates are never
// served through A's still-public mirror (guardian-review s-pwpr3c).
func TestPublicMetadataSharedCacheClosesWhenUpstreamTurnsPrivate(t *testing.T) {
	f := newInstallPollFixture(t)
	ctx := context.Background()
	private := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/acme/app" {
			fmt.Fprintf(w, `{"id":100,"private":%t}`, private)
			return
		}
		f.upstream.Handler().ServeHTTP(w, r)
	}))
	defer server.Close()
	t.Setenv(envGitHubAppAPIBaseURL, server.URL)

	_, err := f.pool.Exec(ctx, `INSERT INTO users(id,username,lower_username) VALUES(2001,'usera','usera'),(2002,'userb','userb'),(2003,'stranger','stranger')`)
	require.NoError(t, err)
	for _, local := range []struct {
		owner  int64
		name   string
		public bool
	}{{2001, "mirror", true}, {2002, "private", false}} {
		var id int64
		require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public) VALUES($1,$2,$2,$3) RETURNING id`, local.owner, local.name, local.public).Scan(&id))
		owner := map[int64]string{2001: "usera", 2002: "userb"}[local.owner]
		_, err = f.pool.Exec(ctx, `INSERT INTO import_jobs(user_id,github_owner,github_repo,repo_owner,repo_name,branch,status,repository_id) VALUES($1,'acme','app',$2,$3,'main','ready',$4)`, local.owner, owner, local.name, id)
		require.NoError(t, err)
	}
	svc := NewRepoServiceWithPool(db.New(f.pool), &mockRepoHostClient{}, "s1", f.pool)
	sync := func(upstreamPrivate bool) {
		private = upstreamPrivate
		f.clock.Add(120)
		f.service.reconcileOnce(ctx)
		var got *bool
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT github_private FROM github_synced_repos WHERE id=$1`, f.row.ID).Scan(&got))
		require.NotNil(t, got)
		require.Equal(t, upstreamPrivate, *got)
		// The cached records stand for what B's installation fetched.
		_, err := f.pool.Exec(ctx, `UPDATE github_synced_repos SET sync_state='ready', last_synced_at=COALESCE(last_synced_at, now()) WHERE id=$1`, f.row.ID)
		require.NoError(t, err)
	}
	resources := []string{"issues", "issues/7", "issues/7/comments", "pulls", "pulls/7", "pulls/7/comments"}

	sync(false)
	for _, resource := range []string{"issues", "pulls"} {
		_, err = f.pool.Exec(ctx, `INSERT INTO github_synced_issues(synced_repo_id,resource,number,github_id,payload) VALUES($1,$2,7,7,'{"number":7,"title":"Public item","state":"open","comments":0}') ON CONFLICT DO NOTHING`, f.row.ID, resource)
		require.NoError(t, err)
	}
	_, err = svc.ReadPublicRepositoryMetadata(ctx, nil, "usera", "mirror", "issues/7", nil)
	require.NoError(t, err, "a public upstream is readable through the public mirror")

	sync(true)
	_, err = f.pool.Exec(ctx, `UPDATE github_synced_issues SET payload='{"number":7,"title":"Private item","state":"open","comments":0}' WHERE synced_repo_id=$1`, f.row.ID)
	require.NoError(t, err)
	for _, viewer := range []*db.User{nil, {ID: 2003}, {ID: 2001}} {
		for _, resource := range resources {
			result, err := svc.ReadPublicRepositoryMetadata(ctx, viewer, "usera", "mirror", resource, nil)
			require.Equal(t, 404, apiStatus(t, err), "viewer %v read %s: %s", viewer, resource, result.Body)
			require.NotContains(t, string(result.Body), "Private item")
		}
		_, err = svc.ReadPublicRepositoryMetadata(ctx, viewer, "userb", "private", "issues", nil)
		require.Error(t, err)
	}
}

// Hosted deliveries write the shared cache directly (no install polling). A
// private delivery for a warm public source must close the door before its
// payload can be read anonymously (guardian-review b-sgrzop).
func TestPublicMetadataHostedPrivateWebhookKeepsDoorClosed(t *testing.T) {
	pool := newProductTestPool(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO users(id,username,lower_username) VALUES(2001,'usera','usera')`)
	require.NoError(t, err)
	var repositoryID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public) VALUES(2001,'mirror','mirror',true) RETURNING id`).Scan(&repositoryID))
	_, err = pool.Exec(ctx, `INSERT INTO import_jobs(user_id,github_owner,github_repo,repo_owner,repo_name,branch,status,repository_id) VALUES(2001,'acme','app','usera','mirror','main','ready',$1)`, repositoryID)
	require.NoError(t, err)
	row, err := db.New(pool).EnrollGitHubSyncedRepo(ctx, db.EnrollGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app", InstallationID: pgtype.Int8{Int64: 91, Valid: true}, GithubRepositoryID: pgtype.Int8{Int64: 100, Valid: true}, SyncMetadata: true, EnrolledVia: GitHubSyncedRepoEnrolledViaInstallation})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE github_synced_repos SET github_private=false, sync_state='ready', last_synced_at=now(), last_webhook_at=now() WHERE id=$1`, row.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO github_synced_issues(synced_repo_id,resource,number,github_id,payload) VALUES($1,'issues',7,7,'{"number":7,"title":"Public item","state":"open","comments":0}')`, row.ID)
	require.NoError(t, err)
	repos := NewRepoServiceWithPool(db.New(pool), &mockRepoHostClient{}, "s1", pool)
	_, err = repos.ReadPublicRepositoryMetadata(ctx, nil, "usera", "mirror", "issues/7", nil)
	require.NoError(t, err, "the warm public door serves before the private delivery")

	synced := NewGitHubSyncedRepoService(db.New(pool))
	require.Nil(t, synced.install, "hosted topology")
	webhook := NewGitHubWebhookService(nil, nil, WithGitHubWebhookSyncedRepos(synced))
	for _, event := range []string{"issues", "pull_request", "issue_comment"} {
		var envelope gitHubWebhookEnvelope
		require.NoError(t, json.Unmarshal([]byte(`{
			"repository":{"id":100,"name":"app","full_name":"acme/app","private":true,"visibility":"private","owner":{"login":"acme"}},
			"issue":{"id":8,"number":8,"state":"open","title":"PRIVATE_NEW_ITEM","comments":1,"created_at":"2026-10-18T23:00:00Z","updated_at":"2026-10-18T23:00:00Z"},
			"pull_request":{"id":11,"number":11,"state":"open","title":"PRIVATE_NEW_PULL","created_at":"2026-10-18T23:00:00Z","updated_at":"2026-10-18T23:00:00Z"},
			"comment":{"id":900,"issue_url":"https://api.github.com/repos/acme/app/issues/8","body":"PRIVATE_NEW_COMMENT","created_at":"2026-10-18T23:00:00Z","updated_at":"2026-10-18T23:00:00Z"}
		}`), &envelope))
		webhook.applySyncedRepoEvent(ctx, event, "opened", envelope)
	}
	var visibility *bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT github_private FROM github_synced_repos WHERE id=$1`, row.ID).Scan(&visibility))
	require.Nil(t, visibility)
	for _, resource := range []string{"issues", "issues/7", "issues/8", "issues/8/comments", "pulls", "pulls/11", "pulls/11/comments"} {
		result, err := repos.ReadPublicRepositoryMetadata(ctx, nil, "usera", "mirror", resource, nil)
		require.Equal(t, 404, apiStatus(t, err), "anonymous read %s: %s", resource, result.Body)
		require.NotContains(t, string(result.Body), "PRIVATE_NEW")
	}
}
