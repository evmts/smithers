package microsandbox

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

// This opt-in proof pulls only the selected public image and cleans its VMs
// and snapshots. Check uptime (1-minute load <50) before running it.
func TestRealMicroVMCustomImageRootAndNetworkNone(t *testing.T) {
	selected := os.Getenv("SMITHERS_MICROVM_CUSTOM_IMAGE")
	if selected == "" {
		t.Skip("SMITHERS_MICROVM_CUSTOM_IMAGE=python@sha256:<digest> enables the custom-image proof")
	}
	binary := os.Getenv("SMITHERS_MICROSANDBOX_BIN")
	require.NotEmpty(t, binary)
	guardCustomImageProofLoad(t, "qualification")
	_, digest, pinned := strings.Cut(selected, "@")
	require.True(t, pinned, "the proof requires an admitted pinned image")
	image := &workspaceapi.WorkspaceImage{Ref: "python:3.13-slim", Digest: digest}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("none workspace reached backend listener") }))
	defer upstream.Close()
	_, rawPort, err := net.SplitHostPort(upstream.Listener.Addr().String())
	require.NoError(t, err)
	port, err := strconv.ParseUint(rawPort, 10, 16)
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(operation("custom-image-none"), 5*time.Minute)
	defer cancel()
	runtime, err := New(ctx, Config{Binary: binary, Root: t.TempDir(), CPUs: 1, MemoryMiB: 512, DiskMiB: 2048, MaxRunningVMs: 2, HostPorts: []uint16{uint16(port)}})
	require.NoError(t, err)
	t.Cleanup(func() { sweepOwner(t, runtime) })
	guardCustomImageProofLoad(t, "create")
	created, err := runtime.CreateWorkspace(ctx, workspaceapi.WorkspaceSpec{ID: "custom-image", Image: image, Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}})
	require.NoError(t, err)
	receipt, err := runtime.WorkspaceImageReceipt(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, *image, receipt)
	t.Logf("image receipt: %s@%s", receipt.Ref, receipt.Digest)
	result, err := runtime.ExecuteCommandAsUser(ctx, created.ID, "root", workspaceapi.Command{Args: []string{"sh", "-c", "id -u; cat /etc/os-release"}})
	require.NoError(t, err)
	require.Equal(t, 0, result.ExitCode)
	require.True(t, strings.HasPrefix(result.Stdout, "0\n"))
	t.Logf("root exec:\n%s", result.Stdout)
	// Python slim has no curl. A bundle downloaded by apt in the same pinned
	// image lets this proof install it without granting the guest any egress.
	if bundle := os.Getenv("SMITHERS_MICROVM_CURL_BUNDLE"); bundle != "" {
		data, err := os.ReadFile(bundle)
		require.NoError(t, err)
		require.NoError(t, runtime.WriteFile(ctx, created.ID, "curl-debs.tar.gz", data, 0o600))
		result, err = runtime.ExecuteCommandAsUser(ctx, created.ID, "root", workspaceapi.Command{Args: []string{"sh", "-c", "mkdir /tmp/curl-debs && tar -xzf curl-debs.tar.gz -C /tmp/curl-debs && dpkg -i /tmp/curl-debs/*.deb"}})
		require.NoError(t, err)
		require.Zero(t, result.ExitCode, result.Stdout+result.Stderr)
		for _, args := range [][]string{
			{"curl", "-m", "5", "https://example.com"},
			{"curl", "-m", "5", "--resolve", "example.com:443:93.184.215.14", "https://example.com"},
		} {
			result, err = runtime.ExecuteCommandAsUser(ctx, created.ID, "root", workspaceapi.Command{Args: args})
			require.NoError(t, err)
			require.Contains(t, []int{6, 7}, result.ExitCode, "curl must report a DNS or connect refusal, not a missing executable or timeout")
			t.Logf("%s\nexit_code=%d\n%s", strings.Join(args, " "), result.ExitCode, result.Stderr)
		}
	}
	script := `import socket, sys
for host, port in [("example.com", 443), ("93.184.215.14", 443), ("host.microsandbox.internal", int(sys.argv[1])), ("127.0.0.1", int(sys.argv[1]))]:
    try:
        connection = socket.create_connection((host, port), timeout=2)
    except OSError as error:
        print("refused %s:%s: %s" % (host, port, error))
    else:
        connection.close()
        sys.exit("none policy allowed %s:%s" % (host, port))
`
	result, err = runtime.ExecuteCommandAsUser(ctx, created.ID, "root", workspaceapi.Command{Args: []string{"python3", "-c", script, rawPort}})
	require.NoError(t, err)
	require.Equal(t, 0, result.ExitCode, result.Stderr)
	require.Contains(t, result.Stdout, "refused example.com:443")
	require.Contains(t, result.Stdout, "refused host.microsandbox.internal:")
	t.Logf("network none:\n%s", result.Stdout)
	require.NoError(t, runtime.StopWorkspace(ctx, created.ID))
	_, err = runtime.CreateColdSnapshot(ctx, created.ID, workspaceapi.ColdSnapshotSpec{ID: "custom-cold"})
	require.NoError(t, err)
	guardCustomImageProofLoad(t, "cold fork")
	fork, err := runtime.ForkColdSnapshot(ctx, "custom-cold", workspaceapi.WorkspaceSpec{ID: "custom-fork"})
	require.NoError(t, err)
	receipt, err = runtime.WorkspaceImageReceipt(ctx, fork.ID)
	require.NoError(t, err)
	require.Equal(t, *image, receipt)
	t.Logf("fork image receipt: %s@%s", receipt.Ref, receipt.Digest)
	require.NoError(t, runtime.StopWorkspace(ctx, fork.ID))
	require.NoError(t, runtime.ReclaimWorkspaceDisk(ctx, fork.ID))
	guardCustomImageProofLoad(t, "reclaimed restart")
	_, err = runtime.StartWorkspace(ctx, fork.ID)
	require.NoError(t, err)
	receipt, err = runtime.WorkspaceImageReceipt(ctx, fork.ID)
	require.NoError(t, err)
	require.Equal(t, *image, receipt)
	require.NoError(t, runtime.Close())
	runtime, err = New(ctx, Config{Binary: binary, Root: runtime.root, CPUs: 1, MemoryMiB: 512, DiskMiB: 2048, MaxRunningVMs: 2, HostPorts: []uint16{uint16(port)}})
	require.NoError(t, err)
	guardCustomImageProofLoad(t, "backend recovery restart")
	_, err = runtime.StartWorkspace(ctx, fork.ID)
	require.NoError(t, err)
	receipt, err = runtime.WorkspaceImageReceipt(ctx, fork.ID)
	require.NoError(t, err)
	require.Equal(t, *image, receipt)
	t.Logf("recovered image receipt: %s@%s", receipt.Ref, receipt.Digest)
}

func guardCustomImageProofLoad(t *testing.T, stage string) {
	t.Helper()
	output, err := exec.Command("uptime").Output()
	require.NoError(t, err)
	match := regexp.MustCompile(`load averages?:\s*([0-9]+(?:\.[0-9]+)?)`).FindStringSubmatch(string(output))
	require.Len(t, match, 2)
	load, err := strconv.ParseFloat(match[1], 64)
	require.NoError(t, err)
	if load >= 50 {
		t.Skipf("%s launch refused: 1-minute load %.2f is not below50", stage, load)
	}
	t.Logf("%s load gate: %s", stage, strings.TrimSpace(string(output)))
}
