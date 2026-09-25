package flowhost

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
)

func TestBuildProcessSpecUsesSameImmutableIdentityForWorkspaceAdapters(t *testing.T) {
	target := flowruntime.Target{TenantID: "repository:5", PrincipalID: "user:9", BindingKind: "agent-session", BindingID: "session-1"}
	authority := Authority{Target: target, RepositoryID: 5, UserID: 9, WorkspaceID: "workspace-1", CatalogKey: CatalogCoding, SourceRevision: strings.Repeat("b", 40)}
	catalog := Catalog{Key: CatalogCoding, Family: CatalogCoding, Executable: "/opt/smithers/coding-host",
		ArtifactDigest: strings.Repeat("a", 64),
		ServiceName:    "smithers-flow-coding", ImplementationModel: "openai:gpt-5"}
	binding := Binding{ID: "11111111-1111-4111-8111-111111111111", TenantID: target.TenantID,
		PrincipalID: target.PrincipalID, BindingKind: target.BindingKind, BindingID: target.BindingID,
		RepositoryID: 5, UserID: 9, WorkspaceID: "workspace-1", CatalogKey: CatalogCoding,
		ServiceName: catalog.ServiceName, RuntimeArtifactDigest: catalog.ArtifactDigest,
		SourceRevision: authority.SourceRevision, OwnerGeneration: 7, State: "starting"}
	spec, err := BuildProcessSpec(HostLaunch{Binding: binding, Authority: authority, Catalog: catalog, Credential: "bearer"},
		WorkspacePaths{Root: "/workspace/repo", StateDir: "/workspace/state"}, 4317)
	require.NoError(t, err)
	assert.Equal(t, "127.0.0.1:4317", spec.ReadyAddress)
	assert.Equal(t, []string{"/opt/smithers/coding-host", "serve", "--root", "/workspace/repo", "--state-dir",
		"/workspace/state", "--host", "127.0.0.1", "--port", "4317", "--listen"}, spec.Args)
	assert.Equal(t, "bearer", spec.Environment["SMITHERS_API_KEY"])
	assert.Equal(t, "7", spec.Environment["SMITHERS_OWNER_GENERATION"])
	assert.Equal(t, "openai:gpt-5", spec.Environment["SMITHERS_CODING_IMPLEMENT_MODEL"])
	assert.NotContains(t, spec.Identity, "bearer")
	otherPort, err := BuildProcessSpec(HostLaunch{Binding: binding, Authority: authority, Catalog: catalog, Credential: "bearer"}, WorkspacePaths{Root: "/workspace/repo", StateDir: "/workspace/state"}, 4318)
	require.NoError(t, err)
	assert.Equal(t, spec.Identity, otherPort.Identity)
	assert.NotEqual(t, spec.ReadyAddress, otherPort.ReadyAddress)
	catalog.ImplementationModel = ""
	_, err = validateCatalog(catalog)
	require.NoError(t, err)
	spec, err = BuildProcessSpec(HostLaunch{Binding: binding, Authority: authority, Catalog: catalog, Credential: "bearer"}, WorkspacePaths{Root: "/workspace/repo", StateDir: "/workspace/state"}, 4317)
	require.NoError(t, err)
	assert.NotContains(t, spec.Environment, "SMITHERS_CODING_IMPLEMENT_MODEL")
}

func organizationLaunch() (HostLaunch, Catalog) {
	target := flowruntime.Target{TenantID: "repository:5", PrincipalID: "user:9", BindingKind: "organization", BindingID: "owner/org"}
	authority := Authority{Target: target, RepositoryID: 5, UserID: 9, WorkspaceID: "22222222-2222-4222-8222-222222222222",
		CatalogKey: CatalogOrganization, Repository: "owner/org", SourceRevision: strings.Repeat("c", 40)}
	catalog := Catalog{Key: CatalogOrganization, Family: CatalogOrganization, Executable: "/opt/smithers/organization-host",
		ArtifactDigest: strings.Repeat("d", 64), ServiceName: "smithers-organization-host",
		Environment: map[string]string{
			"ANTHROPIC_API_KEY": "model-key", OrganizationConfigEnvironment: "Org/Organization.md",
			"SMITHERS_SLACK_APP_TOKEN": "xapp-token",
		}}
	binding := Binding{ID: "33333333-3333-4333-8333-333333333333", TenantID: target.TenantID,
		PrincipalID: target.PrincipalID, BindingKind: target.BindingKind, BindingID: target.BindingID,
		RepositoryID: 5, UserID: 9, WorkspaceID: authority.WorkspaceID, CatalogKey: CatalogOrganization,
		ServiceName: catalog.ServiceName, RuntimeArtifactDigest: catalog.ArtifactDigest,
		SourceRevision: authority.SourceRevision, OwnerGeneration: 3, State: "starting"}
	return HostLaunch{Binding: binding, Authority: authority, Catalog: catalog, Credential: "organization-bearer"}, catalog
}

