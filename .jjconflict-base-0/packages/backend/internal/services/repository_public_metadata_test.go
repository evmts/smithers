package services

import (
	"context"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicMetadataRepositoryAccessPostgres(t *testing.T) {
	pool := newProductTestPool(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO users(id,username,lower_username) VALUES(1001,'owner','owner')`)
	require.NoError(t, err)
	var id int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public) VALUES(1001,'repo','repo',true) RETURNING id`).Scan(&id))
	_, err = pool.Exec(ctx, `INSERT INTO import_jobs(user_id,github_owner,github_repo,repo_owner,repo_name,branch,status,repository_id) VALUES(1001,'source','upstream','owner','repo','main','ready',$1)`, id)
	require.NoError(t, err)
	var syncedID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO github_synced_repos(owner_login,owner_login_lower,repo_name,repo_name_lower,sync_state,last_synced_at,last_webhook_at) VALUES('source','source','upstream','upstream','ready',now(),now()) RETURNING id`).Scan(&syncedID))
	for _, resource := range []string{"issues", "pulls"} {
		_, err = pool.Exec(ctx, `INSERT INTO github_synced_issues(synced_repo_id,resource,number,github_id,payload) VALUES($1,$2,7,7,'{"number":7,"title":"Item","state":"open","comments":0}')`, syncedID, resource)
		require.NoError(t, err)
	}
	svc := NewRepoServiceWithPool(db.New(pool), &mockRepoHostClient{}, "s1", pool)
	for _, test := range []struct {
		name       string
		visibility any
	}{{"unknown", nil}, {"private", true}, {"public", false}} {
		t.Run(test.name, func(t *testing.T) {
			visibility := test.visibility
			_, err := pool.Exec(ctx, `UPDATE github_synced_repos SET github_visibility='public',github_private=$1 WHERE id=$2`, visibility, syncedID)
			require.NoError(t, err)
			public := visibility == false
			for _, viewer := range []*db.User{nil, {ID: 1002}} {
				view, err := svc.GetRepoView(ctx, viewer, "owner", "repo")
				require.NoError(t, err)
				if public {
					require.NotNil(t, view.GitHubSource)
				} else {
					assert.Nil(t, view.GitHubSource)
				}
				for _, resource := range []string{"issues", "issues/7", "issues/7/comments", "pulls", "pulls/7", "pulls/7/comments"} {
					_, err = svc.ReadPublicRepositoryMetadata(ctx, viewer, "owner", "repo", resource, nil)
					if public {
						require.NoError(t, err)
					} else {
						require.Equal(t, 404, apiStatus(t, err))
					}
				}
			}
			writer, err := svc.GetRepoView(ctx, &db.User{ID: 1001}, "owner", "repo")
			require.NoError(t, err)
			require.NotNil(t, writer.GitHubSource)
		})
	}
	for _, viewer := range []*db.User{nil, {ID: 1002}} {
		view, err := svc.GetRepoView(ctx, viewer, "owner", "repo")
		require.NoError(t, err)
		require.Equal(t, &GitHubSource{Owner: "source", Repo: "upstream"}, view.GitHubSource)
		require.Equal(t, IssueTrackerGitHub, view.IssueTracker)
	}

	for _, resource := range []string{"issues", "issues/7", "pulls", "pulls/7"} {
		result, err := svc.ReadPublicRepositoryMetadata(ctx, nil, "owner", "repo", resource, nil)
		require.NoError(t, err)
		if resource == "issues" || resource == "pulls" {
			require.JSONEq(t, `[{"number":7,"title":"Item","state":"open","comments":0}]`, string(result.Body))
		} else {
			require.JSONEq(t, `{"number":7,"title":"Item","state":"open","comments":0}`, string(result.Body))
		}
		signedIn, err := svc.ReadPublicRepositoryMetadata(ctx, &db.User{ID: 1001}, "owner", "repo", resource, nil)
		require.NoError(t, err)
		require.JSONEq(t, string(result.Body), string(signedIn.Body))
	}
	_, err = svc.ReadPublicRepositoryMetadata(ctx, nil, "owner", "repo", "issues/8", nil)
	require.Equal(t, 404, apiStatus(t, err))
	_, err = svc.ReadPublicRepositoryMetadata(ctx, nil, "owner", "repo", "contents", nil)
	require.Equal(t, 400, apiStatus(t, err))
	_, err = svc.ReadPublicRepositoryMetadata(ctx, nil, "owner", "repo", "issues/99999999999999999999", nil)
	require.Equal(t, 400, apiStatus(t, err))
	_, err = pool.Exec(ctx, `UPDATE github_synced_repos SET sync_state='disabled' WHERE id=$1`, syncedID)
	require.NoError(t, err)
	_, err = svc.ReadPublicRepositoryMetadata(ctx, nil, "owner", "repo", "issues", nil)
	require.Equal(t, 404, apiStatus(t, err))

	_, err = pool.Exec(ctx, `UPDATE repositories SET is_public=false WHERE id=$1`, id)
	require.NoError(t, err)
	_, err = svc.ReadPublicRepositoryMetadata(ctx, nil, "owner", "repo", "issues", nil)
	require.Error(t, err)
	require.Equal(t, 404, apiStatus(t, err))
	view, err := svc.GetRepoView(ctx, &db.User{ID: 1001}, "owner", "repo")
	require.NoError(t, err)
	require.NotNil(t, view.GitHubSource, "private writers retain their source mapping")
	require.Equal(t, IssueTrackerGitHub, view.IssueTracker)
	_, err = svc.GetRepoView(ctx, nil, "owner", "repo")
	require.Equal(t, 403, apiStatus(t, err), "private repositories retain their signed-out refusal")
	_, err = pool.Exec(ctx, `DELETE FROM import_jobs WHERE repository_id=$1`, id)
	require.NoError(t, err)
	view, err = svc.GetRepoView(ctx, &db.User{ID: 1001}, "owner", "repo")
	require.NoError(t, err)
	require.Equal(t, IssueTrackerSmithers, view.IssueTracker, "native repositories keep their own tracker")

}
