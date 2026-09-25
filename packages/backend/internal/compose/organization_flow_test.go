package compose

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/flowmanifest"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

const (
	organizationTestWorkspace = "44444444-4444-4444-8444-444444444444"
	organizationTestOwner     = int64(9)
	organizationTestRepo      = int64(31)
)

var organizationTestRegistry = &flowmanifest.Registry{HasOrganization: true,
	Organization: flowmanifest.Host{Executable: "/opt/smithers/smithers-organization-host", SHA256: strings.Repeat("e", 64), Flows: flowmanifest.OrganizationFlows()}}

type fakeOrganizationQueries struct {
	owner      db.User
	ownerErr   error
	repository db.Repository
	repoErr    error
	workspace  db.Workspace
	lookups    []db.GetActiveWorkspaceForUserRepoKindParams
}

func (q *fakeOrganizationQueries) GetSelfHostOwner(context.Context) (db.User, error) {
	return q.owner, q.ownerErr
}

func (q *fakeOrganizationQueries) GetRepoByOwnerAndLowerName(_ context.Context, params db.GetRepoByOwnerAndLowerNameParams) (db.Repository, error) {
	if q.repoErr != nil || !strings.EqualFold(params.Owner+"/"+params.LowerName, "owner/org") {
		return db.Repository{}, pgx.ErrNoRows
	}
	return q.repository, nil
}

func (q *fakeOrganizationQueries) GetWorkspaceForUserRepo(_ context.Context, params db.GetWorkspaceForUserRepoParams) (db.Workspace, error) {
	if params.ID != q.workspace.ID || params.RepositoryID != q.workspace.RepositoryID || params.UserID != q.workspace.UserID {
		return db.Workspace{}, pgx.ErrNoRows
	}
	return q.workspace, nil
}

func (q *fakeOrganizationQueries) GetActiveWorkspaceForUserRepoKind(_ context.Context, params db.GetActiveWorkspaceForUserRepoKindParams) (db.Workspace, error) {
	q.lookups = append(q.lookups, params)
	if params.RepositoryID != q.workspace.RepositoryID || params.UserID != q.workspace.UserID || params.Kind != "container" {
		return db.Workspace{}, pgx.ErrNoRows
	}
	return q.workspace, nil
}

func newFakeOrganizationQueries() *fakeOrganizationQueries {
	return &fakeOrganizationQueries{
		owner:      db.User{ID: organizationTestOwner, Username: "owner"},
		repository: db.Repository{ID: organizationTestRepo, UserID: pgtype.Int8{Int64: organizationTestOwner, Valid: true}, Name: "org", LowerName: "org"},
		workspace:  db.Workspace{ID: organizationTestWorkspace, RepositoryID: organizationTestRepo, UserID: organizationTestOwner, Status: "running"},
	}
}

func enabledOrganizationFamily(t *testing.T, queries organizationQueries) *organizationFamily {
	t.Helper()
	t.Setenv(organizationRepositoryEnvironment, "owner/org")
	family, err := newOrganizationFamily(organizationTestRegistry, localTopology, queries)
	require.NoError(t, err)
	require.True(t, family.enabled(), family.disabled)
	return family
}

func organizationTestTarget() flowruntime.Target {
	return flowruntime.Target{TenantID: "repository:31", PrincipalID: "user:9", WorkspaceID: organizationTestWorkspace,
		BindingKind: organizationBindingKind, BindingID: "owner/org"}
}

