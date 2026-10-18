package services

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

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
