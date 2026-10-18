package services

import (
	"context"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

func TestRepoGitHubSourceRequiresOneReadyImport(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	var userID, repoID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES('source-owner','source-owner') RETURNING id`).Scan(&userID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public,default_bookmark) VALUES($1,'mirror','mirror',true,'main') RETURNING id`, userID).Scan(&repoID))
	svc := &RepoService{pool: pool}
	read := func() (*GitHubSource, bool) {
		t.Helper()
		source, ambiguous, err := svc.githubSource(ctx, repoID)
		require.NoError(t, err)
		return source, ambiguous
	}
	source, ambiguous := read()
	require.Nil(t, source, "a repository name or description alone cannot identify its GitHub source")
	require.False(t, ambiguous)
	insert := func(owner, repo, status string) {
		t.Helper()
		_, err := pool.Exec(ctx, `INSERT INTO import_jobs(user_id,repository_id,github_owner,github_repo,status) VALUES($1,$2,$3,$4,$5)`, userID, repoID, owner, repo, status)
		require.NoError(t, err)
	}
	insert("ignored", "other", "failed")
	source, ambiguous = read()
	require.Nil(t, source, "a failed import cannot select review source")
	require.False(t, ambiguous)
	insert("upstream", "project", "ready")
	source, ambiguous = read()
	require.Equal(t, &GitHubSource{Owner: "upstream", Repo: "project"}, source)
	require.False(t, ambiguous)
	reader := NewProductRepoServiceWithPool(db.New(pool), nil, pool)
	ownerView, err := reader.GetRepoView(ctx, &db.User{ID: userID, Username: "source-owner"}, "source-owner", "mirror")
	require.NoError(t, err)
	require.Equal(t, source, ownerView.GitHubSource)
	require.False(t, ownerView.GitHubSourceUnavailable)
	var otherID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES('other-reader','other-reader') RETURNING id`).Scan(&otherID))
	otherView, err := reader.GetRepoView(ctx, &db.User{ID: otherID, Username: "other-reader"}, "source-owner", "mirror")
	require.NoError(t, err)
	require.Equal(t, source, otherView.GitHubSource, "public repository readers can resolve its ready source")
	require.False(t, otherView.GitHubSourceUnavailable)
	anonymousView, err := reader.GetRepoView(ctx, nil, "source-owner", "mirror")
	require.NoError(t, err)
	require.Equal(t, source, anonymousView.GitHubSource)
	_, err = pool.Exec(ctx, `UPDATE repositories SET is_public=false WHERE id=$1`, repoID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'read')`, repoID, otherID)
	require.NoError(t, err)
	privateView, err := reader.GetRepoView(ctx, &db.User{ID: otherID}, "source-owner", "mirror")
	require.NoError(t, err)
	require.Nil(t, privateView.GitHubSource, "private read-only members cannot discover source coordinates")
	require.True(t, privateView.GitHubSourceUnavailable)
	insert("UPSTREAM", "PROJECT", "ready")
	source, ambiguous = read()
	require.Equal(t, &GitHubSource{Owner: "upstream", Repo: "project"}, source, "case variants name the same source")
	require.False(t, ambiguous)
	insert("different", "project", "ready")
	source, ambiguous = read()
	require.Nil(t, source, "conflicting ready imports must not choose an owner's pull requests")
	require.True(t, ambiguous)
}

func TestRepoGitHubSourceWithoutImportStoreFailsClosed(t *testing.T) {
	q := &mockRepoQuerier{getRepoByOwnerAndLowerNameFn: func(context.Context, db.GetRepoByOwnerAndLowerNameParams) (db.Repository, error) {
		return db.Repository{ID: 3, Name: "mirror", LowerName: "mirror", IsPublic: true}, nil
	}}
	view, err := NewRepoService(q, &mockRepoHostClient{}, "s1").GetRepoView(context.Background(), &db.User{ID: 7, Username: "owner"}, "owner", "mirror")
	require.NoError(t, err)
	require.Nil(t, view.GitHubSource)
	require.True(t, view.GitHubSourceUnavailable)
}