func TestOrganizationFamilyIsOptionalAndSingleOwner(t *testing.T) {
	queries := newFakeOrganizationQueries()
	for _, tc := range []struct {
		name, repository string
		registry         *flowmanifest.Registry
		role             topology
		disabled         string
	}{
		{name: "no manifest", repository: "owner/org", registry: nil, role: localTopology, disabled: "no organization host"},
		{name: "two-host manifest", repository: "owner/org", registry: &flowmanifest.Registry{}, role: localTopology, disabled: "no organization host"},
		{name: "unconfigured", repository: "", registry: organizationTestRegistry, role: localTopology, disabled: organizationRepositoryEnvironment + " is unset"},
		{name: "hosted", repository: "owner/org", registry: organizationTestRegistry, role: hostedWorkerTopology, disabled: "single-owner installations only"},
		{name: "enabled", repository: " owner/org ", registry: organizationTestRegistry, role: localTopology},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(organizationRepositoryEnvironment, tc.repository)
			family, err := newOrganizationFamily(tc.registry, tc.role, queries)
			require.NoError(t, err)
			require.Equal(t, tc.disabled == "", family.enabled())
			if tc.disabled != "" {
				require.Contains(t, family.disabled, tc.disabled)
				_, err := family.ResolveFlowHostTarget(context.Background(), organizationTestTarget())
				require.ErrorContains(t, err, "organization Flow family is disabled: "+family.disabled)
				return
			}
			require.Equal(t, "owner/org", family.repository)
			require.Equal(t, "owner", family.owner)
			require.Equal(t, "org", family.name)
		})
	}
	for _, invalid := range []string{"org", "owner/org/extra", "owner/..", "../org", "owner/", "/org", "owner/o rg"} {
		t.Setenv(organizationRepositoryEnvironment, invalid)
		_, err := newOrganizationFamily(organizationTestRegistry, localTopology, queries)
		require.ErrorContains(t, err, organizationRepositoryEnvironment, invalid)
	}
}

func TestOrganizationTargetResolverAuthorizesOnlyOwnerRepositoryWorkspace(t *testing.T) {
	queries := newFakeOrganizationQueries()
	family := enabledOrganizationFamily(t, queries)
	authority, err := family.ResolveFlowHostTarget(context.Background(), organizationTestTarget())
	require.NoError(t, err)
	require.Equal(t, flowhost.Authority{Target: organizationTestTarget(), RepositoryID: organizationTestRepo, UserID: organizationTestOwner,
		WorkspaceID: organizationTestWorkspace, CatalogKey: flowhost.CatalogOrganization, Repository: "owner/org"}, authority)

	for _, tc := range []struct {
		name   string
		change func(*flowruntime.Target, *fakeOrganizationQueries)
	}{
		{"browser binding kind", func(target *flowruntime.Target, _ *fakeOrganizationQueries) { target.BindingKind = "browser-flow" }},
		{"missing workspace", func(target *flowruntime.Target, _ *fakeOrganizationQueries) { target.WorkspaceID = "" }},
		{"another repository", func(target *flowruntime.Target, _ *fakeOrganizationQueries) { target.BindingID = "owner/other" }},
		{"case-changed repository", func(target *flowruntime.Target, _ *fakeOrganizationQueries) { target.BindingID = "Owner/Org" }},
		{"non-owner principal", func(target *flowruntime.Target, _ *fakeOrganizationQueries) { target.PrincipalID = "user:10" }},
		{"no installation owner", func(_ *flowruntime.Target, q *fakeOrganizationQueries) { q.ownerErr = pgx.ErrNoRows }},
		{"another tenant", func(target *flowruntime.Target, _ *fakeOrganizationQueries) { target.TenantID = "repository:32" }},
		{"missing repository", func(_ *flowruntime.Target, q *fakeOrganizationQueries) { q.repoErr = pgx.ErrNoRows }},
		{"repository of another user", func(_ *flowruntime.Target, q *fakeOrganizationQueries) {
			q.repository.UserID = pgtype.Int8{Int64: 10, Valid: true}
		}},
		{"organization-owned repository", func(_ *flowruntime.Target, q *fakeOrganizationQueries) {
			q.repository.OrgID = pgtype.Int8{Int64: 4, Valid: true}
		}},
		{"workspace of another user", func(_ *flowruntime.Target, q *fakeOrganizationQueries) { q.workspace.UserID = 10 }},
		{"suspended workspace", func(_ *flowruntime.Target, q *fakeOrganizationQueries) { q.workspace.Status = "suspended" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := newFakeOrganizationQueries()
			target := organizationTestTarget()
			tc.change(&target, changed)
			family.queries = changed
			_, err := family.ResolveFlowHostTarget(context.Background(), target)
			require.Error(t, err)
		})
	}
}

