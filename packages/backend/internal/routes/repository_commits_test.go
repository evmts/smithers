package routes

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/internal/repohostserver"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// Only database metadata is substituted. The API, service, repo-host protocol,
// Git object store and history walk are real and need no native FFI library.
func TestRepositoryCommitRoutes(t *testing.T) {
	cfg := repohostserver.Config{StoragePath: t.TempDir(), AuthToken: "history-test"}
	dir := cfg.GitBackendPath("alice", "demo")
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "refs", "heads"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "HEAD"), []byte("ref: refs/heads/main\n"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "config"), []byte("[core]\nrepositoryformatversion = 0\nbare = true\n"), 0644))
	blob := writeNotesObject(t, dir, "blob", []byte("hello\n"))
	tree := writeNotesObject(t, dir, "tree", append([]byte("100644 hello.txt\x00"), blob...))
	root := writeNotesObject(t, dir, "commit", []byte(fmt.Sprintf("tree %x\nauthor Ada <ada@example.invalid> 1711398853 +0000\ncommitter Ada <ada@example.invalid> 1711398853 +0000\n\nInitial\n", tree)))
	second := writeNotesObject(t, dir, "commit", []byte(fmt.Sprintf("tree %x\nparent %x\nauthor Ada <ada@example.invalid> 1711398854 +0000\ncommitter Ada <ada@example.invalid> 1711398854 +0000\n\nSecond\n\nBody\n", tree, root)))
	tip := hex.EncodeToString(second)
	backend, err := repohostserver.NewWithFFI(cfg, nil)
	require.NoError(t, err)
	client := repohost.NewLocalClient(backend.Handler(), cfg.AuthToken)
	q := &notesIntegrationQueries{repository: db.Repository{ID: 1, Name: "demo", IsPublic: true, DefaultBookmark: "main"}}
	h := RepoHandler{Service: services.NewRepoService(q, client, "s1")}
	router := chi.NewRouter()
	router.With(middleware.RequireTokenScope(middleware.ScopeReadRepository)).Get("/api/repos/{owner}/{repo}/commits", h.ListRepositoryCommits)
	router.With(middleware.RequireTokenScope(middleware.ScopeReadRepository)).Get("/api/repos/{owner}/{repo}/commits/{sha}", h.GetRepositoryCommit)
	get := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/repos/alice/demo"+path, nil))
		return rec
	}
	first := get("/commits?ref=" + tip + "&limit=1")
	require.Equal(t, 200, first.Code, first.Body.String())
	var page repohost.RepositoryCommitPage
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &page))
	require.Len(t, page.Items, 1)
	require.Equal(t, "Body", page.Items[0].Body)
	require.NotEmpty(t, page.NextCursor)
	next := get("/commits?ref=" + tip + "&limit=1&cursor=" + page.NextCursor)
	require.Equal(t, 200, next.Code, next.Body.String())
	require.NoError(t, json.Unmarshal(next.Body.Bytes(), &page))
	require.Equal(t, hex.EncodeToString(root), page.Items[0].SHA)
	one := get("/commits/" + hex.EncodeToString(root))
	require.Equal(t, 200, one.Code, one.Body.String())
	var detail repohost.RepositoryCommitDetail
	require.NoError(t, json.Unmarshal(one.Body.Bytes(), &detail))
	require.Len(t, detail.Files, 1)
	require.Equal(t, repohost.RepositoryCommitFile{Path: "hello.txt", Status: "added", Additions: 1}, detail.Files[0])
	for _, path := range []string{"/commits/unknown", "/commits/" + strings.Repeat("f", 40), "/commits?ref=" + tip + "&path=missing", "/commits?ref=" + strings.Repeat("f", 40)} {
		rec := get(path)
		require.Equal(t, 404, rec.Code, rec.Body.String())
	}
	for _, path := range []string{"/commits?ref=" + tip + "&limit=0", "/commits?ref=" + tip + "&cursor=bad"} {
		require.Equal(t, 400, get(path).Code)
	}
	q.repository.IsPublic = false
	require.Equal(t, 403, get("/commits?ref="+tip).Code)
	require.Equal(t, 403, get("/commits/"+tip).Code)
}
