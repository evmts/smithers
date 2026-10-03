package microsandbox

import (
	"encoding/json"
	"fmt"
	"github.com/smithersai/smithers/packages/backend/egressrelay"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

func customImage() *workspaceapi.WorkspaceImage {
	return &workspaceapi.WorkspaceImage{Ref: "python:3.13-slim", Digest: "sha256:" + strings.Repeat("a", 64)}
}

func customImageRuntime(t *testing.T) (*Runtime, string) {
	t.Helper()
	r, log := reclaimFakeMSB(t, 0)
	applyDefaults(&r.config)
	require.NoError(t, os.MkdirAll(filepath.Join(r.root, "snapshots"), 0700))
	// A selected image must not consult prepared-environment admission/source.
	r.environments = &environments{}
	return r, log
}

func TestCustomImageNoneSurvivesSnapshotForkReclaimAndRecovery(t *testing.T) {
	r, log := customImageRuntime(t)
	r.config.HostPorts = []uint16{4000, 4001}
	image := customImage()
	spec := workspaceapi.WorkspaceSpec{ID: "trial", Image: image, Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}, Source: &workspaceapi.WorkspaceSource{Repository: "repo", Revision: "main"}}
	result, err := r.CreateWorkspace(t.Context(), spec)
	require.NoError(t, err)
	require.Equal(t, image, result.Image)
	require.Equal(t, "none", result.Network.Mode)
	created := invocations(t, log)[0]
	require.Contains(t, created, "create python@"+image.Digest+" --pull if-missing")
	require.Contains(t, created, "--no-net")
	require.NotContains(t, created, "--net-rule")
	require.NotContains(t, strings.Join(invocations(t, log), "\n"), "bridge")
	// Neither caller mutations nor returned pointers alter admitted metadata.
	image.Ref = "changed:latest"
	result.Network.Mode = "proxy"
	described, err := r.InspectWorkspace(t.Context(), "trial")
	require.NoError(t, err)
	require.Equal(t, "python:3.13-slim", described.Image.Ref)
	require.Equal(t, "none", described.Network.Mode)
	require.NoError(t, r.StopWorkspace(t.Context(), "trial"))
	_, err = r.CreateColdSnapshot(t.Context(), "trial", workspaceapi.ColdSnapshotSpec{ID: "snapshot"})
	require.NoError(t, err)
	fork, err := r.ForkColdSnapshot(t.Context(), "snapshot", workspaceapi.WorkspaceSpec{ID: "fork", Image: &workspaceapi.WorkspaceImage{Ref: "evil:latest", Digest: customImage().Digest}, Network: &workspaceapi.WorkspaceNetwork{Mode: "proxy"}})
	require.NoError(t, err)
	require.Equal(t, described.Image, fork.Image)
	require.Equal(t, described.Network, fork.Network)
	require.NoError(t, r.StopWorkspace(t.Context(), "fork"))
	require.NoError(t, r.ReclaimWorkspaceDisk(t.Context(), "fork"))
	// Load metadata into a new runtime before recovery/reclaimed restart.
	loaded := &Runtime{cli: r.cli, config: r.config, root: r.root, owner: r.owner, holder: r.holder, environments: r.environments, workspaces: map[string]*workspace{}}
	require.NoError(t, loaded.load())
	require.NoError(t, loaded.recover(t.Context()))
	resumed, err := loaded.StartWorkspace(t.Context(), "fork")
	require.NoError(t, err)
	require.Equal(t, described.Image, resumed.Image)
	require.Equal(t, described.Network, resumed.Network)
	lines := invocations(t, log)
	for _, line := range lines {
		if strings.HasPrefix(line, "create ") || strings.HasPrefix(line, "run ") {
			require.Contains(t, line, "--no-net")
			require.NotContains(t, line, "--net-rule")
		}
	}
	var booted bool
	for _, line := range lines {
		if strings.HasPrefix(line, "create python@"+customImage().Digest) && strings.Contains(line, r.machineName("fork")) {
			booted = true
		}
	}
	require.True(t, booted, "reclaimed fork must use original image, never the changed runtime default")
}