func TestWithOrganizationTargetsRoutesOnlyTheOrganizationKind(t *testing.T) {
	var baseCalls, organizationCalls int
	resolver := withOrganizationTargets(
		flowhost.TargetResolverFunc(func(context.Context, flowruntime.Target) (flowhost.Authority, error) {
			baseCalls++
			return flowhost.Authority{CatalogKey: flowhost.CatalogLibrarian}, nil
		}),
		flowhost.TargetResolverFunc(func(context.Context, flowruntime.Target) (flowhost.Authority, error) {
			organizationCalls++
			return flowhost.Authority{CatalogKey: flowhost.CatalogOrganization}, nil
		}))
	for _, kind := range []string{"browser-flow", "agent-session", "mythical-item"} {
		authority, err := resolver.ResolveFlowHostTarget(context.Background(), flowruntime.Target{BindingKind: kind})
		require.NoError(t, err)
		require.Equal(t, flowhost.CatalogLibrarian, authority.CatalogKey)
	}
	authority, err := resolver.ResolveFlowHostTarget(context.Background(), flowruntime.Target{BindingKind: organizationBindingKind})
	require.NoError(t, err)
	require.Equal(t, flowhost.CatalogOrganization, authority.CatalogKey)
	require.Equal(t, 3, baseCalls)
	require.Equal(t, 1, organizationCalls)
}

func TestOrganizationHostEnvironmentForwardsOnlyItsSettings(t *testing.T) {
	environment := organizationHostEnvironment([]string{
		"OPENAI_API_KEY=openai", "ANTHROPIC_API_KEY= anthropic ", "AI_GATEWAY_API_KEY=judge",
		"SMITHERS_EVALUATOR_BASE_URL=http://judge", "SMITHERS_CREDENTIAL_KEY=credential-key",
		"SMITHERS_ORGANIZATION_CONFIG=Org/Organization.md", "SMITHERS_ORGANIZATION_REPOSITORY=owner/org",
		"SMITHERS_SLACK_APP_TOKEN=xapp", "SMITHERS_GOOGLE_CLIENT_SECRET=google",
		"SMITHERS_SLACK_BOT_TOKEN=", "SMITHERS_ORGANIZATION=bare", "PATH=/usr/bin", "HOME=/home/owner",
		"SMITHERS_DATABASE_URL=postgres://secret", "SMITHERS_AUTH_BOOTSTRAP_TOKEN=bootstrap",
		"SMITHERS_WEBHOOK_SECRET_ENCRYPTION_KEY=codec", "SMITHERS_OPENAI_COMPATIBLE_BASE_URL=http://provider",
		"GITHUB_TOKEN=gh", "malformed",
	})
	require.Equal(t, map[string]string{
		"OPENAI_API_KEY": "openai", "ANTHROPIC_API_KEY": "anthropic", "AI_GATEWAY_API_KEY": "judge",
		"SMITHERS_EVALUATOR_BASE_URL": "http://judge", "SMITHERS_CREDENTIAL_KEY": "credential-key",
		"SMITHERS_ORGANIZATION_CONFIG": "Org/Organization.md", "SMITHERS_ORGANIZATION_REPOSITORY": "owner/org",
		"SMITHERS_SLACK_APP_TOKEN": "xapp", "SMITHERS_GOOGLE_CLIENT_SECRET": "google",
	}, environment)
}

type organizationCatalogLauncher struct{}

func (organizationCatalogLauncher) InspectFlowHost(context.Context, flowhost.HostLaunch) (flowhost.Connection, error) {
	return flowhost.Connection{}, flowhost.ErrHostNotRunning
}

func (organizationCatalogLauncher) StartFlowHost(context.Context, flowhost.HostLaunch) (flowhost.Connection, error) {
	return flowhost.Connection{}, errors.New("not started in this test")
}

type organizationCatalogStore struct{}

func (organizationCatalogStore) Acquire(context.Context, flowhost.Authority, flowhost.Catalog) (flowhost.BindingLease, error) {
	return nil, errors.New("unused")
}

func TestOrganizationCatalogIsAcceptedByTheHostResolver(t *testing.T) {
	t.Setenv("SMITHERS_ORGANIZATION_CONFIG", "Org/Organization.md")
	t.Setenv("SMITHERS_SLACK_APP_TOKEN", "xapp")
	catalog := organizationCatalog(organizationTestRegistry)
	require.Equal(t, flowhost.CatalogOrganization, catalog.Key)
	require.Equal(t, organizationServiceName, catalog.ServiceName)
	require.Equal(t, "xapp", catalog.Environment["SMITHERS_SLACK_APP_TOKEN"])
	_, err := flowhost.New(flowhost.Config{Store: organizationCatalogStore{}, Targets: flowhost.TargetResolverFunc(nil),
		Launcher: organizationCatalogLauncher{}, Catalogs: []flowhost.Catalog{catalog}})
	require.NoError(t, err)
	t.Setenv("SMITHERS_ORGANIZATION_CONFIG", "../outside.md")
	_, err = flowhost.New(flowhost.Config{Store: organizationCatalogStore{}, Targets: flowhost.TargetResolverFunc(nil),
		Launcher: organizationCatalogLauncher{}, Catalogs: []flowhost.Catalog{organizationCatalog(organizationTestRegistry)}})
	require.ErrorContains(t, err, "SMITHERS_ORGANIZATION_CONFIG", "an escaping configuration path refuses startup")
}