func TestBuildProcessSpecLaunchesOrganizationHostWithCatalogEnvironment(t *testing.T) {
	launch, catalog := organizationLaunch()
	validated, err := validateCatalog(catalog)
	require.NoError(t, err)
	launch.Catalog = validated
	spec, err := BuildProcessSpec(launch, WorkspacePaths{Root: "/workspace/org", StateDir: "/workspace/state/organization"}, 4400)
	require.NoError(t, err)
	assert.Equal(t, []string{"/opt/smithers/organization-host", "serve", "--root", "/workspace/org", "--state-dir",
		"/workspace/state/organization", "--host", "127.0.0.1", "--port", "4400", "--listen"}, spec.Args)
	assert.Equal(t, "smithers-organization-host", spec.Name)
	assert.Equal(t, map[string]string{
		"SMITHERS_API_KEY": "organization-bearer", "SMITHERS_GATEWAY_ID": launch.Binding.ID,
		"SMITHERS_OWNER_GENERATION": "3", "SMITHERS_FLOW_ARTIFACT_SHA256": strings.Repeat("d", 64),
		"SMITHERS_SOURCE_REVISION": strings.Repeat("c", 40), "ANTHROPIC_API_KEY": "model-key",
		OrganizationConfigEnvironment: "Org/Organization.md", "SMITHERS_SLACK_APP_TOKEN": "xapp-token",
	}, spec.Environment, "the organization host gets its identity plus the operator catalog, never the product API or another family's settings")
	assert.NotContains(t, spec.Identity, "organization-bearer")
	assert.NotContains(t, spec.Identity, "xapp-token")

	// A changed credential in the operator catalog replaces the live process.
	rotated := launch
	rotated.Catalog.Environment = map[string]string{"SMITHERS_SLACK_APP_TOKEN": "xapp-rotated"}
	other, err := BuildProcessSpec(rotated, WorkspacePaths{Root: "/workspace/org", StateDir: "/workspace/state/organization"}, 4400)
	require.NoError(t, err)
	assert.NotEqual(t, spec.Identity, other.Identity)

	launch.Authority.Repository = ""
	_, err = BuildProcessSpec(launch, WorkspacePaths{Root: "/workspace/org", StateDir: "/workspace/state/organization"}, 4400)
	require.ErrorContains(t, err, "organization host needs its authorized repository")
}

func TestValidateCatalogConfinesOrganizationConfigPath(t *testing.T) {
	_, catalog := organizationLaunch()
	for _, value := range []string{"Org/Organization.md", "Organization.md", "a/b/c.md"} {
		catalog.Environment = map[string]string{OrganizationConfigEnvironment: value}
		_, err := validateCatalog(catalog)
		require.NoError(t, err, value)
	}
	for _, value := range []string{"", " Org/Organization.md", "/etc/passwd", "../Org.md", "Org/../../x.md", "./Org.md",
		"Org//Organization.md", "Org/", "Org\\Organization.md", "Org/.", "Org/\x00.md"} {
		catalog.Environment = map[string]string{OrganizationConfigEnvironment: value}
		_, err := validateCatalog(catalog)
		require.Error(t, err, "%q", value)
	}
	coding := Catalog{Key: CatalogCoding, Family: CatalogCoding, Executable: "/opt/smithers/coding-host",
		ArtifactDigest: strings.Repeat("a", 64), ServiceName: "smithers-coding-host",
		Environment: map[string]string{OrganizationConfigEnvironment: "Org/Organization.md"}}
	_, err := validateCatalog(coding)
	require.Error(t, err, "only the organization family reads its configuration path")
	unknown := coding
	unknown.Environment, unknown.Family = nil, "unknown"
	_, err = validateCatalog(unknown)
	require.ErrorContains(t, err, "unsupported family")
}
