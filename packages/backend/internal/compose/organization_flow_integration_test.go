package compose

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/testutil/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// organizationBridgeHost stands in only for the packaged TypeScript host: it
// answers the runtime bridge with the identity the resolver launched it
// under, and refuses any other bearer. Everything in front of it is product
// code: routes, auth, organization authorization, dispatch, the durable
// binding store and the host resolver.
type organizationBridgeHost struct {
	mu       sync.Mutex
	server   *httptest.Server
	launch   *flowhost.HostLaunch
	spec     flowhost.ProcessSpec
	starts   int
	requests []string
}

func newOrganizationBridgeHost(t *testing.T) *organizationBridgeHost {
	host := &organizationBridgeHost{}
	host.server = httptest.NewServer(http.HandlerFunc(host.serve))
	t.Cleanup(host.server.Close)
	return host
}

func (host *organizationBridgeHost) serve(w http.ResponseWriter, r *http.Request) {
	host.mu.Lock()
	launch := host.launch
	host.mu.Unlock()
	if launch == nil || r.Header.Get("Authorization") != "Bearer "+launch.Credential {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.URL.Path {
	case "/health":
		_ = json.NewEncoder(w).Encode(map[string]any{"runtimeBridge": flowruntime.Identity{
			Protocol: flowruntime.Protocol, RuntimeArtifactDigest: launch.Binding.RuntimeArtifactDigest,
			SourceRevision: launch.Binding.SourceRevision, OwnerGeneration: launch.Binding.OwnerGeneration,
		}})
	case "/rpc", "/projections":
		body, _ := io.ReadAll(r.Body)
		var frame struct {
			Tag string `json:"tag"`
		}
		_ = json.Unmarshal(body, &frame)
		host.mu.Lock()
		host.requests = append(host.requests, frame.Tag)
		host.mu.Unlock()
		value := `{"rows":[{"runId":"run-organization-intake","flowId":"organization/intake","status":"running"}]}`
		_, _ = w.Write([]byte(`{"_tag":"Exit","requestId":1,"exit":{"_tag":"Success","value":` + value + `}}` + "\n"))
	default:
		http.NotFound(w, r)
	}
}

func (host *organizationBridgeHost) InspectFlowHost(_ context.Context, launch flowhost.HostLaunch) (flowhost.Connection, error) {
	host.mu.Lock()
	defer host.mu.Unlock()
	if host.launch == nil || host.launch.Binding.ID != launch.Binding.ID || host.launch.Binding.OwnerGeneration != launch.Binding.OwnerGeneration {
		return flowhost.Connection{}, flowhost.ErrHostNotRunning
	}
	return flowhost.Connection{Endpoint: host.server.URL}, nil
}

func (host *organizationBridgeHost) StartFlowHost(_ context.Context, launch flowhost.HostLaunch) (flowhost.Connection, error) {
	spec, err := flowhost.BuildProcessSpec(launch, flowhost.WorkspacePaths{Root: "/workspace/org", StateDir: "/workspace/state/organization"}, 4500)
	if err != nil {
		return flowhost.Connection{}, err
	}
	host.mu.Lock()
	defer host.mu.Unlock()
	host.launch, host.spec = &launch, spec
	host.starts++
	return flowhost.Connection{Endpoint: host.server.URL}, nil
}

func (host *organizationBridgeHost) ResolveFlowHostSource(context.Context, flowhost.Authority) (string, error) {
	return strings.Repeat("f", 40), nil
}

func (host *organizationBridgeHost) StopFlowHost(context.Context, flowhost.Binding) error {
	host.mu.Lock()
	defer host.mu.Unlock()
	host.launch = nil
	return nil
}

type organizationIntegrationWorkspaces struct {
	workspace services.WorkspaceResponse
	creates   int
}

func (w *organizationIntegrationWorkspaces) CreateWorkspace(context.Context, services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
	w.creates++
	return w.workspace, nil
}

func organizationIntegrationDatabase(t *testing.T) string {
	raw := os.Getenv("SMITHERS_PRODUCT_TEST_DATABASE_URL")
	if raw == "" {
		raw = os.Getenv("SMITHERS_TEST_DATABASE_URL")
	}
	if raw == "" {
		if os.Getenv("SMITHERS_REQUIRE_DATABASE_TESTS") == "1" {
			t.Fatal("PostgreSQL required")
		}
		t.Skip("PostgreSQL not configured")
	}
	return raw
}

func mintOrganizationToken(t *testing.T, q *db.Queries, userID int64, name, scopes string) string {
	t.Helper()
	sum := sha256.Sum256([]byte(name + ":" + uuid.NewString()))
	token := "smithers_" + hex.EncodeToString(sum[:])[:40]
	hash := sha256.Sum256([]byte(token))
	hashString := hex.EncodeToString(hash[:])
	_, err := q.CreateAccessToken(context.Background(), db.CreateAccessTokenParams{UserID: userID, Name: name, TokenHash: hashString,
		TokenLastEight: hashString[len(hashString)-8:], Scopes: scopes,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}})
	require.NoError(t, err)
	return token
}

