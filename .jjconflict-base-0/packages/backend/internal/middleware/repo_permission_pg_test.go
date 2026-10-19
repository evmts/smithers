package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// The value a repository read publishes as `permission` is whatever the one
// resolver ranked over real rows, and it is the same rank the secret routes
// enforce: a collaborator with write may read a repository's secrets and may
// not change them, and only admin and the owner may.
func TestRepoPermissionOverRealRows(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	queries := db.New(pool)

	person := func(login string) db.User {
		var id int64
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES($1,$1) RETURNING id`, login).Scan(&id))
		return db.User{ID: id, Username: login, LowerUsername: login}
	}
	owner := person("permowner")
	var private, public int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public) VALUES($1,'closed','closed',false) RETURNING id`, owner.ID).Scan(&private))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public) VALUES($1,'open','open',true) RETURNING id`, owner.ID).Scan(&public))
	collaborator := func(login, permission string, repository int64) db.User {
		user := person(login)
		_, err := pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,$3)`, repository, user.ID, permission)
		require.NoError(t, err)
		return user
	}
	admin := collaborator("permadmin", "admin", private)
	writer := collaborator("permwriter", "write", private)
	reader := collaborator("permreader", "read", private)
	outsider := person("permoutsider")

	// The door every repository route stands behind, answering the rank it
	// loaded — nothing else decides.
	router := chi.NewRouter()
	router.With(middleware.LoadRepoContext(queries), middleware.RequireRepoPermission(middleware.PermissionRead)).
		Get("/api/repos/{owner}/{repo}", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(middleware.RepoPermissionFromContext(r.Context())))
		})
	// The secret write gate: the same rank, required at admin.
	router.With(middleware.LoadRepoContext(queries), middleware.RequireRepoPermission(middleware.PermissionAdmin)).
		Post("/api/repos/{owner}/{repo}/secrets", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusCreated) })

	call := func(method, path string, viewer *db.User) (int, string) {
		req := httptest.NewRequest(method, path, nil)
		if viewer != nil {
			req = req.WithContext(context.WithValue(req.Context(), middleware.UserContextKey, viewer))
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code, rec.Body.String()
	}

	for _, tc := range []struct {
		name       string
		viewer     *db.User
		permission string
	}{
		{"owner", &owner, "owner"},
		{"admin collaborator", &admin, "admin"},
		{"write collaborator", &writer, "write"},
		{"read collaborator", &reader, "read"},
	} {
		code, body := call(http.MethodGet, "/api/repos/permowner/closed", tc.viewer)
		require.Equal(t, http.StatusOK, code, tc.name)
		require.Equal(t, tc.permission, body, tc.name)
	}

	// A private repository is not there for someone with no grant, and a
	// guest on a public one reads and nothing more.
	code, _ := call(http.MethodGet, "/api/repos/permowner/closed", &outsider)
	require.Equal(t, http.StatusNotFound, code)
	code, _ = call(http.MethodGet, "/api/repos/permowner/closed", nil)
	require.Equal(t, http.StatusNotFound, code)
	code, body := call(http.MethodGet, "/api/repos/permowner/open", nil)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "read", body)

	// The write gate agrees with the rank the read published: write is not admin.
	for viewer, want := range map[*db.User]int{
		&owner:  http.StatusCreated,
		&admin:  http.StatusCreated,
		&writer: http.StatusForbidden,
		&reader: http.StatusForbidden,
	} {
		code, _ := call(http.MethodPost, "/api/repos/permowner/closed/secrets", viewer)
		require.Equal(t, want, code, viewer.Username)
	}
}