func TestCustomImageAndNetworkAdmissionRefusesInvalidRequests(t *testing.T) {
	r, log := customImageRuntime(t)
	for _, spec := range []workspaceapi.WorkspaceSpec{
		{ID: "bad", Image: &workspaceapi.WorkspaceImage{Ref: "python:latest", Digest: "sha256:bad"}},
		{ID: "bad", Image: &workspaceapi.WorkspaceImage{Ref: "python@sha256:" + strings.Repeat("b", 64), Digest: customImage().Digest}},
		{ID: "bad", Network: &workspaceapi.WorkspaceNetwork{Mode: "typo"}},
	} {
		_, err := r.CreateWorkspace(t.Context(), spec)
		require.Error(t, err, spec)
	}
	require.Empty(t, invocations(t, log), "refused admission never boots or plants a guest")
}

func TestWorkspaceImageReceiptChecksObservedRuntimeDigest(t *testing.T) {
	r, _ := customImageRuntime(t)
	ws := addReclaimWorkspace(t, r, "trial", string(workspaceapi.WorkspaceStopped), "")
	ws.Image = customImage()
	for _, test := range []struct {
		image   string
		failure string
	}{
		{"python@" + customImage().Digest, ""},
		{"python:latest", "runtime did not report"},
		{"python@sha256:" + strings.Repeat("b", 64), "differs from admitted"},
	} {
		script := fmt.Sprintf("#!/bin/sh\necho '[{\"name\":\"%s\",\"status\":\"stopped\",\"image\":\"%s\"}]'\n", ws.Machine, test.image)
		require.NoError(t, os.WriteFile(r.cli.binary, []byte(script), 0700))
		receipt, err := r.WorkspaceImageReceipt(t.Context(), ws.ID)
		if test.failure != "" {
			require.ErrorContains(t, err, test.failure)
		} else {
			require.NoError(t, err)
			require.Equal(t, *customImage(), receipt)
		}
	}
	_, err := r.WorkspaceImageReceipt(t.Context(), "missing")
	require.ErrorIs(t, err, workspaceapi.ErrWorkspaceNotFound)
}

func TestNetworkDefaults(t *testing.T) {
	for _, requested := range []*workspaceapi.WorkspaceNetwork{nil, {}, {Mode: "proxy"}} {
		network, err := normalizeNetwork(requested)
		require.NoError(t, err)
		require.Equal(t, "proxy", network.Mode)
	}
	network, err := normalizeNetwork(&workspaceapi.WorkspaceNetwork{Mode: "none"})
	require.NoError(t, err)
	require.Equal(t, "none", network.Mode)
	require.Equal(t, "registry.example.com:5000/repo@"+customImage().Digest, (workspaceapi.WorkspaceImage{Ref: "registry.example.com:5000/repo:tag", Digest: customImage().Digest}).PinnedReference())
}

func TestRootExecutionUsesGuestCommandProtocolAndRefusesUnknownUsers(t *testing.T) {
	r, _ := customImageRuntime(t)
	r.semaphore = make(chan struct{}, 2)
	ws := addReclaimWorkspace(t, r, "root-trial", string(workspaceapi.WorkspaceRunning), "")
	requestFile := filepath.Join(t.TempDir(), "request.json")
	script := fmt.Sprintf("#!/bin/sh\ncat > %q\nprintf '0\\n'\nprintf '\\000SMITHERS-EXIT 0\\000' >&2\n", requestFile)
	require.NoError(t, os.WriteFile(r.cli.binary, []byte(script), 0700))
	command := workspaceapi.Command{Args: []string{"id", "-u"}, Environment: map[string]string{"HOME": "/untrusted/home"}}
	result, err := r.ExecuteCommandAsUser(t.Context(), ws.ID, "root", command)
	require.NoError(t, err)
	require.Equal(t, 0, result.ExitCode)
	require.Equal(t, "0\n", result.Stdout)
	bytes, err := os.ReadFile(requestFile)
	require.NoError(t, err)
	var request execRequest
	require.NoError(t, json.Unmarshal(bytes, &request))
	require.Equal(t, "root", request.User)
	require.Equal(t, "/root", request.Env["HOME"])
	require.Equal(t, "/root/.cache", request.Env["XDG_CACHE_HOME"])
	require.Equal(t, guestRoot, request.Root)
	require.Equal(t, guestRoot, request.Cwd)
	_, err = r.ExecuteCommandAsUser(t.Context(), ws.ID, "nobody", command)
	require.ErrorContains(t, err, "developer or root")
	_, err = r.ExecuteCommandAsUser(t.Context(), "missing", "root", command)
	require.ErrorIs(t, err, workspaceapi.ErrWorkspaceNotFound)
	require.NoError(t, os.Remove(requestFile))
	ws.State = string(workspaceapi.WorkspaceStopped)
	_, err = r.ExecuteCommandAsUser(t.Context(), ws.ID, "root", command)
	require.ErrorIs(t, err, workspaceapi.ErrWorkspaceStopped)
	_, err = os.Stat(requestFile)
	require.ErrorIs(t, err, os.ErrNotExist, "stopped workspaces never start a root process")
}

