package repohostserver

import (
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/stretchr/testify/require"
	"os"
	"testing"
	"time"
)

func TestRepositoryCommitReads(t *testing.T) {
	srv := newTestServer(t)
	dir := srv.config.GitBackendPath("alice", "demo")
	require.NoError(t, os.MkdirAll(dir, 0755))
	gitWithEnv(t, nil, "init", "--bare", "--quiet", dir)
	tip := commitChain(t, dir, 3, 0, time.Now(), time.Now())
	client := repohost.NewLocalClient(srv.Handler(), testAuthToken)
	page, err := client.ListRepositoryCommits(t.Context(), "alice", "demo", tip, "", "", 2)
	require.NoError(t, err)
	require.Len(t, page.Items, 2)
	require.Equal(t, tip, page.Items[0].SHA)
	require.NotEmpty(t, page.NextCursor)
	next, err := client.ListRepositoryCommits(t.Context(), "alice", "demo", tip, "", page.NextCursor, 2)
	require.NoError(t, err)
	require.Len(t, next.Items, 1)
	require.Empty(t, next.NextCursor)
	require.NotEqual(t, page.Items[1].SHA, next.Items[0].SHA)
	commit, err := client.GetRepositoryCommit(t.Context(), "alice", "demo", tip)
	require.NoError(t, err)
	require.Equal(t, tip, commit.SHA)
	require.Len(t, commit.Parents, 1)
	require.NotEmpty(t, commit.Author)
	_, err = client.ListRepositoryCommits(t.Context(), "alice", "demo", "missing", "", "", 2)
	require.Error(t, err)
	_, err = client.GetRepositoryCommit(t.Context(), "alice", "demo", "missing")
	require.Error(t, err)
	_, err = client.ListRepositoryCommits(t.Context(), "alice", "demo", tip, "missing.txt", "", 2)
	require.Error(t, err)
}
