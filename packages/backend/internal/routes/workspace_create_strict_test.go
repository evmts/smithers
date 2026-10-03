package routes

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/services"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

// Unsupported settings, including unknown fields nested in the admitted image,
// network and resource contract, must be refused before provisioning.
func TestCreateWorkspaceRefusesSettingsItDoesNotStore(t *testing.T) {
	for _, tc := range []struct {
		body  string
		field string
	}{
		{`{"name":"dev","resources":{"cpus":4,"memory_mb":8192,"disk_mb":32768}}`, `"cpus"`},
		{`{"name":"dev","network":{"mode":"proxy","permit_all":true}}`, `"permit_all"`},
		{`{"name":"dev","allow":["github.com"]}`, `"allow"`},
		{`{"name":"dev","network":{"mode":"proxy","allow":["github.com"]}}`, `"allow"`},
		{`{"name":"dev","idle_timeout_seconds":1800}`, `"idle_timeout_seconds"`},
		{`{"name":"dev","services":[{"name":"web","mode":"service","exec":["/bin/sh","-lc","npm start"]}]}`, `"services"`},
	} {
		t.Run(tc.field, func(t *testing.T) {
			called := false
			h := &WorkspaceHandler{Service: &mockWorkspaceRouteService{
				createWorkspaceFn: func(context.Context, services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
					called = true
					return services.WorkspaceResponse{ID: "ws-1"}, nil
				},
			}}
			rec := createWorkspaceRoute(h, tc.body)
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), "unknown field")
			require.Contains(t, rec.Body.String(), strings.Trim(tc.field, `"`))
			require.False(t, called, "an unsupported setting must never reach provisioning")
		})
	}
}

func TestCreateWorkspaceAcceptsImageAndNetworkContract(t *testing.T) {
	for _, network := range []workspaceapi.WorkspaceNetwork{
		{Mode: "none"},
		{Mode: "proxy"},
	} {
		t.Run(network.Mode, func(t *testing.T) {
			var got services.CreateWorkspaceInput
			h := &WorkspaceHandler{Service: &mockWorkspaceRouteService{
				createWorkspaceFn: func(_ context.Context, input services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
					got = input
					return services.WorkspaceResponse{ID: "ws-custom"}, nil
				},
			}}
			rec := createWorkspaceRoute(h, `{"name":"trial","image":"docker.io/library/python:3.13-slim","network":{"mode":"`+network.Mode+`"}}`)
			require.Less(t, rec.Code, 300, rec.Body.String())
			require.Equal(t, "docker.io/library/python:3.13-slim", got.Image)
			require.True(t, got.ImageRequested)
			require.Equal(t, &network, got.Network)
		})
	}
}

func TestCreateWorkspacePreservesExplicitEmptyImageRequest(t *testing.T) {
	for _, tc := range []struct {
		name      string
		body      string
		requested bool
	}{
		{name: "omitted", body: `{}`},
		{name: "null", body: `{"image":null}`},
		{name: "empty", body: `{"image":""}`, requested: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var got services.CreateWorkspaceInput
			calls := 0
			h := &WorkspaceHandler{Service: &mockWorkspaceRouteService{
				createWorkspaceFn: func(_ context.Context, input services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
					got = input
					calls++
					return services.WorkspaceResponse{ID: "ws-image-presence"}, nil
				},
			}}
			rec := createWorkspaceRoute(h, tc.body)
			require.Less(t, rec.Code, 300, rec.Body.String())
			require.Equal(t, 1, calls)
			require.Empty(t, got.Image)
			require.Equal(t, tc.requested, got.ImageRequested, "explicit empty images must reach typed admission refusal")
			require.Nil(t, got.Network)
		})
	}
}

func TestCreateWorkspaceRefusesMalformedImageAndNetworkContract(t *testing.T) {
	for _, body := range []string{
		`{"image":{"ref":"python:3.13-slim"}}`,
		`{"image":42}`,
		`{"network":"none"}`,
		`{"network":{"mode":42}}`,
		`{"network":[]}`,
	} {
		t.Run(body, func(t *testing.T) {
			h := &WorkspaceHandler{Service: &mockWorkspaceRouteService{
				createWorkspaceFn: func(context.Context, services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
					t.Fatal("malformed settings reached provisioning")
					return services.WorkspaceResponse{}, nil
				},
			}}
			rec := createWorkspaceRoute(h, body)
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		})
	}
}

func TestCreateWorkspaceAcceptsTheStoredContract(t *testing.T) {
	var got services.CreateWorkspaceInput
	h := &WorkspaceHandler{Service: &mockWorkspaceRouteService{
		createWorkspaceFn: func(_ context.Context, input services.CreateWorkspaceInput) (services.WorkspaceResponse, error) {
			got = input
			return services.WorkspaceResponse{ID: "ws-1"}, nil
		},
	}}
	rec := createWorkspaceRoute(h, `{"name":"issue-2924","snapshot_id":"snap-1","source_bookmark":"main","kind":"vm","client_lease_seconds":300,"resources":{"vcpu":4,"memory_mib":8192,"disk_gib":40}}`)
	require.Less(t, rec.Code, 300, rec.Body.String())
	require.Equal(t, "issue-2924", got.Name)
	require.Equal(t, "snap-1", got.SnapshotID)
	require.Equal(t, "main", got.SourceBookmark)
	require.Equal(t, "vm", got.Kind)
	require.Equal(t, int32(300), got.ClientLeaseSeconds)
	require.Equal(t, int32(4), *got.Resources.CPUs)
	require.Equal(t, int32(8192), *got.Resources.MemoryMB)
	require.Equal(t, int32(40), *got.Resources.DiskGiB)

	for _, body := range []string{`{"name":"dev"}{"name":"other"}`, `{"name":`, `[]`} {
		rec := createWorkspaceRoute(h, body)
		require.Equal(t, http.StatusBadRequest, rec.Code, body)
	}
}

func createWorkspaceRoute(h *WorkspaceHandler, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/repos/alice/demo/workspaces", strings.NewReader(body))
	req = withWorkspaceRepoCtx(req, "alice", "demo")
	req = withAuth(req, 1, "alice")
	rec := httptest.NewRecorder()
	h.CreateWorkspace(rec, req)
	return rec
}
