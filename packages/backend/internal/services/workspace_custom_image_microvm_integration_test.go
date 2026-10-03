package services

import (
	"context"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/microsandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

// Opt-in system proof: real public-registry admission, migrated PostgreSQL,
// product create/view and a native microVM. It never substitutes a fake runtime.
func TestWorkspaceCustomImagePostgresAndNativeMicroVM(t *testing.T) {
	selected := os.Getenv("SMITHERS_MICROVM_CUSTOM_IMAGE")
	if selected == "" {
		t.Skip("SMITHERS_MICROVM_CUSTOM_IMAGE=python@sha256:<digest> enables native microVM integration")
	}
	binary := os.Getenv("SMITHERS_MICROSANDBOX_BIN")
	require.NotEmpty(t, binary)
	requireCustomImageProofLoad(t)
	parsed, err := parsePublicImageReference(selected)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(parsed.selector, "sha256:"), "proof requires a pinned Python image")
	pool := newProductTestPool(t)
	user, repo := setupTestUserAndRepo(t, pool)
	q := db.New(pool)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	runtime, err := microsandbox.New(ctx, microsandbox.Config{Binary: binary, Root: t.TempDir(), CPUs: 1, MemoryMiB: 512, DiskMiB: 2048, MaxRunningVMs: 1, MaxConcurrent: 1})
	require.NoError(t, err)
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), time.Minute)
		defer cleanupCancel()
		for _, id := range runtime.WorkspaceIDs() {
			require.NoError(t, runtime.DeleteWorkspace(cleanupCtx, id))
		}
		require.NoError(t, runtime.Close())
	})
	svc := NewWorkspaceService(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceRuntime(runtime), WithWorkspaceResources(512, 1))
	requireCustomImageProofLoad(t)
	created, err := svc.CreateWorkspace(ctx, CreateWorkspaceInput{RepositoryID: repo, UserID: user, Name: "native-image-proof", Image: selected, Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}, Resources: WorkspaceResources{CPUs: resourcePtr(1), MemoryMB: resourcePtr(512), DiskGiB: resourcePtr(2)}})
	require.NoError(t, err)

	row, err := q.GetWorkspace(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, customText(selected), row.ImageRef)
	require.Equal(t, customText(parsed.selector), row.ImageDigest)
	require.Equal(t, customText("none"), row.NetworkMode)
	require.Equal(t, int32(2048), row.DiskMb.Int32)
	require.Equal(t, customText(parsed.selector), row.BootedImageDigest)
	viewed, err := svc.GetWorkspace(ctx, created.ID, repo, user)
	require.NoError(t, err)
	require.Equal(t, parsed.selector, viewed.Image.BootedDigest)
	require.Equal(t, "none", viewed.Network.Mode)
	operationCtx := workspaceapi.WithOperation(ctx, workspaceapi.Operation{TenantID: strconv.FormatInt(user, 10), PrincipalID: strconv.FormatInt(user, 10), OperationID: "custom-image-proof"})
	receipt, err := runtime.WorkspaceImageReceipt(operationCtx, created.ID)
	require.NoError(t, err)
	require.Equal(t, parsed.selector, receipt.Digest)
	result, err := runtime.ExecuteCommandAsUser(operationCtx, created.ID, "root", workspaceapi.Command{Args: []string{"/bin/sh", "-c", "cat /etc/os-release; id -u"}})
	require.NoError(t, err)
	require.Zero(t, result.ExitCode, result.Stderr)
	require.True(t, strings.HasSuffix(result.Stdout, "\n0\n"), result.Stdout)
	t.Logf("PostgreSQL admitted/booted image: %s\nroot exec:\n%s", receipt.PinnedReference(), result.Stdout)
	script := `import socket,sys
for host in ("example.com", "93.184.215.14"):
    try:
        connection=socket.create_connection((host,443),timeout=2)
    except OSError as error:
        print("refused %s:443: %s" % (host,error))
    else:
        connection.close()
        sys.exit("none policy allowed %s:443" % host)
`
	result, err = runtime.ExecuteCommandAsUser(operationCtx, created.ID, "root", workspaceapi.Command{Args: []string{"python3", "-c", script}})
	require.NoError(t, err)
	require.Zero(t, result.ExitCode, result.Stderr)
	require.Contains(t, result.Stdout, "refused example.com:443")
	require.Contains(t, result.Stdout, "refused 93.184.215.14:443")
	t.Logf("network none from inside guest:\n%s", result.Stdout)
}

func requireCustomImageProofLoad(t *testing.T) {
	t.Helper()
	output, err := exec.Command("uptime").Output()
	require.NoError(t, err)
	match := regexp.MustCompile(`load averages?:\s*([0-9]+(?:\.[0-9]+)?)`).FindStringSubmatch(string(output))
	require.Len(t, match, 2, "cannot safely determine shared machine load: %s", output)
	load, err := strconv.ParseFloat(match[1], 64)
	require.NoError(t, err)
	if load >= 50 {
		t.Skipf("native VM launch refused: 1-minute load %.2f is not below 50", load)
	}
}
