package routes

import (
	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRepositorySearchRoutes(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := context.Background()
	var owner int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (username,lower_username,email,lower_email) VALUES ('searcher','searcher','searcher@example.invalid','searcher@example.invalid') RETURNING id`).Scan(&owner))
	var first int64
	for _, name := range []string{"first", "second", "private"} {
		var id int64
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories (user_id,name,lower_name,is_public,default_bookmark) VALUES ($1,$2,$2,$3,'main') RETURNING id`, owner, name, name != "private").Scan(&id))
		if name == "first" {
			first = id
		}
		for _, path := range []string{"a.ts", "b.ts"} {
			_, err := q.UpsertCodeSearchDocument(ctx, db.UpsertCodeSearchDocumentParams{RepositoryID: id, FilePath: path, Content: "needle"})
			require.NoError(t, err)
		}
		_, err := q.CreateIssue(ctx, db.CreateIssueParams{RepositoryID: id, Title: "needle", Body: "found", AuthorID: owner})
		require.NoError(t, err)
	}
	h := &SearchHandler{Service: services.NewSearchService(q)}
	router := chi.NewRouter()
	read := []func(http.Handler) http.Handler{middleware.LoadRepoContext(q), middleware.RequireRepoPermission(middleware.PermissionRead)}
	router.With(read...).Get("/repos/{owner}/{repo}/search/code", h.SearchCode)
	router.With(read...).Get("/repos/{owner}/{repo}/search/issues", h.SearchIssues)
	get := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec
	}
	code := get("/repos/searcher/first/search/code?q=needle&limit=1")
	require.Equal(t, 200, code.Code, code.Body.String())
	var codePage services.CodeSearchResultPage
	require.NoError(t, json.Unmarshal(code.Body.Bytes(), &codePage))
	require.Equal(t, int64(2), codePage.TotalCount)
	require.Len(t, codePage.Items, 1)
	require.Equal(t, first, codePage.Items[0].RepositoryID)
	next := get("/repos/searcher/first/search/code?q=needle&limit=1&cursor=1")
	require.Equal(t, 200, next.Code, next.Body.String())
	var nextPage services.CodeSearchResultPage
	require.NoError(t, json.Unmarshal(next.Body.Bytes(), &nextPage))
	require.Len(t, nextPage.Items, 1)
	require.NotEqual(t, codePage.Items[0].Path, nextPage.Items[0].Path)
	issues := get("/repos/searcher/first/search/issues?q=needle")
	require.Equal(t, 200, issues.Code, issues.Body.String())
	var issuePage services.IssueSearchResultPage
	require.NoError(t, json.Unmarshal(issues.Body.Bytes(), &issuePage))
	require.Equal(t, int64(1), issuePage.TotalCount)
	require.Equal(t, first, issuePage.Items[0].RepositoryID)
	for _, kind := range []string{"code", "issues"} {
		request := httptest.NewRequest(http.MethodGet, "/repos/searcher/private/search/"+kind+"?q=needle", nil)
		request = request.WithContext(middleware.ContextWithAuthInfo(request.Context(), &middleware.AuthInfo{User: &db.User{ID: owner, Username: "searcher"}}))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, request)
		require.Equal(t, 200, rec.Code, rec.Body.String())
	}
	for _, kind := range []string{"code", "issues"} {
		require.Equal(t, 404, get("/repos/searcher/private/search/"+kind+"?q=needle").Code)
		require.Equal(t, 404, get("/repos/searcher/missing/search/"+kind+"?q=needle").Code)
	}
}
