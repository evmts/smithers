package routes

import (
	"context"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"net/url"
	"testing"
)

type publicMetadataFixture struct{ mockRepoRouteService }

func (publicMetadataFixture) ReadPublicRepositoryMetadata(_ context.Context, viewer *db.User, owner, repo, resource string, query url.Values) (services.GitHubRepoMetadataResult, error) {
	return services.GitHubRepoMetadataResult{Body: []byte(`[{"number":1,"state":"open"}]`)}, nil
}
func TestPublicRepositoryMetadataHandler(t *testing.T) {
	h := RepoHandler{Service: publicMetadataFixture{}}
	req := withRouteParams(httptest.NewRequest("GET", "/api/repos/a/b/github/metadata/issues", nil), map[string]string{"owner": "a", "repo": "b", "*": "issues"})
	rec := httptest.NewRecorder()
	h.GetPublicRepositoryMetadata(rec, req)
	require.Equal(t, 200, rec.Code)
	require.JSONEq(t, `[{"number":1,"state":"open"}]`, rec.Body.String())
}
