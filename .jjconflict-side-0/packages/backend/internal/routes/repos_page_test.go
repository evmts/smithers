package routes

import (
	"context"
	"encoding/json"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestContentsPageRead(t *testing.T) {
	for _, size := range []int{300 * 1024, 512 * 1024, 600 * 1024} {
		h := RepoHandler{Service: mockRepoRouteService{getContentsFn: func(_ context.Context, viewer *db.User, _, _, _, _ string) (services.RepoContent, error) {
			require.Nil(t, viewer)
			return services.RepoContent{Type: "file", Content: strings.Repeat("x", size), Size: int64(size), Encoding: "utf-8"}, nil
		}}}
		req := withRouteParams(httptest.NewRequest("GET", "/api/repos/a/b/contents/x", nil), map[string]string{"owner": "a", "repo": "b", "*": "x"})
		rec := httptest.NewRecorder()
		h.GetRepoContents(rec, req)
		require.Equal(t, 200, rec.Code)
		var body map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.NotEmpty(t, body["raw_url"])
		if size <= 512*1024 {
			require.Len(t, body["content"], size)
		} else {
			require.Equal(t, "", body["content"])
		}
		req = withRouteParams(httptest.NewRequest("GET", "/api/repos/a/b/contents/x?raw=1", nil), map[string]string{"owner": "a", "repo": "b", "*": "x"})
		rec = httptest.NewRecorder()
		h.GetRepoContents(rec, req)
		require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
		require.Equal(t, "text/plain; charset=utf-8", rec.Header().Get("Content-Type"))
		require.Len(t, rec.Body.Bytes(), size)
	}
}

func TestContentsRawBinary(t *testing.T) {
	h := RepoHandler{Service: mockRepoRouteService{getContentsFn: func(context.Context, *db.User, string, string, string, string) (services.RepoContent, error) {
		return services.RepoContent{Content: "AP8=", Encoding: "base64", Size: 2}, nil
	}}}
	req := withRouteParams(httptest.NewRequest("GET", "/api/repos/a/b/contents/x?raw=1", nil), map[string]string{"owner": "a", "repo": "b", "*": "x"})
	rec := httptest.NewRecorder()
	h.GetRepoContents(rec, req)
	require.Equal(t, 200, rec.Code)
	require.Equal(t, []byte{0, 255}, rec.Body.Bytes())
	require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	require.Equal(t, "application/octet-stream", rec.Header().Get("Content-Type"))
	require.Equal(t, "attachment", rec.Header().Get("Content-Disposition"))
}
