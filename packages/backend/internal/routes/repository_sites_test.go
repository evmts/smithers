package routes

import (
	"context"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/reposites"
	"github.com/stretchr/testify/require"
)

type unreadSiteBody struct{ reads int }

func (b *unreadSiteBody) Read([]byte) (int, error) { b.reads++; return 0, io.ErrUnexpectedEOF }
func (*unreadSiteBody) Close() error               { return nil }

func TestRepositorySitesDisabledDoesNotReadLargeBody(t *testing.T) {
	body := &unreadSiteBody{}
	r := httptest.NewRequest("POST", "/api/repos/owner/repo/site", nil)
	r.Body = body
	r.ContentLength = 25 << 20
	ctx := context.WithValue(r.Context(), middleware.UserContextKey, &db.User{ID: 1})
	ctx = middleware.ContextWithRepoContext(ctx, &middleware.RepoContext{Owner: "owner", Repository: &db.Repository{ID: 1, Name: "repo"}}, middleware.PermissionOwner)
	w := httptest.NewRecorder()
	(&RepositorySitesHandler{Service: &reposites.Service{}}).Action(w, r.WithContext(ctx))
	require.Equal(t, 503, w.Code, w.Body.String())
	require.Zero(t, body.reads)
}
