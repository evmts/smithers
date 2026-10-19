package routes

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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

// The database row is a fixture; both public HTTP routing and storage client
// decoding/error mapping are real. Native non-file reads return generic 404,
// whereas absent files have file_not_found, and both must preserve browsing.
func TestContentsDirectoryFallsBackAfterNativeStyleFileNotFound(t *testing.T) {
	for _, tc := range []struct {
		name, path, code string
		entries          []repohost.TreeEntry
		status           int
	}{
		{name: "directory generic404", path: "src", entries: []repohost.TreeEntry{{Path: "src/main.go", Kind: "file"}}, status: 200},
		{name: "missing file typed404", path: "missing.go", code: "file_not_found", status: 404},
	} {
		t.Run(tc.name, func(t *testing.T) {
			commit := strings.Repeat("a", 40)
			fileReads, treeReads := 0, 0
			host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, http.MethodGet, r.Method)
				switch r.URL.Path {
				case "/repos/alice:demo/bookmarks/main":
					require.NoError(t, json.NewEncoder(w).Encode(repohost.Bookmark{Name: "main", TargetChangeID: "change-main", TargetCommitID: commit}))
				case "/repos/alice:demo/file/" + commit + "/" + tc.path:
					fileReads++
					w.WriteHeader(http.StatusNotFound)
					require.NoError(t, json.NewEncoder(w).Encode(map[string]string{"code": tc.code, "message": "file not found"}))
				case "/repos/alice:demo/changes/" + commit + "/tree":
					treeReads++
					require.Equal(t, tc.path, r.URL.Query().Get("prefix"))
					require.NoError(t, json.NewEncoder(w).Encode(tc.entries))
				default:
					t.Errorf("unexpected storage request %s", r.URL)
					w.WriteHeader(http.StatusInternalServerError)
				}
			}))
			defer host.Close()
			client := repohost.NewClient(&repohost.StaticStorageSetResolver{URL: host.URL}, "token")
			q := &notesIntegrationQueries{repository: db.Repository{ID: 1, Name: "demo", IsPublic: true, DefaultBookmark: "main"}}
			handler := RepoHandler{Service: services.NewRepoService(q, client, "s1")}
			router := chi.NewRouter()
			router.With(middleware.RequireTokenScope(middleware.ScopeReadRepository)).Get("/api/repos/{owner}/{repo}/contents/*", handler.GetRepoContents)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/repos/alice/demo/contents/"+tc.path, nil))
			require.Equal(t, tc.status, response.Code, response.Body.String())
			require.Equal(t, 1, fileReads)
			require.Equal(t, 1, treeReads)
			if tc.status == 200 {
				var entries []services.RepoContent
				require.NoError(t, json.Unmarshal(response.Body.Bytes(), &entries))
				require.Equal(t, []services.RepoContent{{Name: "main.go", Path: "src/main.go", Type: "file"}}, entries)
			}
		})
	}
}

func TestContentsPageThroughStorageClient(t *testing.T) {
	for _, size := range []int{300 * 1024, 600 * 1024} {
		commit := strings.Repeat("b", 40)
		host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/repos/alice:demo/bookmarks/main":
				require.NoError(t, json.NewEncoder(w).Encode(repohost.Bookmark{Name: "main", TargetCommitID: commit}))
			case "/repos/alice:demo/file/" + commit + "/x":
				require.NoError(t, json.NewEncoder(w).Encode(repohost.FileContent{Path: "x", Content: strings.Repeat("x", size), Encoding: "utf8"}))
			default:
				t.Errorf("unexpected storage read %s", r.URL)
				w.WriteHeader(500)
			}
		}))
		client := repohost.NewClient(&repohost.StaticStorageSetResolver{URL: host.URL}, "token")
		q := &notesIntegrationQueries{repository: db.Repository{ID: 1, Name: "demo", IsPublic: true, DefaultBookmark: "main"}}
		handler := RepoHandler{Service: services.NewRepoService(q, client, "s1")}
		router := chi.NewRouter()
		router.With(middleware.RequireTokenScope(middleware.ScopeReadRepository)).Get("/api/repos/{owner}/{repo}/contents/*", handler.GetRepoContents)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", "/api/repos/alice/demo/contents/x", nil))
		require.Equal(t, 200, response.Code, response.Body.String())
		var body services.RepoContent
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
		require.Equal(t, commit, body.CommitSHA)
		require.Equal(t, int64(size), body.Size)
		if size <= 512*1024 {
			require.Len(t, body.Content, size)
		} else {
			require.Empty(t, body.Content)
			require.True(t, body.TooLarge)
		}
		response = httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", body.RawURL, nil))
		require.Equal(t, 200, response.Code)
		require.Len(t, response.Body.Bytes(), size)
		q.repository.IsPublic = false
		response = httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", body.RawURL, nil))
		require.Equal(t, 404, response.Code)
		host.Close()
	}
}

// Only the database row and native storage calls are substituted. Exercise the
// real API, contents service, storage client and storage HTTP router together.
// Native calls are substituted because this regression concerns HTTP routing,
// not the platform-specific dlopen library. A proxy may forward the decoded
// URL path without the optional RawPath hint.
type slashContentsFFI struct {
	repohostserver.FFIClient
	t *testing.T
}

func (f slashContentsFFI) GetBookmark(_, name string) (*repohost.Bookmark, error) {
	require.Equal(f.t, "poc/pre-withdrawal-checkpoint", name)
	return &repohost.Bookmark{Name: name, TargetCommitID: strings.Repeat("b", 40)}, nil
}
func (f slashContentsFFI) ListDirectory(_, commit, prefix, after string, limit uint32) ([]repohost.TreeEntry, error) {
	require.Equal(f.t, strings.Repeat("b", 40), commit)
	require.Empty(f.t, prefix)
	require.Empty(f.t, after)
	return []repohost.TreeEntry{{Path: "README.md", Kind: "file"}}, nil
}
func TestContentsNonDefaultSlashBranchRoot(t *testing.T) {
	for _, decoded := range []bool{false, true} {
		t.Run(fmt.Sprint("decoded-path=", decoded), func(t *testing.T) {
			cfg := repohostserver.Config{StoragePath: t.TempDir(), AuthToken: "slash-test"}
			storage, err := repohostserver.NewWithFFI(cfg, slashContentsFFI{t: t})
			require.NoError(t, err)
			handler := storage.Handler()
			host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if decoded {
					r.URL.RawPath = ""
				}
				handler.ServeHTTP(w, r)
			}))
			defer host.Close()
			client := repohost.NewClient(&repohost.StaticStorageSetResolver{URL: host.URL}, cfg.AuthToken)
			q := &notesIntegrationQueries{repository: db.Repository{ID: 1, Name: "demo", IsPublic: true, DefaultBookmark: "main"}}
			h := RepoHandler{Service: services.NewRepoService(q, client, "s1")}
			router := chi.NewRouter()
			router.Get("/api/repos/{owner}/{repo}/contents", h.GetRepoContents)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/repos/alice/demo/contents?ref=poc%2Fpre-withdrawal-checkpoint", nil))
			require.Equal(t, 200, response.Code, response.Body.String())
			var entries []services.RepoContent
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &entries))
			require.Equal(t, []services.RepoContent{{Name: "README.md", Path: "README.md", Type: "file"}}, entries)
		})
	}
}
