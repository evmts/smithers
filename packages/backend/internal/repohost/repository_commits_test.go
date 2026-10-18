package repohost

import (
	"context"
	"encoding/json"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestRepositoryCommitImmutableCache(t *testing.T) {
	var reads atomic.Int32
	sha := strings.Repeat("a", 40)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reads.Add(1)
		commit := RepositoryCommit{SHA: sha, Parents: []string{strings.Repeat("b", 40)}}
		if strings.HasSuffix(r.URL.Path, "/history") {
			_ = json.NewEncoder(w).Encode(RepositoryCommitPage{Items: []RepositoryCommit{commit}})
		} else {
			_ = json.NewEncoder(w).Encode(RepositoryCommitDetail{RepositoryCommit: commit, Files: []RepositoryCommitFile{{Path: "a"}}})
		}
	}))
	defer server.Close()
	client := NewClient(&StaticStorageSetResolver{URL: server.URL}, "test-token")
	for i := 0; i < 2; i++ {
		page, err := client.ListRepositoryCommits(context.Background(), "o", "r", sha, "", "", 2)
		require.NoError(t, err)
		require.Equal(t, sha, page.Items[0].SHA)
		page.Items[0].SHA = "mutated"
		detail, err := client.GetRepositoryCommit(context.Background(), "o", "r", sha)
		require.NoError(t, err)
		require.Equal(t, "a", detail.Files[0].Path)
		detail.Files[0].Path = "mutated"
	}
	require.EqualValues(t, 2, reads.Load())
	for i := 0; i < 2; i++ {
		_, err := client.ListRepositoryCommits(context.Background(), "o", "r", "main", "", "", 2)
		require.NoError(t, err)
	}
	require.EqualValues(t, 4, reads.Load(), "mutable names must never be cached")
}
