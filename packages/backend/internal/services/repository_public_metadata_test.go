package services

import (
	"context"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPublicMetadataNeverSendsCredential(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Empty(t, r.Header.Get("Authorization"))
		require.Empty(t, r.Header.Get("Cookie"))
		_, _ = w.Write([]byte(`[{"number":7,"state":"open"}]`))
	}))
	defer upstream.Close()
	reader := &GitHubUserReposService{httpClient: upstream.Client(), now: time.Now}
	result, err := reader.requestGitHubRepoRaw(context.Background(), "", upstream.URL, '[')
	require.NoError(t, err)
	require.JSONEq(t, `[{"number":7,"state":"open"}]`, string(result.Body))
}
