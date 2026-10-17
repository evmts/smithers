package routes

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// contentsOperations are the two published operations the contents route
// answers. Both run the same directory pager, so both must declare it.
var contentsOperations = []string{
	"/api/repos/{owner}/{repo}/contents",
	"/api/repos/{owner}/{repo}/contents/{path}",
}

// publishedAPIPath is the product API document every typed client is generated
// from; scripts/openapi-bundle.mjs bundles it from docs/api/openapi/*.yaml.
const publishedAPIPath = "../../../../docs/api/openapi.yaml"

const contentsSurfaceCommit = "0123456789012345678901234567890123456789"

// surfaceService records what the route's parser passed through, so the
// declared page parameters are checked against the values the service really
// receives rather than against a copy of the handler's source.
type surfaceService struct {
	mockRepoRouteService
	limit int
	after string
}

func (s *surfaceService) ListRepoContentsPage(_ context.Context, _ *db.User, _, _, _, _, after string, limit int) ([]services.RepoContent, string, string, error) {
	s.limit, s.after = limit, after
	return []services.RepoContent{{Name: "apps", Path: "apps", Type: "dir"}}, "apps", contentsSurfaceCommit, nil
}

// openAPIQueryParameter is one declared query parameter and the numeric bounds
// of its schema; a bound the document omits stays nil so a missing constraint
// is distinguishable from a zero one.
type openAPIQueryParameter struct {
	Name   string `yaml:"name"`
	In     string `yaml:"in"`
	Schema struct {
		Type    string `yaml:"type"`
		Minimum *int   `yaml:"minimum"`
		Maximum *int   `yaml:"maximum"`
		Default *int   `yaml:"default"`
	} `yaml:"schema"`
}

type openAPIContentsOperation struct {
	Parameters []openAPIQueryParameter `yaml:"parameters"`
	Responses  map[string]struct {
		Headers map[string]struct {
			Schema struct {
				Type string `yaml:"type"`
			} `yaml:"schema"`
		} `yaml:"headers"`
	} `yaml:"responses"`
}

// publishedContentsOperations decodes the GET operation of each contents path.
// Only the method key is decoded: a path item also carries extensions.
func publishedContentsOperations(t *testing.T) map[string]openAPIContentsOperation {
	t.Helper()
	data, err := os.ReadFile(publishedAPIPath)
	require.NoError(t, err)
	var document struct {
		Paths map[string]map[string]yaml.Node `yaml:"paths"`
	}
	require.NoError(t, yaml.Unmarshal(data, &document))
	operations := map[string]openAPIContentsOperation{}
	for _, path := range contentsOperations {
		item, ok := document.Paths[path]
		require.True(t, ok, "%s is not a published path", path)
		get, ok := item["get"]
		require.True(t, ok, "%s has no GET operation", path)
		var operation openAPIContentsOperation
		require.NoError(t, get.Decode(&operation), path)
		operations[path] = operation
	}
	return operations
}

func (o openAPIContentsOperation) query(name string) (openAPIQueryParameter, bool) {
	for _, parameter := range o.Parameters {
		if parameter.In == "query" && parameter.Name == name {
			return parameter, true
		}
	}
	return openAPIQueryParameter{}, false
}

// listPage drives the real route for a directory listing and returns the
// recorder, so both the status and the response headers are the handler's.
func listPage(t *testing.T, service *surfaceService, query string) *httptest.ResponseRecorder {
	t.Helper()
	target := "/api/repos/alice/demo/contents"
	if query != "" {
		target += "?" + query
	}
	request := withRouteParams(httptest.NewRequest(http.MethodGet, target, nil), map[string]string{"owner": "alice", "repo": "demo"})
	recorder := httptest.NewRecorder()
	handler := RepoHandler{Service: service}
	handler.GetRepoContents(recorder, request)
	return recorder
}

