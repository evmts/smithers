package compose

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// Security item 9 (CEO d-g18ys0, PM d-389ie6): on hosted smithers.sh the
// manual workspace routes that create or wake a box are closed to everyone
// but the staff list (sandbox.hosted_workspace_user_ids). They take no
// per-payer lock and no plan check on a small shared pool. The refusal is
// typed (workspaces_unavailable, 503) and comes before the handler, so no
// workspace row or box exists. Reads, delete, suspend and the terminal stay
// open, and a single-owner install is unchanged.

// recordingWorkspaceService records every workspace service call a route
// reaches. The box-creating methods are the only way a route makes a row or
// a box, so zero calls proves neither exists.
type recordingWorkspaceService struct {
	routes.WorkspaceRouteService
	mu    sync.Mutex
	calls []string
}

func (s *recordingWorkspaceService) record(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, name)
}

func (s *recordingWorkspaceService) recorded() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.calls...)
}

func (s *recordingWorkspaceService) CreateWorkspace(context.Context, services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
	s.record("CreateWorkspace")
	return services.WorkspaceResponse{ID: "w1"}, nil
}

func (s *recordingWorkspaceService) ResumeWorkspace(context.Context, string, int64, int64) (services.WorkspaceResponse, error) {
	s.record("ResumeWorkspace")
	return services.WorkspaceResponse{ID: "w1"}, nil
}

func (s *recordingWorkspaceService) ForkWorkspace(context.Context, services.ForkWorkspaceInput) (services.WorkspaceResponse, error) {
	s.record("ForkWorkspace")
	return services.WorkspaceResponse{ID: "w2"}, nil
}

func (s *recordingWorkspaceService) CreateWorkspaceSnapshot(context.Context, services.CreateWorkspaceSnapshotInput) (services.WorkspaceSnapshotResponse, error) {
	s.record("CreateWorkspaceSnapshot")
	return services.WorkspaceSnapshotResponse{}, nil
}

func (s *recordingWorkspaceService) CreateSession(context.Context, services.CreateWorkspaceSessionInput) (services.WorkspaceSessionResponse, error) {
	s.record("CreateSession")
	return services.WorkspaceSessionResponse{}, nil
}

func (s *recordingWorkspaceService) GetWorkspace(context.Context, string, int64, int64) (services.WorkspaceResponse, error) {
	s.record("GetWorkspace")
	return services.WorkspaceResponse{ID: "w1"}, nil
}

func (s *recordingWorkspaceService) ListWorkspaces(context.Context, int64, int64, int, int) ([]services.WorkspaceResponse, int64, error) {
	s.record("ListWorkspaces")
	return nil, 0, nil
}

func (s *recordingWorkspaceService) DeleteWorkspace(context.Context, string, int64, int64) error {
	s.record("DeleteWorkspace")
	return nil
}

func (s *recordingWorkspaceService) SuspendWorkspace(context.Context, string, int64, int64) (services.WorkspaceResponse, error) {
	s.record("SuspendWorkspace")
	return services.WorkspaceResponse{ID: "w1"}, nil
}

// hostedWorkspaceBoxRoute is one gated route and the service method it
// reaches when admitted.
type hostedWorkspaceBoxRoute struct {
	name, path, body, method string
}

var hostedWorkspaceBoxRoutes = []hostedWorkspaceBoxRoute{
	{"create", "/api/repos/alice/demo/workspaces", `{"name":"dev"}`, "CreateWorkspace"},
	{"snapshot restore", "/api/repos/alice/demo/workspaces", `{"name":"dev","snapshot_id":"s1"}`, "CreateWorkspace"},
	{"resume", "/api/repos/alice/demo/workspaces/w1/resume", `{}`, "ResumeWorkspace"},
	{"fork", "/api/repos/alice/demo/workspaces/w1/fork", `{"name":"other"}`, "ForkWorkspace"},
	{"snapshot", "/api/repos/alice/demo/workspaces/w1/snapshot", `{"name":"snap"}`, "CreateWorkspaceSnapshot"},
	{"snapshot template", "/api/repos/alice/demo/workspace-snapshots", `{"workspace_id":"w1","name":"snap"}`, "CreateWorkspaceSnapshot"},
	{"session create", "/api/repos/alice/demo/workspace/sessions", `{"cols":80,"rows":24}`, "CreateSession"},
}

