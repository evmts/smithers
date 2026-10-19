package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// A repository read answers the viewer's own resolved permission, so a client
// can tell a writer from an administrator before it offers a setting only an
// administrator may change (a secret). can_write cannot: "write" and "admin"
// both write.
func TestGetRepo_AnswersResolvedViewerPermission(t *testing.T) {
	t.Parallel()

	read := func(permission middleware.PermissionLevel) map[string]any {
		t.Helper()
		h := RepoHandler{Service: mockRepoRouteService{
			getRepoViewFn: func(_ context.Context, _ *db.User, _, _ string) (services.RepoView, error) {
				return services.RepoView{Repository: routeRepo(nil), CanWrite: permission.Satisfies(middleware.PermissionWrite)}, nil
			},
		}, SSHHost: "smithers.test"}
		req := httptest.NewRequest(http.MethodGet, "/api/repos/alice/demo", nil)
		req = req.WithContext(middleware.ContextWithRepoContext(req.Context(), &middleware.RepoContext{
			Owner: "alice", Repository: &db.Repository{ID: 9, Name: "demo", LowerName: "demo"},
		}, permission))
		rec := httptest.NewRecorder()
		h.GetRepo(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)
		var body map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		return body
	}

	for permission, expected := range map[middleware.PermissionLevel]string{
		middleware.PermissionOwner: "owner",
		middleware.PermissionAdmin: "admin",
		middleware.PermissionWrite: "write",
		middleware.PermissionRead:  "read",
	} {
		body := read(permission)
		require.Equal(t, expected, body["permission"], "permission for %s", permission)
	}

	// A writer who is not an administrator is still a writer: the answer must
	// not round "write" up to something that administers.
	writer := read(middleware.PermissionWrite)
	require.Equal(t, true, writer["can_write"])
	require.Equal(t, "write", writer["permission"])

	// No loaded permission grants nothing, and says so by absence rather than
	// by naming a level nobody resolved.
	h := RepoHandler{Service: mockRepoRouteService{
		getRepoViewFn: func(_ context.Context, _ *db.User, _, _ string) (services.RepoView, error) {
			return services.RepoView{Repository: routeRepo(nil)}, nil
		},
	}, SSHHost: "smithers.test"}
	req := httptest.NewRequest(http.MethodGet, "/api/repos/alice/demo", nil)
	req = req.WithContext(middleware.ContextWithRepoContext(req.Context(), &middleware.RepoContext{
		Owner: "alice", Repository: &db.Repository{ID: 9, Name: "demo", LowerName: "demo"},
	}, middleware.PermissionNone))
	rec := httptest.NewRecorder()
	h.GetRepo(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	_, present := body["permission"]
	require.False(t, present, "an unresolved permission is absent, never a level")
}