type organizationRelayDependencies struct {
	view     services.RepoView
	viewErr  error
	creates  []services.CreateWorkspaceInput
	created  services.WorkspaceResponse
	unusable bool
}

func (d *organizationRelayDependencies) GetRepoView(context.Context, *db.User, string, string) (services.RepoView, error) {
	return d.view, d.viewErr
}

func (d *organizationRelayDependencies) CreateWorkspace(_ context.Context, input services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
	d.creates = append(d.creates, input)
	return d.created, nil
}

func (d *organizationRelayDependencies) GetWorkspaceForUserRepo(context.Context, db.GetWorkspaceForUserRepoParams) (db.Workspace, error) {
	d.unusable = true
	return db.Workspace{}, pgx.ErrNoRows
}

func (d *organizationRelayDependencies) GetActiveWorkspaceForUserRepo(context.Context, db.GetActiveWorkspaceForUserRepoParams) (db.Workspace, error) {
	d.unusable = true
	return db.Workspace{}, pgx.ErrNoRows
}

func newOrganizationRelay(t *testing.T) (*browserFlowAPI, *organizationRelayDependencies, *fakeOrganizationQueries) {
	t.Helper()
	queries := newFakeOrganizationQueries()
	deps := &organizationRelayDependencies{
		view:    services.RepoView{Repository: queries.repository, CanWrite: true},
		created: services.WorkspaceResponse{ID: organizationTestWorkspace, Status: "running"},
	}
	api := &browserFlowAPI{repos: deps, workspaces: deps, queries: deps, organization: enabledOrganizationFamily(t, queries)}
	return api, deps, queries
}

func organizationRelayRequest(path, body string, user *db.User) *http.Request {
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if user != nil {
		request = request.WithContext(context.WithValue(request.Context(), middleware.UserContextKey, user))
	}
	return request
}

func TestOrganizationRelayBindsOwnerRepositoryToItsPrimaryWorkspace(t *testing.T) {
	owner := &db.User{ID: organizationTestOwner}
	t.Run("read", func(t *testing.T) {
		api, deps, queries := newOrganizationRelay(t)
		writer := httptest.NewRecorder()
		_, target, ok := api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"Owner/Org","procedure":"Projection.Snapshot","payload":{"selector":{"_tag":"workspace-runs"}}}`, owner), false)
		require.True(t, ok, writer.Body.String())
		require.Equal(t, organizationTestTarget(), target)
		require.Empty(t, deps.creates, "a read never provisions the organization workspace")
		require.False(t, deps.unusable, "the organization relay never uses the browser workspace lookups")
		require.Equal(t, []db.GetActiveWorkspaceForUserRepoKindParams{{RepositoryID: organizationTestRepo, UserID: organizationTestOwner, Kind: "container"}}, queries.lookups)
	})
	t.Run("read of a stopped host workspace", func(t *testing.T) {
		api, deps, queries := newOrganizationRelay(t)
		queries.workspace.Status = "suspended"
		writer := httptest.NewRecorder()
		_, _, ok := api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"owner/org","procedure":"List","payload":{"_tag":"flows"}}`, owner), false)
		require.False(t, ok)
		require.Equal(t, http.StatusNotFound, writer.Code)
		require.Empty(t, deps.creates)
	})
	t.Run("mutation", func(t *testing.T) {
		api, deps, _ := newOrganizationRelay(t)
		writer := httptest.NewRecorder()
		_, target, ok := api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"owner/org","procedure":"Cancel","payload":{}}`, owner), false)
		require.True(t, ok, writer.Body.String())
		require.Equal(t, organizationTestTarget(), target)
		require.Equal(t, []services.CreateWorkspaceInput{{RepositoryID: organizationTestRepo, UserID: organizationTestOwner, RepoOwner: "owner", RepoName: "org"}}, deps.creates)
	})
	t.Run("provision", func(t *testing.T) {
		api, deps, _ := newOrganizationRelay(t)
		writer := httptest.NewRecorder()
		api.provision(writer, organizationRelayRequest("/api/organization/provision", `{"repo":"owner/org"}`, owner))
		require.Equal(t, http.StatusOK, writer.Code)
		require.JSONEq(t, `{"status":"ready","workspaceId":"`+organizationTestWorkspace+`","gatewayId":"`+organizationTestWorkspace+`"}`, writer.Body.String())
		require.Len(t, deps.creates, 1)
	})
	t.Run("named workspace must be the organization workspace", func(t *testing.T) {
		api, _, _ := newOrganizationRelay(t)
		writer := httptest.NewRecorder()
		_, _, ok := api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"owner/org","workspaceId":"55555555-5555-4555-8555-555555555555","procedure":"List","payload":{}}`, owner), false)
		require.False(t, ok)
		require.Equal(t, http.StatusNotFound, writer.Code)
		writer = httptest.NewRecorder()
		_, _, ok = api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"owner/org","workspaceId":"`+organizationTestWorkspace+`","procedure":"List","payload":{}}`, owner), false)
		require.True(t, ok, writer.Body.String())
	})
	t.Run("workspace that cannot start", func(t *testing.T) {
		api, deps, _ := newOrganizationRelay(t)
		deps.created.Status = "failed"
		writer := httptest.NewRecorder()
		_, _, ok := api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"owner/org","procedure":"Run","payload":{}}`, owner), false)
		require.False(t, ok)
		require.Equal(t, http.StatusServiceUnavailable, writer.Code)
	})
}