func hostedWorkspaceRouter(t *testing.T, mode, staff string) (http.Handler, *recordingWorkspaceService) {
	t.Helper()
	users, err := config.ParseHostedWorkspaceUserIDs(staff)
	require.NoError(t, err)
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = mode
	cfg.Sandbox.HostedWorkspaceUsers = users
	service := &recordingWorkspaceService{}
	router := buildRouterCompat(
		cfg, nil, nil,
		&routes.RepoHandler{}, &routes.AuthHandler{}, &routes.UserHandler{}, &routes.SSHKeyHandler{}, &routes.LabelHandler{},
		&routes.OrgHandler{}, &routes.LandingHandler{}, &routes.SearchHandler{Service: &mockRouterSearchService{}}, &routes.IssueHandler{},
		nil, &routes.GitSmartHandler{Service: &mockRouterGitService{}},
		nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil,
		&routes.WorkspaceHandler{Service: service},
		nil,
		&routes.WorkspaceTerminalHandler{},
		nil, nil, nil, nil,
	)
	return router, service
}

// hostedWorkspaceRequest is a write-scoped token request from userID on
// alice/demo, with the repository already resolved.
func hostedWorkspaceRequest(method, path, body string, userID int64) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	ctx := middleware.ContextWithAuthInfo(req.Context(), &middleware.AuthInfo{
		User:        &db.User{ID: userID, Username: "alice", LowerUsername: "alice"},
		Scopes:      middleware.ScopeSet{middleware.ScopeWriteRepository: {}, middleware.ScopeReadRepository: {}},
		IsTokenAuth: true,
	})
	return routerRepoContext(req.WithContext(ctx), "alice", "demo")
}

