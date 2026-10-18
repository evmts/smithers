package routes

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/internal/repohostffi"
	"github.com/smithersai/smithers/packages/backend/internal/repohostserver"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestRepositoryBranchRoutes(t *testing.T) {
	library := os.Getenv("SMITHERS_FFI_LIBRARY_PATH")
	if library == "" {
		t.Skip("SMITHERS_FFI_LIBRARY_PATH supplies the existing native bookmark reader")
	}
	cfg := repohostserver.Config{StoragePath: t.TempDir(), AuthToken: "branches-test", FFILibraryPath: library}
	ffi := repohostffi.New(library)
	require.NoError(t, ffi.Load())
	_, err := ffi.InitRepo(cfg.RepoPath("alice", "demo"))
	require.NoError(t, err)
	dir := cfg.GitBackendPath("alice", "demo")
	tree, err := hex.DecodeString("4b825dc642cb6eb9a060e54bf8d69288fbee4904")
	require.NoError(t, err)
	root := writeNotesObject(t, dir, "commit", []byte(fmt.Sprintf("tree %x\nauthor Ada <ada@example.invalid> 1711398853 +0000\ncommitter Ada <ada@example.invalid> 1711398853 +0000\n\nFirst\n", tree)))
	tip := writeNotesObject(t, dir, "commit", []byte(fmt.Sprintf("tree %x\nparent %x\nauthor Ada <ada@example.invalid> 1711398854 +0000\ncommitter Ada <ada@example.invalid> 1711398854 +0000\n\nSecond\n", tree, root)))
	for name, sha := range map[string]string{"main": hex.EncodeToString(tip), "feature/a": hex.EncodeToString(root)} {
		ref := filepath.Join(dir, "refs", "heads", name)
		require.NoError(t, os.MkdirAll(filepath.Dir(ref), 0755))
		require.NoError(t, os.WriteFile(ref, []byte(sha+"\n"), 0644))
	}
	require.NoError(t, ffi.ImportGitRefs(cfg.RepoPath("alice", "demo")))
	backend, err := repohostserver.NewWithFFI(cfg, ffi)
	require.NoError(t, err)
	client := repohost.NewLocalClient(backend.Handler(), cfg.AuthToken)
	q := &notesIntegrationQueries{repository: db.Repository{ID: 1, Name: "demo", IsPublic: true, DefaultBookmark: "main"}}
	h := RepoHandler{Service: services.NewRepoService(q, client, "s1")}
	router := chi.NewRouter()
	router.With(middleware.RequireTokenScope(middleware.ScopeReadRepository)).Get("/repos/{owner}/{repo}/branches", h.ListRepositoryBranches)
	get := func(query string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/repos/alice/demo/branches"+query, nil))
		return rec
	}
	first := get("?limit=1")
	require.Equal(t, 200, first.Code, first.Body.String())
	var page services.RepositoryBranchPage
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &page))
	require.Len(t, page.Items, 1)
	require.NotEmpty(t, page.NextCursor)
	branches := append([]services.RepositoryBranch{}, page.Items...)
	next := get("?limit=1&cursor=" + page.NextCursor)
	require.Equal(t, 200, next.Code, next.Body.String())
	page = services.RepositoryBranchPage{}
	require.NoError(t, json.Unmarshal(next.Body.Bytes(), &page))
	require.Len(t, page.Items, 1)
	require.Empty(t, page.NextCursor)
	branches = append(branches, page.Items...)
	for _, branch := range branches {
		require.Equal(t, "Ada", branch.Author)
		require.NotEmpty(t, branch.Updated)
		require.Equal(t, branch.Name == "main", branch.IsDefault)
		if branch.Name == "main" {
			require.Equal(t, hex.EncodeToString(tip), branch.Head)
			require.Equal(t, "Second", branch.Title)
		}
	}
	require.Equal(t, 400, get("?limit=0").Code)
	q.repository.IsPublic = false
	require.Equal(t, 403, get("").Code)
}