// Every refusal a signed-in caller can reach answers byte-for-byte the same,
// and none of them provisions anything.
func TestOrganizationRelayRefusalsRevealNothing(t *testing.T) {
	owner := &db.User{ID: organizationTestOwner}
	var bodies []string
	for _, tc := range []struct {
		name   string
		body   string
		user   *db.User
		change func(*browserFlowAPI, *organizationRelayDependencies, *fakeOrganizationQueries)
	}{
		{name: "non-owner", body: `{"repo":"owner/org","procedure":"List"}`, user: &db.User{ID: 10}},
		{name: "another repository", body: `{"repo":"owner/other","procedure":"List"}`, user: owner},
		{name: "unconfigured", body: `{"repo":"owner/org","procedure":"List"}`, user: owner,
			change: func(api *browserFlowAPI, _ *organizationRelayDependencies, _ *fakeOrganizationQueries) {
				api.organization.disabled = organizationRepositoryEnvironment + " is unset"
			}},
		{name: "no installation owner", body: `{"repo":"owner/org","procedure":"Run"}`, user: owner,
			change: func(_ *browserFlowAPI, _ *organizationRelayDependencies, q *fakeOrganizationQueries) { q.ownerErr = pgx.ErrNoRows }},
		{name: "missing repository", body: `{"repo":"owner/org","procedure":"Run"}`, user: owner,
			change: func(_ *browserFlowAPI, d *organizationRelayDependencies, _ *fakeOrganizationQueries) {
				d.viewErr = pgx.ErrNoRows
			}},
		{name: "read-only repository", body: `{"repo":"owner/org","procedure":"Run"}`, user: owner,
			change: func(_ *browserFlowAPI, d *organizationRelayDependencies, _ *fakeOrganizationQueries) { d.view.CanWrite = false }},
		{name: "repository of another user", body: `{"repo":"owner/org","procedure":"Run"}`, user: owner,
			change: func(_ *browserFlowAPI, d *organizationRelayDependencies, _ *fakeOrganizationQueries) {
				d.view.Repository.UserID = pgtype.Int8{Int64: 10, Valid: true}
			}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api, deps, queries := newOrganizationRelay(t)
			if tc.change != nil {
				tc.change(api, deps, queries)
			}
			writer := httptest.NewRecorder()
			_, _, ok := api.prepare(writer, organizationRelayRequest("/api/organization/rpc", tc.body, tc.user), false)
			require.False(t, ok)
			require.Equal(t, http.StatusNotFound, writer.Code)
			require.Empty(t, deps.creates)
			require.Empty(t, queries.lookups)
			bodies = append(bodies, writer.Body.String())
		})
	}
	for _, body := range bodies {
		require.Equal(t, bodies[0], body)
	}
	api, _, _ := newOrganizationRelay(t)
	writer := httptest.NewRecorder()
	_, _, ok := api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"owner/org","procedure":"List"}`, nil), false)
	require.False(t, ok)
	require.Equal(t, http.StatusUnauthorized, writer.Code)
	writer = httptest.NewRecorder()
	_, _, ok = api.prepare(writer, organizationRelayRequest("/api/organization/rpc", `{"repo":"owner/org","procedure":"Unknown"}`, owner), false)
	require.False(t, ok)
	require.Equal(t, http.StatusBadRequest, writer.Code, "the organization relay keeps the browser procedure allowlist")
}

func TestOrganizationDescribeNamesTheRepositoryOnlyToTheOwner(t *testing.T) {
	api, _, queries := newOrganizationRelay(t)
	describe := func(user *db.User) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, "/api/organization", nil)
		if user != nil {
			request = request.WithContext(context.WithValue(request.Context(), middleware.UserContextKey, user))
		}
		writer := httptest.NewRecorder()
		api.describe(writer, request)
		return writer
	}
	writer := describe(&db.User{ID: organizationTestOwner})
	require.Equal(t, http.StatusOK, writer.Code)
	require.JSONEq(t, `{"repo":"owner/org"}`, writer.Body.String())
	require.Equal(t, "no-store", writer.Header().Get("Cache-Control"))
	require.Equal(t, http.StatusUnauthorized, describe(nil).Code)
	refused := describe(&db.User{ID: 10})
	require.Equal(t, http.StatusNotFound, refused.Code)
	require.NotContains(t, refused.Body.String(), "owner/org")
	queries.ownerErr = pgx.ErrNoRows
	require.Equal(t, http.StatusNotFound, describe(&db.User{ID: organizationTestOwner}).Code)
	queries.ownerErr = nil
	api.organization.disabled = "unset"
	disabled := describe(&db.User{ID: organizationTestOwner})
	require.Equal(t, http.StatusNotFound, disabled.Code)
	require.Equal(t, refused.Body.String(), disabled.Body.String())
	librarian := &browserFlowAPI{}
	writer = httptest.NewRecorder()
	librarian.describe(writer, httptest.NewRequest(http.MethodGet, "/api/organization", nil).WithContext(
		context.WithValue(context.Background(), middleware.UserContextKey, &db.User{ID: organizationTestOwner})))
	require.Equal(t, http.StatusNotFound, writer.Code)
}

// The librarian relay is unchanged: it still binds any writable repository
// under browser-flow and never consults the organization family.
func TestBrowserRelayWithoutOrganizationKeepsLibrarianBinding(t *testing.T) {
	deps := &browserReadDependencies{canWrite: true, workspace: db.Workspace{ID: organizationTestWorkspace, Status: "running"}}
	api := browserFlowAPI{repos: deps, workspaces: deps, queries: deps}
	writer := httptest.NewRecorder()
	_, target, ok := api.prepare(writer, organizationRelayRequest("/api/workflow/rpc", `{"repo":"owner/org","procedure":"List","payload":{}}`, &db.User{ID: 17}), false)
	require.True(t, ok, writer.Body.String())
	require.Equal(t, "browser-flow", target.BindingKind)
	require.Equal(t, "owner/org", target.BindingID)
}

type organizationKeeperRuntime struct {
	targets []flowruntime.Target
	err     error
}

func (r *organizationKeeperRuntime) ResolveFlowRuntime(_ context.Context, target flowruntime.Target) (flowruntime.Runtime, error) {
	r.targets = append(r.targets, target)
	return nil, r.err
}

func newOrganizationKeeper(t *testing.T) (*organizationKeeper, *organizationRelayDependencies, *fakeOrganizationQueries, *organizationKeeperRuntime) {
	t.Helper()
	api, deps, queries := newOrganizationRelay(t)
	runtime := &organizationKeeperRuntime{}
	return &organizationKeeper{family: api.organization, repos: deps, workspaces: deps, runtime: runtime}, deps, queries, runtime
}

func TestOrganizationKeeperProvisionsAndResolvesTheOwnerHost(t *testing.T) {
	keeper, deps, _, runtime := newOrganizationKeeper(t)
	require.NoError(t, keeper.ensure(context.Background()))
	require.NoError(t, keeper.ensure(context.Background()))
	require.Equal(t, []flowruntime.Target{organizationTestTarget(), organizationTestTarget()}, runtime.targets,
		"every pass resolves the same binding, so the resolver reconnects instead of creating another host")
	require.Equal(t, services.CreateWorkspaceInput{RepositoryID: organizationTestRepo, UserID: organizationTestOwner, RepoOwner: "owner", RepoName: "org"}, deps.creates[0])

	for _, tc := range []struct {
		name, reason string
		change       func(*organizationKeeper, *organizationRelayDependencies, *fakeOrganizationQueries, *organizationKeeperRuntime)
		resolves     bool
	}{
		{name: "disabled", reason: "disabled: " + organizationRepositoryEnvironment + " is unset",
			change: func(k *organizationKeeper, _ *organizationRelayDependencies, _ *fakeOrganizationQueries, _ *organizationKeeperRuntime) {
				k.family.disabled = organizationRepositoryEnvironment + " is unset"
			}},
		{name: "no owner", reason: "no installation owner",
			change: func(_ *organizationKeeper, _ *organizationRelayDependencies, q *fakeOrganizationQueries, _ *organizationKeeperRuntime) {
				q.ownerErr = pgx.ErrNoRows
			}},
		{name: "missing repository", reason: "does not name a repository the installation owner owns",
			change: func(_ *organizationKeeper, d *organizationRelayDependencies, _ *fakeOrganizationQueries, _ *organizationKeeperRuntime) {
				d.viewErr = pgx.ErrNoRows
			}},
		{name: "repository of another user", reason: "does not name a repository the installation owner owns",
			change: func(_ *organizationKeeper, d *organizationRelayDependencies, _ *fakeOrganizationQueries, _ *organizationKeeperRuntime) {
				d.view.Repository.UserID = pgtype.Int8{Int64: 10, Valid: true}
			}},
		{name: "workspace not running", reason: "organization workspace is failed",
			change: func(_ *organizationKeeper, d *organizationRelayDependencies, _ *fakeOrganizationQueries, _ *organizationKeeperRuntime) {
				d.created.Status = "failed"
			}},
		{name: "host refused", reason: "organization host unavailable: flow host: runtime_start_failed", resolves: true,
			change: func(_ *organizationKeeper, _ *organizationRelayDependencies, _ *fakeOrganizationQueries, r *organizationKeeperRuntime) {
				r.err = errors.New("flow host: runtime_start_failed")
			}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			keeper, deps, queries, runtime := newOrganizationKeeper(t)
			tc.change(keeper, deps, queries, runtime)
			err := keeper.ensure(context.Background())
			require.ErrorContains(t, err, tc.reason)
			require.Equal(t, tc.resolves, len(runtime.targets) == 1)
		})
	}
}

func TestOrganizationKeeperLogsOnlyTransitions(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	keeper, _, _, runtime := newOrganizationKeeper(t)
	runtime.err = errors.New("flow host: runtime_start_failed")
	keeper.pass(context.Background())
	keeper.pass(context.Background())
	require.Equal(t, 1, strings.Count(logs.String(), "organization Flow host is not running"), logs.String())
	runtime.err = nil
	keeper.pass(context.Background())
	keeper.pass(context.Background())
	require.Equal(t, 1, strings.Count(logs.String(), "organization Flow host is running"), logs.String())
	require.Len(t, runtime.targets, 4)
	require.NotContains(t, logs.String(), "SMITHERS_API_KEY")
}

func TestFlowCompositionOrganizationKeeperRequiresEnabledFamily(t *testing.T) {
	api, deps, _ := newOrganizationRelay(t)
	resolver := &flowhost.Resolver{}
	require.Nil(t, (*flowComposition)(nil).organizationKeeper(deps, deps))
	require.NotNil(t, (&flowComposition{organization: api.organization, resolver: resolver}).organizationKeeper(deps, deps))
	api.organization.disabled = "unset"
	require.Nil(t, (&flowComposition{organization: api.organization, resolver: resolver}).organizationKeeper(deps, deps))
	require.Nil(t, (&flowComposition{resolver: resolver}).organizationKeeper(deps, deps))
	require.Equal(t, "user:"+strconv.FormatInt(organizationTestOwner, 10), api.organization.target(organizationTestRepo, organizationTestOwner, organizationTestWorkspace).PrincipalID)
}