func TestNoneExcludesBackendAndRelayWhileProxyRetainsExistingRoutes(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	relay, err := egressrelay.New(egressrelay.Config{Listener: listener})
	require.NoError(t, err)
	defer relay.Close()
	r, argv, _ := egressFakeMSB(t, relay)
	none := egressWorkspace(t, r, "none", string(workspaceapi.WorkspaceRunning), 0)
	none.Network = &workspaceapi.WorkspaceNetwork{Mode: "none"}
	flags := strings.Join(r.machineFlagsFor(none.ID, none.Network), " ")
	require.Contains(t, flags, "--no-net")
	require.NotContains(t, flags, "--net-rule")
	_, err = r.BindEgressSecrets(t.Context(), none.ID, []sandbox.EgressProxySecret{{Name: "TOKEN", Value: "secret", Hosts: []string{"example.com"}, MatchHeaders: []string{"authorization"}}})
	require.ErrorIs(t, err, workspaceapi.ErrEgressSecretsUnsupported)
	require.Empty(t, invocations(t, argv))
	require.NoError(t, r.startBridges(t.Context(), none))
	require.Empty(t, invocations(t, argv))
	flags = strings.Join(r.machineFlagsFor("proxy", &workspaceapi.WorkspaceNetwork{Mode: "proxy"}), " ")
	require.Contains(t, flags, "allow@host:tcp:4000")
	require.Contains(t, flags, fmt.Sprintf("allow@host:tcp:%d", relayPort(relay)))
	require.Equal(t, r.machineFlags("proxy"), r.machineFlagsFor("proxy", &workspaceapi.WorkspaceNetwork{Mode: "proxy"}), "proxy must keep today's host-port policy")
}

func TestRequestedResourcesPersistAcrossForkAndReclaimedRestart(t *testing.T) {
	r, log := customImageRuntime(t)
	resources := &workspaceapi.WorkspaceResources{VCPUCount: 2, MemoryMB: 768, DiskMB: 6144}
	spec := workspaceapi.WorkspaceSpec{ID: "sized", Image: customImage(), Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}, Resources: resources}
	created, err := r.CreateWorkspace(t.Context(), spec)
	require.NoError(t, err)
	require.Equal(t, resources, created.Resources)
	require.True(t, r.Capabilities().Resources)
	require.False(t, r.Capabilities().ResourcesDisk, "prepared snapshots cannot resize their disk")
	require.True(t, r.Capabilities().CustomImageResourcesDisk)
	require.Contains(t, invocations(t, log)[0], "--root-disk 6144M")
	require.Contains(t, invocations(t, log)[0], "-c 2 -m 768M")
	// Defaults change after admission; neither the running guest nor its forks
	// may silently adopt the new values.
	r.config.CPUs, r.config.MemoryMiB, r.config.DiskMiB = 4, 1024, 8192
	require.NoError(t, r.StopWorkspace(t.Context(), created.ID))
	_, err = r.CreateColdSnapshot(t.Context(), created.ID, workspaceapi.ColdSnapshotSpec{ID: "sized-snapshot"})
	require.NoError(t, err)
	_, err = r.ForkColdSnapshot(t.Context(), "sized-snapshot", workspaceapi.WorkspaceSpec{ID: "wrong-size", Resources: &workspaceapi.WorkspaceResources{DiskMB: 8192}})
	require.ErrorContains(t, err, "keeps its source disk size")
	fork, err := r.ForkColdSnapshot(t.Context(), "sized-snapshot", workspaceapi.WorkspaceSpec{ID: "sized-fork"})
	require.NoError(t, err)
	require.Equal(t, resources, fork.Resources)
	require.NoError(t, r.StopWorkspace(t.Context(), fork.ID))
	require.NoError(t, r.ReclaimWorkspaceDisk(t.Context(), fork.ID))
	loaded := &Runtime{cli: r.cli, config: r.config, root: r.root, owner: r.owner, holder: r.holder, environments: r.environments, workspaces: map[string]*workspace{}}
	require.NoError(t, loaded.load())
	require.NoError(t, loaded.recover(t.Context()))
	restarted, err := loaded.StartWorkspace(t.Context(), fork.ID)
	require.NoError(t, err)
	require.Equal(t, resources, restarted.Resources)
	for _, line := range invocations(t, log) {
		if strings.HasPrefix(line, "create ") || strings.HasPrefix(line, "run ") {
			require.Contains(t, line, "-c 2 -m 768M")
			if strings.HasPrefix(line, "create ") {
				require.Contains(t, line, "--root-disk 6144M")
			} else {
				require.NotContains(t, line, "--root-disk")
			}
		}
	}
	resources.MemoryMB = 2048
	created.Resources.MemoryMB = 4096
	require.Equal(t, int32(768), loaded.workspaces[fork.ID].Resources.MemoryMB, "durable resources never alias caller values")
}