// The assembled organization family on real product SQL: the keeper starts
// the owner's host without a browser, the relay observes it through the same
// binding, and every other principal or repository is refused.
func TestOrganizationFamilyRunsAndRelaysOnlyForTheOwnerPostgres(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t, organizationIntegrationDatabase(t))
	ctx := context.Background()
	q := db.New(pool)
	ownerRow, err := q.BootstrapSelfHostOwner(ctx, db.BootstrapSelfHostOwnerParams{Username: "owner", LowerUsername: "owner", DisplayName: "Owner", PasswordHash: "unused"})
	require.NoError(t, err)
	owner, err := q.GetUserByID(ctx, ownerRow.ID)
	require.NoError(t, err)
	other, err := q.CreateUser(ctx, db.CreateUserParams{Username: "other", LowerUsername: "other", DisplayName: "Other"})
	require.NoError(t, err)
	var orgRepo, otherRepo, strangerRepo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public,default_bookmark) VALUES ($1,'org','org',false,'main') RETURNING id`, owner.ID).Scan(&orgRepo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public,default_bookmark) VALUES ($1,'notes','notes',false,'main') RETURNING id`, owner.ID).Scan(&otherRepo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,is_public,default_bookmark) VALUES ($1,'org','org',false,'main') RETURNING id`, other.ID).Scan(&strangerRepo))
	orgWorkspace, notesWorkspace, strangerWorkspace := uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err = pool.Exec(ctx, `INSERT INTO workspaces(id,repository_id,user_id,vm_id,status,kind) VALUES
		($1,$2,$3,'org','running','container'),($4,$5,$3,'notes','running','container'),($6,$7,$8,'stranger','running','container')`,
		orgWorkspace, orgRepo, owner.ID, notesWorkspace, otherRepo, strangerWorkspace, strangerRepo, other.ID)
	require.NoError(t, err)

	t.Setenv(organizationRepositoryEnvironment, "owner/org")
	t.Setenv("SMITHERS_ORGANIZATION_CONFIG", "Org/Organization.md")
	family, err := newOrganizationFamily(organizationTestRegistry, localTopology, q)
	require.NoError(t, err)
	require.True(t, family.enabled(), family.disabled)
	codec, err := newSecretCodec("integration-only-secret")
	require.NoError(t, err)
	bindings, err := flowhost.NewStore(pool, codec)
	require.NoError(t, err)
	host := newOrganizationBridgeHost(t)
	refuseOthers := flowhost.TargetResolverFunc(func(context.Context, flowruntime.Target) (flowhost.Authority, error) {
		return flowhost.Authority{}, errors.New("only the organization family is composed in this test")
	})
	resolver, err := flowhost.New(flowhost.Config{Store: bindings, Targets: withOrganizationTargets(refuseOthers, family),
		Launcher: host, Catalogs: []flowhost.Catalog{organizationCatalog(organizationTestRegistry)}})
	require.NoError(t, err)
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	dispatcher, err := flowdispatch.New(flowdispatch.Config{Store: store, Resolver: resolver})
	require.NoError(t, err)
	repos := services.NewRepoService(q, nil, "")
	workspaces := &organizationIntegrationWorkspaces{workspace: services.WorkspaceResponse{ID: orgWorkspace, Status: "running"}}

	// Before the keeper runs, the relay has no host to observe: reads never start one.
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeSelfHosted
	router := chi.NewRouter()
	writes, reads := flowRelayAccess(cfg, q)
	api := &browserFlowAPI{repos: repos, workspaces: workspaces, queries: q, dispatcher: dispatcher, organization: family}
	mountOrganizationRelay(router, writes, reads, api)
	ownerToken := mintOrganizationToken(t, q, owner.ID, "owner", "all")
	call := func(method, path, token, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		return recorder
	}
	const listRuns = `{"repo":"owner/org","procedure":"Projection.Snapshot","payload":{"selector":{"_tag":"workspace-runs"}}}`
	before := call(http.MethodPost, "/api/organization/rpc", ownerToken, listRuns)
	require.Equal(t, http.StatusServiceUnavailable, before.Code, before.Body.String())
	require.Contains(t, before.Body.String(), "runtime_host_not_running")
	require.Zero(t, host.starts)

	keeper := (&flowComposition{organization: family, resolver: resolver}).organizationKeeper(repos, workspaces)
	require.NotNil(t, keeper)
	require.NoError(t, keeper.ensure(ctx))
	require.NoError(t, keeper.ensure(ctx), "a second pass reconnects to the verified live host")
	require.Equal(t, 1, host.starts)
	require.Equal(t, "smithers-organization-host", host.spec.Name)
	require.Equal(t, "Org/Organization.md", host.spec.Environment["SMITHERS_ORGANIZATION_CONFIG"])
	require.Equal(t, organizationTestRegistry.Organization.Executable, host.spec.Args[0])
	var kind, bindingID, principal, catalog, state string
	require.NoError(t, pool.QueryRow(ctx, `SELECT binding_kind, binding_id, principal_id, catalog_key, state FROM flow_runtime_host_bindings WHERE workspace_id=$1`, orgWorkspace).
		Scan(&kind, &bindingID, &principal, &catalog, &state))
	require.Equal(t, []string{organizationBindingKind, "owner/org", "user:" + strconv.FormatInt(owner.ID, 10), flowhost.CatalogOrganization, "running"},
		[]string{kind, bindingID, principal, catalog, state})

	// The owner observes the host's durable runs through the relay.
	observed := call(http.MethodPost, "/api/organization/rpc", ownerToken, listRuns)
	require.Equal(t, http.StatusOK, observed.Code, observed.Body.String())
	require.JSONEq(t, `{"ok":true,"payload":{"rows":[{"runId":"run-organization-intake","flowId":"organization/intake","status":"running"}]}}`, observed.Body.String())
	provisioned := call(http.MethodPost, "/api/organization/provision", ownerToken, `{"repo":"owner/org"}`)
	require.Equal(t, http.StatusOK, provisioned.Code, provisioned.Body.String())
	require.Contains(t, provisioned.Body.String(), orgWorkspace)
	described := call(http.MethodGet, "/api/organization", ownerToken, "")
	require.Equal(t, http.StatusOK, described.Code, described.Body.String())
	require.JSONEq(t, `{"repo":"owner/org"}`, described.Body.String())
	require.Equal(t, 1, host.starts, "observation and provisioning reuse the one organization host")
	var bindingCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM flow_runtime_host_bindings WHERE catalog_key='organization'`).Scan(&bindingCount))
	require.Equal(t, 1, bindingCount)

	// Refusals: anonymous, another principal, a repository-bound or read-only
	// owner credential, and any repository but the configured one.
	requests := len(host.requests)
	otherToken := mintOrganizationToken(t, q, other.ID, "other", "all")
	boundToken := mintOrganizationToken(t, q, owner.ID, "bound", "read:repository,write:repository,repo:"+strconv.FormatInt(orgRepo, 10))
	readUserToken := mintOrganizationToken(t, q, owner.ID, "read-user", "read:user")
	for _, tc := range []struct {
		name, token string
		want        int
	}{
		{"anonymous", "", http.StatusUnauthorized},
		{"another principal", otherToken, http.StatusForbidden},
		{"repository-bound owner credential", boundToken, http.StatusForbidden},
		{"owner credential without repository scope", readUserToken, http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, call(http.MethodPost, "/api/organization/rpc", tc.token, listRuns).Code)
			require.Equal(t, tc.want, call(http.MethodPost, "/api/organization/provision", tc.token, `{"repo":"owner/org"}`).Code)
			require.Equal(t, tc.want, call(http.MethodGet, "/api/organization", tc.token, "").Code)
		})
	}
	refusals := map[string]string{}
	for _, repo := range []string{"owner/notes", "owner/missing", "other/org"} {
		refused := call(http.MethodPost, "/api/organization/rpc", ownerToken, `{"repo":"`+repo+`","procedure":"List","payload":{"_tag":"flows"}}`)
		require.Equal(t, http.StatusNotFound, refused.Code, repo)
		refusals[repo] = refused.Body.String()
	}
	require.Equal(t, refusals["owner/missing"], refusals["owner/notes"], "a real repository answers like a missing one")
	require.Equal(t, refusals["owner/missing"], refusals["other/org"])
	require.Len(t, host.requests, requests, "no refused request reached the organization host")

	// The durable resolver re-derives authority: a target naming another
	// principal's workspace or another repository never resolves.
	for _, target := range []flowruntime.Target{
		{TenantID: "repository:" + strconv.FormatInt(strangerRepo, 10), PrincipalID: "user:" + strconv.FormatInt(other.ID, 10),
			WorkspaceID: strangerWorkspace, BindingKind: organizationBindingKind, BindingID: "owner/org"},
		{TenantID: "repository:" + strconv.FormatInt(otherRepo, 10), PrincipalID: "user:" + strconv.FormatInt(owner.ID, 10),
			WorkspaceID: notesWorkspace, BindingKind: organizationBindingKind, BindingID: "owner/org"},
		{TenantID: "repository:" + strconv.FormatInt(orgRepo, 10), PrincipalID: "user:" + strconv.FormatInt(owner.ID, 10),
			WorkspaceID: notesWorkspace, BindingKind: organizationBindingKind, BindingID: "owner/org"},
	} {
		_, err := resolver.ResolveFlowRuntime(ctx, target)
		require.Error(t, err, "%+v", target)
	}

	// Unconfigured: the same routes answer the owner exactly as a foreign repository.
	t.Setenv(organizationRepositoryEnvironment, "")
	disabled, err := newOrganizationFamily(organizationTestRegistry, localTopology, q)
	require.NoError(t, err)
	require.False(t, disabled.enabled())
	api.organization = disabled
	unconfigured := call(http.MethodPost, "/api/organization/rpc", ownerToken, listRuns)
	require.Equal(t, http.StatusNotFound, unconfigured.Code)
	require.Equal(t, refusals["owner/missing"], unconfigured.Body.String())
	require.Equal(t, http.StatusNotFound, call(http.MethodGet, "/api/organization", ownerToken, "").Code)
	require.Nil(t, (&flowComposition{organization: disabled, resolver: resolver}).organizationKeeper(repos, workspaces))
}