func requireWorkspacesUnavailable(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
	var body struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Fault   string `json:"fault"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body), rec.Body.String())
	assert.Equal(t, string(pkgerrors.CodeWorkspacesUnavailable), body.Code)
	assert.Equal(t, "Workspaces aren't open on smithers.sh yet. Ask for a change instead.", body.Message)
	assert.Empty(t, rec.Header().Get("Retry-After"), "waiting does not open the gate")
}

func TestHostedWorkspaceRoutesRefuseAPersonOffTheStaffList(t *testing.T) {
	for _, staff := range []string{"", "1,60,24"} {
		for _, route := range hostedWorkspaceBoxRoutes {
			t.Run(route.name+"/staff="+staff, func(t *testing.T) {
				router, service := hostedWorkspaceRouter(t, config.AuthModeMultitenant, staff)
				rec := httptest.NewRecorder()
				router.ServeHTTP(rec, hostedWorkspaceRequest(http.MethodPost, route.path, route.body, 7))
				requireWorkspacesUnavailable(t, rec)
				assert.Empty(t, service.recorded(), "refused before the handler: no workspace row, no box")
			})
		}
	}
}

func TestHostedWorkspaceRoutesAdmitTheStaffList(t *testing.T) {
	for _, userID := range []int64{1, 24, 60} {
		for _, route := range hostedWorkspaceBoxRoutes {
			t.Run(route.name, func(t *testing.T) {
				router, service := hostedWorkspaceRouter(t, config.AuthModeMultitenant, "1,60,24")
				rec := httptest.NewRecorder()
				router.ServeHTTP(rec, hostedWorkspaceRequest(http.MethodPost, route.path, route.body, userID))
				assert.NotContains(t, rec.Body.String(), string(pkgerrors.CodeWorkspacesUnavailable))
				assert.Less(t, rec.Code, 300, rec.Body.String())
				assert.Equal(t, []string{route.method}, service.recorded(), "user %d reaches the handler", userID)
			})
		}
	}
}

// An unauthenticated request keeps its 401: the gate sits after RequireAuth.
func TestHostedWorkspaceRoutesKeepTheUnauthenticated401(t *testing.T) {
	for _, route := range hostedWorkspaceBoxRoutes {
		t.Run(route.name, func(t *testing.T) {
			router, service := hostedWorkspaceRouter(t, config.AuthModeMultitenant, "1,60,24")
			req := httptest.NewRequest(http.MethodPost, route.path, strings.NewReader(route.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, routerRepoContext(req, "alice", "demo"))
			assert.Equal(t, http.StatusUnauthorized, rec.Code, rec.Body.String())
			assert.Empty(t, service.recorded())
		})
	}
}

// Reads, delete, suspend and the terminal on an existing box stay open to a
// person off the staff list.
func TestHostedWorkspaceGateLeavesReadsDeleteSuspendAndTerminalOpen(t *testing.T) {
	for _, route := range []struct {
		name, method, path, reaches string
	}{
		{"list", http.MethodGet, "/api/repos/alice/demo/workspaces", "ListWorkspaces"},
		{"get", http.MethodGet, "/api/repos/alice/demo/workspaces/w1", "GetWorkspace"},
		{"delete", http.MethodDelete, "/api/repos/alice/demo/workspaces/w1", "DeleteWorkspace"},
		{"suspend", http.MethodPost, "/api/repos/alice/demo/workspaces/w1/suspend", "SuspendWorkspace"},
		{"terminal", http.MethodGet, "/api/repos/alice/demo/workspace/sessions/session-1/terminal", ""},
	} {
		t.Run(route.name, func(t *testing.T) {
			router, service := hostedWorkspaceRouter(t, config.AuthModeMultitenant, "1,60,24")
			body := ""
			if route.method == http.MethodPost {
				body = `{}`
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, hostedWorkspaceRequest(route.method, route.path, body, 7))
			assert.NotContains(t, rec.Body.String(), string(pkgerrors.CodeWorkspacesUnavailable))
			assert.NotEqual(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
			if route.reaches != "" {
				assert.Contains(t, service.recorded(), route.reaches)
			}
		})
	}
}

// A single-owner install has no staff list: the gate is not mounted, so an
// empty list never locks the owner out of their own machine.
func TestHostedWorkspaceGateIsHostedOnly(t *testing.T) {
	for _, mode := range []string{config.AuthModeSelfHosted, ""} {
		cfg := &config.Config{Auth: config.AuthConfig{Mode: mode}}
		assert.Nil(t, hostedWorkspaceStaffGate(cfg), "mode %q", mode)
		next := staffImportWorkspaces{}
		assert.Equal(t, services.GitHubImportWorkspaceProvisioner(next), hostedImportWorkspaces(cfg, next), "mode %q", mode)
	}
	for _, route := range hostedWorkspaceBoxRoutes {
		t.Run(route.name, func(t *testing.T) {
			router, _ := hostedWorkspaceRouter(t, config.AuthModeSelfHosted, "")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, hostedWorkspaceRequest(http.MethodPost, route.path, route.body, 7))
			assert.NotContains(t, rec.Body.String(), string(pkgerrors.CodeWorkspacesUnavailable))
		})
	}
}

// countingImportWorkspaces records the import's box requests.
type countingImportWorkspaces struct{ calls int }

func (w *countingImportWorkspaces) CreateWorkspaceAsync(context.Context, services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
	w.calls++
	return services.WorkspaceResponse{ID: "w1", TargetBookmark: "main"}, nil
}

// A hosted GitHub import by a person off the staff list asks for no box; the
// importer defers it (github_import.go createBoundWorkspace) and the import
// still ends at source ready. A staff import starts its box.
func TestHostedImportStartsABoxOnlyForStaff(t *testing.T) {
	staff, err := config.ParseHostedWorkspaceUserIDs("1,60,24")
	require.NoError(t, err)
	cfg := &config.Config{Auth: config.AuthConfig{Mode: config.AuthModeMultitenant}, Sandbox: config.SandboxConfig{HostedWorkspaceUsers: staff}}
	next := &countingImportWorkspaces{}
	gated := hostedImportWorkspaces(cfg, next)

	_, err = gated.CreateWorkspaceAsync(context.Background(), services.CreateWorkspaceInput{UserID: 7})
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeWorkspacesUnavailable, apiErr.Code)
	assert.Equal(t, http.StatusServiceUnavailable, apiErr.Status)
	assert.Zero(t, next.calls, "no box for a person off the staff list")

	workspace, err := gated.CreateWorkspaceAsync(context.Background(), services.CreateWorkspaceInput{UserID: 60})
	require.NoError(t, err)
	assert.Equal(t, "w1", workspace.ID)
	assert.Equal(t, 1, next.calls)
}

// Anyone can create a repository or an organization on a hosted deployment,
// so its sandbox scheduler runs workflow jobs on machines only for the staff
// list's own repositories and the service-payer organizations', nobody by
// default. Outside multitenant mode every owner's run (ITEM 11).
func TestHostedWorkflowOwnersFollowTheStaffAndPayerLists(t *testing.T) {
	staff := config.HostedWorkspaceUsers{UserIDs: []int64{1, 24, 60}}
	payers := []int64{2, 4}
	for _, tc := range []struct {
		mode string
		want *services.WorkflowOwners
	}{
		{config.AuthModeMultitenant, &services.WorkflowOwners{Users: staff, Orgs: payers}},
		{config.AuthModeSelfHosted, nil},
		{"", nil},
	} {
		cfg := &config.Config{Auth: config.AuthConfig{Mode: tc.mode}, Sandbox: config.SandboxConfig{HostedWorkspaceUsers: staff}, Billing: config.BillingConfig{ServicePayerOrgIDs: payers}}
		assert.Equal(t, tc.want, hostedWorkflowOwners(cfg), "%q", tc.mode)
	}
	empty := &config.Config{Auth: config.AuthConfig{Mode: config.AuthModeMultitenant}}
	assert.Equal(t, &services.WorkflowOwners{}, hostedWorkflowOwners(empty), "unset lists admit nobody")
}

type repositoriesByID map[int64]db.Repository

func (r repositoriesByID) GetRepoByID(_ context.Context, id int64) (db.Repository, error) {
	repository, ok := r[id]
	if !ok {
		return db.Repository{}, pgx.ErrNoRows
	}
	return repository, nil
}

// The relay's repository job refusal reads the target's repository and asks
// the hosted workflow owners; a target that names no repository is refused.
func TestRepositoryJobsRefusedForFollowsTheWorkflowOwners(t *testing.T) {
	owners := &services.WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{1}}, Orgs: []int64{2}}
	repos := repositoriesByID{
		10: {ID: 10, UserID: pgtype.Int8{Int64: 1, Valid: true}},
		11: {ID: 11, UserID: pgtype.Int8{Int64: 9, Valid: true}},
		12: {ID: 12, OrgID: pgtype.Int8{Int64: 2, Valid: true}},
		13: {ID: 13, OrgID: pgtype.Int8{Int64: 7, Valid: true}},
	}
	refused := repositoryJobsRefusedFor(repos, owners)
	for tenant, want := range map[string]bool{
		"repository:10": false, "repository:11": true, "repository:12": false, "repository:13": true,
		"repository:0": true, "repository:x": true, "user:10": true, "": true,
	} {
		got, err := refused(context.Background(), flowruntime.Target{TenantID: tenant})
		require.NoError(t, err, tenant)
		assert.Equal(t, want, got, tenant)
	}
	_, err := refused(context.Background(), flowruntime.Target{TenantID: "repository:99"})
	require.ErrorIs(t, err, pgx.ErrNoRows, "a repository that cannot be read is an error, never an admit")
}