func TestResourceAdmissionDefaultsLegacyMetadataAndRejectsNegativeSizes(t *testing.T) {
	r, log := customImageRuntime(t)
	for _, resources := range []*workspaceapi.WorkspaceResources{{VCPUCount: -1}, {MemoryMB: -1}, {DiskMB: -1}} {
		_, err := r.CreateWorkspace(t.Context(), workspaceapi.WorkspaceSpec{ID: "invalid", Image: customImage(), Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}, Resources: resources})
		require.ErrorContains(t, err, "positive")
	}
	require.Empty(t, invocations(t, log))
	partial, err := r.resourcesFor(&workspaceapi.WorkspaceResources{MemoryMB: 1024})
	require.NoError(t, err)
	require.Equal(t, int32(r.config.CPUs), partial.VCPUCount)
	require.Equal(t, int32(1024), partial.MemoryMB)
	require.Equal(t, int32(r.config.DiskMiB), partial.DiskMB)
	legacy := addReclaimWorkspace(t, r, "legacy-size", string(workspaceapi.WorkspaceStopped), "")
	require.Nil(t, legacy.Resources)
	loaded := &Runtime{cli: r.cli, config: r.config, root: r.root, workspaces: map[string]*workspace{}}
	require.NoError(t, loaded.load())
	require.Equal(t, &workspaceapi.WorkspaceResources{VCPUCount: int32(r.config.CPUs), MemoryMB: int32(r.config.MemoryMiB), DiskMB: int32(r.config.DiskMiB)}, loaded.workspaces[legacy.ID].Resources)
}

func TestReusedWorkspaceRefusesDifferentExecutionPolicy(t *testing.T) {
	r, _ := customImageRuntime(t)
	spec := workspaceapi.WorkspaceSpec{ID: "existing", Image: customImage(), Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}, Resources: &workspaceapi.WorkspaceResources{VCPUCount: 2, MemoryMB: 768, DiskMB: 4096}}
	_, err := r.CreateWorkspace(t.Context(), spec)
	require.NoError(t, err)
	_, err = r.CreateWorkspace(t.Context(), spec)
	require.NoError(t, err, "same admitted policy is idempotent")
	requests := []workspaceapi.WorkspaceSpec{
		{ID: spec.ID, Image: &workspaceapi.WorkspaceImage{Ref: "python:3.13-slim", Digest: "sha256:" + strings.Repeat("b", 64)}},
		{ID: spec.ID, Network: &workspaceapi.WorkspaceNetwork{Mode: "proxy"}},
		{ID: spec.ID, Resources: &workspaceapi.WorkspaceResources{VCPUCount: 1, MemoryMB: 768, DiskMB: 4096}},
	}
	for _, request := range requests {
		_, err := r.CreateWorkspace(t.Context(), request)
		require.ErrorContains(t, err, "different")
	}
}