// The directory pager has been served for both contents operations all along,
// but a parameter or response header the product API document does not declare
// is unreachable from the generated Go and TypeScript clients and absent from
// the API reference. This observes the page parameters the route actually
// honours, and the headers it actually sets, then requires the published
// document to declare exactly those.
func TestContentsPagingSurfaceIsPublished(t *testing.T) {
	service := &surfaceService{}
	service.getContentsFn = func(_ context.Context, _ *db.User, _, _, _, path string) (services.RepoContent, error) {
		if path == "README.md" {
			return services.RepoContent{Name: "README.md", Path: path, Type: "file", Encoding: "utf-8", Content: "hi", Size: 2}, nil
		}
		return services.RepoContent{}, pkgerrors.NotFound("content not found")
	}
	operations := publishedContentsOperations(t)

	t.Run("limit bounds match the parser", func(t *testing.T) {
		accepted := []int{}
		for _, raw := range []string{"-1", "0", "1", "2", "500", "999", "1000", "1001", "abc", "1.5"} {
			recorder := listPage(t, service, "limit="+raw)
			if recorder.Code == http.StatusOK {
				accepted = append(accepted, service.limit)
				continue
			}
			require.Equal(t, http.StatusBadRequest, recorder.Code, "limit=%s", raw)
		}
		require.NotEmpty(t, accepted)
		sort.Ints(accepted)
		low, high := accepted[0], accepted[len(accepted)-1]
		// The probe brackets the real boundary rather than reporting the
		// sample's own ends: one step past each end must be refused.
		require.Equal(t, http.StatusBadRequest, listPage(t, service, "limit="+strconv.Itoa(high+1)).Code)
		require.Equal(t, http.StatusBadRequest, listPage(t, service, "limit="+strconv.Itoa(low-1)).Code)

		require.Equal(t, http.StatusOK, listPage(t, service, "").Code)
		fallback := service.limit

		for path, operation := range operations {
			limit, ok := operation.query("limit")
			require.True(t, ok, "%s declares no limit query parameter", path)
			assert.Equal(t, "integer", limit.Schema.Type, path)
			require.NotNil(t, limit.Schema.Minimum, "%s declares no minimum", path)
			require.NotNil(t, limit.Schema.Maximum, "%s declares no maximum", path)
			require.NotNil(t, limit.Schema.Default, "%s declares no default", path)
			assert.Equal(t, low, *limit.Schema.Minimum, "%s minimum", path)
			assert.Equal(t, high, *limit.Schema.Maximum, "%s maximum", path)
			assert.Equal(t, fallback, *limit.Schema.Default, "%s default", path)
		}
	})

	t.Run("after carries the cursor and is declared", func(t *testing.T) {
		recorder := listPage(t, service, "limit=1&after=README.md")
		require.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "README.md", service.after, "the route must pass after through to the pager")
		// The existing refusal: a cursor that is not valid path text never
		// reaches the pager, so the declared 400 is real.
		service.after = ""
		assert.Equal(t, http.StatusBadRequest, listPage(t, service, "after=a%01b").Code)
		assert.Empty(t, service.after)

		for path, operation := range operations {
			after, ok := operation.query("after")
			require.True(t, ok, "%s declares no after query parameter", path)
			assert.Equal(t, "string", after.Schema.Type, path)
		}
	})

	t.Run("page headers are declared on the success response", func(t *testing.T) {
		recorder := listPage(t, service, "limit=1")
		require.Equal(t, http.StatusOK, recorder.Code)
		observed := []string{}
		for _, header := range []string{"X-Next-Cursor", "X-Contents-Commit"} {
			if recorder.Header().Get(header) != "" {
				observed = append(observed, header)
			}
		}
		require.ElementsMatch(t, []string{"X-Next-Cursor", "X-Contents-Commit"}, observed)

		// A file read answers before the pager runs, so the documented
		// "directory listings" wording must stay true of it.
		file := withRouteParams(httptest.NewRequest(http.MethodGet, "/api/repos/alice/demo/contents/README.md", nil), map[string]string{"owner": "alice", "repo": "demo", "*": "README.md"})
		fileRecorder := httptest.NewRecorder()
		handler := RepoHandler{Service: service}
		handler.GetRepoContents(fileRecorder, file)
		require.Equal(t, http.StatusOK, fileRecorder.Code)
		for _, header := range observed {
			assert.Empty(t, fileRecorder.Header().Get(header), "a file read sets no %s", header)
		}

		for path, operation := range operations {
			success, ok := operation.Responses["200"]
			require.True(t, ok, "%s declares no 200 response", path)
			declared := make([]string, 0, len(success.Headers))
			for name := range success.Headers {
				declared = append(declared, name)
			}
			assert.ElementsMatch(t, observed, declared, "%s 200 response headers", path)
			for _, name := range observed {
				assert.Equal(t, "string", success.Headers[name].Schema.Type, "%s %s", path, name)
			}
		}
	})
}
