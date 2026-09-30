package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"
)

// Uses the actual executable assembly, real native repository/workspace ports,
// PostgreSQL and public HTTP only. Its subprocess owns and removes its realm.
func TestOwnerDurableHTTPJourney(t *testing.T) {
	for _, name := range []string{"SMITHERS_POSTGRES_TEST_BIN", "SMITHERS_FLOW_HOST_MANIFEST", "SMITHERS_MODEL_HOST_BUNDLE", "SMITHERS_FFI_LIBRARY_PATH", "SMITHERS_WORKSPACE_JJ_EXPORT_BINARY"} {
		require.NotEmpty(t, os.Getenv(name), "%s is required for real selfhost qualification", name)
	}
	python, err := exec.LookPath("python3")
	require.NoError(t, err)
	_, source, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(source), "../.."))
	binary := filepath.Join(t.TempDir(), "smithers-backend")
	build := exec.Command("go", "build", "-o", binary, "./apps/backend")
	build.Dir = root
	output, err := build.CombinedOutput()
	require.NoError(t, err, "%s", output)
	receipts := os.Getenv("SMITHERS_HTTP_JOURNEY_RECEIPTS")
	if receipts == "" {
		receipts = t.TempDir()
	}
	command := exec.Command(python, filepath.Join(root, "apps/backend/testdata/http_owner_journey.py"), root)
	command.Env = append(os.Environ(), "SMITHERS_HTTP_BACKEND_BINARY="+binary, "SMITHERS_HTTP_JOURNEY_RECEIPTS="+receipts)
	output, err = command.CombinedOutput()
	t.Logf("%s", output)
	require.NoError(t, err, "public HTTP journey failed; receipts: %s", receipts)
}
