package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/google/uuid"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/stretchr/testify/require"
)

func TestVisibilityFollowups(t *testing.T) {
	f := newInstallPollFixture(t)
	ctx := context.Background()
	synced := NewGitHubSyncedRepoService(db.New(f.pool))
	_, err := f.pool.Exec(ctx, `INSERT INTO users(id,username,lower_username) VALUES(2001,'door','door'); INSERT INTO repositories(id,user_id,name,lower_name,is_public) VALUES(2001,2001,'mirror','mirror',true)`)
	require.NoError(t, err)
	_, err = f.pool.Exec(ctx, `INSERT INTO import_jobs(user_id,github_owner,github_repo,repo_owner,repo_name,status,repository_id) VALUES(2001,'acme','app','door','mirror','ready',2001)`)
	require.NoError(t, err)
	_, err = f.pool.Exec(ctx, `INSERT INTO github_synced_issues(synced_repo_id,resource,number,github_id,payload) VALUES($1,'issues',7,7,'{"number":7}')`, f.row.ID)
	require.NoError(t, err)
	_, err = f.pool.Exec(ctx, `INSERT INTO github_synced_repos(owner_login,owner_login_lower,repo_name,repo_name_lower,github_repository_id,github_private,github_visibility) VALUES('other','other','source','source',101,false,'public')`)
	require.NoError(t, err)
	repos := NewProductRepoServiceWithPool(db.New(f.pool), nil, f.pool)
	warm := func(t *testing.T) {
		_, err := f.pool.Exec(ctx, `UPDATE github_synced_repos SET github_visibility='public',github_private=false,sync_state='ready',last_synced_at=now() WHERE id=$1`, f.row.ID)
		require.NoError(t, err)
		_, err = repos.ReadPublicRepositoryMetadata(ctx, nil, "door", "mirror", "issues/7", nil)
		require.NoError(t, err)
	}
	closed := func(t *testing.T) {
		_, err := repos.ReadPublicRepositoryMetadata(ctx, nil, "door", "mirror", "issues/7", nil)
		require.Equal(t, 404, apiStatus(t, err))
	}
	t.Run("failed warm state", func(t *testing.T) {
		warm(t)
		_, err := f.pool.Exec(ctx, `UPDATE github_synced_repos SET sync_state='failed' WHERE id=$1`, f.row.ID)
		require.NoError(t, err)
		closed(t)
	})
	t.Run("refusal closes warm door", func(t *testing.T) {
		for _, body := range []string{`broken`, `{"id":100,"private":false}`, `{"id":100,"private":false,"visibility":null}`, `{"id":100,"private":false,"visibility":"unexpected"}`} {
			warm(t)
			row, err := db.New(f.pool).GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app"})
			require.NoError(t, err)
			require.Error(t, synced.refreshSourceVisibility(ctx, row, func(context.Context, string, url.Values) (json.RawMessage, error) { return json.RawMessage(body), nil }))
			closed(t)
		}
		for _, refusal := range []error{pkgerrors.Unauthorized("refused"), pkgerrors.Forbidden("refused"), pkgerrors.NotFound("refused"), errors.New("transport refused")} {
			warm(t)
			row, err := db.New(f.pool).GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app"})
			require.NoError(t, err)
			require.Error(t, synced.refreshSourceVisibility(ctx, row, func(context.Context, string, url.Values) (json.RawMessage, error) { return nil, refusal }))
			closed(t)
		}
	})
	t.Run("exact visibility", func(t *testing.T) {
		for _, visibility := range []string{"internal", "public"} {
			warm(t)
			row, err := db.New(f.pool).GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app"})
			require.NoError(t, err)
			require.NoError(t, synced.refreshSourceVisibility(ctx, row, func(context.Context, string, url.Values) (json.RawMessage, error) {
				return json.RawMessage(fmt.Sprintf(`{"id":100,"private":false,"visibility":%q}`, visibility)), nil
			}))
			if visibility == "internal" {
				closed(t)
			} else {
				_, err = repos.ReadPublicRepositoryMetadata(ctx, nil, "door", "mirror", "issues/7", nil)
				require.NoError(t, err)
			}
		}
	})
	t.Run("repository dispatcher and stale response", func(t *testing.T) {
		webhook := newTestGitHubWebhookService(f.pool, "secret", WithGitHubWebhookSyncedRepos(f.service))
		for _, action := range []string{"privatized", "transferred", "renamed", "publicized"} {
			warm(t)
			row, err := db.New(f.pool).GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app"})
			require.NoError(t, err)
			started, release, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
			go func() {
				done <- synced.refreshSourceVisibility(ctx, row, func(context.Context, string, url.Values) (json.RawMessage, error) {
					close(started)
					<-release
					return json.RawMessage(`{"id":100,"private":false,"visibility":"public"}`), nil
				})
			}()
			<-started
			payload := []byte(fmt.Sprintf(`{"action":%q,"repository":{"id":100,"name":"new-name","owner":{"login":"new-owner"},"private":false,"visibility":"public"}}`, action))
			err = webhook.HandleGitHubWebhook(ctx, uuid.NewString(), "repository", signGitHubWebhookForTest(payload, "secret"), payload)
			_, immediateErr := repos.ReadPublicRepositoryMetadata(ctx, nil, "door", "mirror", "issues/7", nil)
			close(release)
			require.NoError(t, err)
			if action != "publicized" {
				require.Equal(t, 404, apiStatus(t, immediateErr))
			}
			require.NoError(t, <-done)
			var otherPublic bool
			require.NoError(t, f.pool.QueryRow(ctx, `SELECT github_private=false AND github_visibility='public' FROM github_synced_repos WHERE github_repository_id=101`).Scan(&otherPublic))
			require.True(t, otherPublic, "only the matching registry row closes")
			if action != "publicized" {
				closed(t)
				current, err := db.New(f.pool).GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: "acme", RepoName: "app"})
				require.NoError(t, err)
				require.False(t, current.GithubPrivate.Valid)
				require.Greater(t, current.VisibilityGeneration, row.VisibilityGeneration)
				require.NoError(t, synced.refreshSourceVisibility(ctx, current, func(context.Context, string, url.Values) (json.RawMessage, error) {
					return json.RawMessage(`{"id":100,"private":false,"visibility":"public"}`), nil
				}))
				_, err = repos.ReadPublicRepositoryMetadata(ctx, nil, "door", "mirror", "issues/7", nil)
				require.NoError(t, err, "a fresh sync can reopen the source")
			}
		}
	})
	t.Run("unknown repo and publicized cannot open", func(t *testing.T) {
		warm(t)
		webhook := newTestGitHubWebhookService(f.pool, "secret", WithGitHubWebhookSyncedRepos(f.service))
		send := func(id int, action string) {
			payload := []byte(fmt.Sprintf(`{"action":%q,"repository":{"id":%d,"name":"app","owner":{"login":"acme"},"private":false,"visibility":"public"}}`, action, id))
			require.NoError(t, webhook.HandleGitHubWebhook(ctx, uuid.NewString(), "repository", signGitHubWebhookForTest(payload, "secret"), payload))
		}
		send(999, "privatized")
		_, err := repos.ReadPublicRepositoryMetadata(ctx, nil, "door", "mirror", "issues/7", nil)
		require.NoError(t, err)
		send(100, "privatized")
		send(100, "privatized")
		closed(t)
		send(100, "publicized")
		closed(t)
	})
	t.Run("one anonymous answer", func(t *testing.T) {
		var viewJSON, doorBody []byte
		for _, state := range []string{"private", "unknown", "no registry", "ambiguous", "no source"} {
			warm(t)
			switch state {
			case "private":
				_, err = f.pool.Exec(ctx, `UPDATE github_synced_repos SET github_private=true WHERE id=$1`, f.row.ID)
			case "unknown":
				_, err = f.pool.Exec(ctx, `UPDATE github_synced_repos SET github_private=NULL WHERE id=$1`, f.row.ID)
			case "no registry":
				_, err = f.pool.Exec(ctx, `UPDATE import_jobs SET github_repo='absent' WHERE repository_id=2001`)
			case "ambiguous":
				_, err = f.pool.Exec(ctx, `INSERT INTO import_jobs(user_id,github_owner,github_repo,status,repository_id) VALUES(2001,'other','app','ready',2001)`)
			case "no source":
				_, err = f.pool.Exec(ctx, `UPDATE import_jobs SET status='failed' WHERE repository_id=2001`)
			}
			require.NoError(t, err)
			view, err := repos.GetRepoView(ctx, nil, "door", "mirror")
			require.NoError(t, err)
			require.Nil(t, view.GitHubSource, state)
			require.False(t, view.GitHubSourceUnavailable, state)
			require.False(t, view.GitHubSourceAmbiguous, state)
			got, err := json.Marshal(view)
			require.NoError(t, err)
			for _, query := range []url.Values{nil, {"unexpected": {"value"}}} {
				_, err = repos.ReadPublicRepositoryMetadata(ctx, nil, "door", "mirror", "issues/7", query)
				recorder := httptest.NewRecorder()
				apiErr, ok := err.(*pkgerrors.APIError)
				require.True(t, ok)
				pkgerrors.WriteError(recorder, apiErr)
				require.Equal(t, 404, recorder.Code)
				if viewJSON == nil {
					viewJSON = got
					doorBody = append([]byte(nil), recorder.Body.Bytes()...)
				} else {
					require.Equal(t, string(viewJSON), string(got), state)
					require.Equal(t, string(doorBody), recorder.Body.String(), state)
				}
			}
			_, err = f.pool.Exec(ctx, `DELETE FROM import_jobs WHERE github_owner='other'; UPDATE import_jobs SET github_repo='app',status='ready' WHERE repository_id=2001`)
			require.NoError(t, err)
		}
	})
}
