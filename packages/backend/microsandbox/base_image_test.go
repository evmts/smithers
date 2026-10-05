package microsandbox

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/installbundle"
	"github.com/stretchr/testify/require"
)

// fakeImageStore is an msb that answers `image inspect` from a marker file,
// which `load` creates, and records every call.
func fakeImageStore(t *testing.T, digest string, loaded, loadFails bool) (binary, calls string) {
	t.Helper()
	root := t.TempDir()
	calls, marker := filepath.Join(root, "calls"), filepath.Join(root, "loaded")
	if loaded {
		require.NoError(t, os.WriteFile(marker, nil, 0o600))
	}
	load := "touch " + shellQuote(marker)
	if loadFails {
		load = "echo 'error: invalid archive' >&2; exit 2"
	}
	binary = filepath.Join(root, "msb")
	require.NoError(t, os.WriteFile(binary, []byte(fmt.Sprintf(`#!/bin/sh
printf '%%s\n' "$*" >> %s
case "$*" in
  "image inspect "*) if [ -e %s ]; then printf '{"digest":"%s"}'; else echo "error: image not found: $3" >&2; exit 1; fi ;;
  "load "*) %s ;;
  "snapshot list --format json") echo '[]' ;;
  *run\ exec\ *|*run\ root-recipe*|*run\ setup*|*run\ install*) cat >/dev/null; printf '\000SMITHERS-EXIT 0\000' >&2 ;;
esac
`, shellQuote(calls), shellQuote(marker), digest, load)), 0o755))
	return binary, calls
}

func readCalls(t *testing.T, path string) []string {
	t.Helper()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	require.NoError(t, err)
	return strings.Split(strings.TrimSpace(string(data)), "\n")
}

// imageBundle is an approved install bundle whose manifest declares the base
// image archive.
func imageBundle(t *testing.T) (string, *installbundle.Bundle) {
	t.Helper()
	root, _ := approvedBundleFixture(t)
	require.NoError(t, os.MkdirAll(filepath.Join(root, filepath.Dir(bundleBaseImagePath)), 0o755))
	approveBundleFile(t, root, bundleBaseImagePath, []byte("approved OCI archive"), 0o644)
	return root, pinned(t, root)
}

// spec.md §16.1.0: an installed runtime with a cold store loads the bundle's
// verified base image instead of pulling it, and the loaded image must carry
// the pinned digest.
func TestBaseImageLoadsTheBundledArchiveOnce(t *testing.T) {
	_, pinnedDigest, _ := strings.Cut(DefaultImage, "@")
	inspect := "image inspect " + DefaultImage + " --format json"
	load := "load -i ARCHIVE -t " + DefaultImage + " -q"
	for _, test := range []struct {
		name, digest      string
		loaded, loadFails bool
		changed           bool
		want              []string
		wantErr           string
	}{
		{name: "cold store loads the archive", digest: pinnedDigest, want: []string{inspect, load, inspect}},
		{name: "warm store loads nothing", digest: pinnedDigest, loaded: true, want: []string{inspect}},
		{name: "wrong digest is refused", digest: "sha256:" + strings.Repeat("0", 64), want: []string{inspect, load, inspect}, wantErr: "not " + pinnedDigest},
		{name: "failed load is refused", digest: pinnedDigest, loadFails: true, want: []string{inspect, load}, wantErr: "load the bundled base image"},
		{name: "changed archive never reaches msb", digest: pinnedDigest, changed: true, want: []string{inspect}, wantErr: "bundled base image"},
	} {
		t.Run(test.name, func(t *testing.T) {
			root, bundle := imageBundle(t)
			if test.changed {
				require.NoError(t, os.WriteFile(filepath.Join(root, bundleBaseImagePath), []byte("other bytes"), 0o644))
			}
			binary, calls := fakeImageStore(t, test.digest, test.loaded, test.loadFails)
			runtime := &Runtime{cli: &cli{binary: binary, home: t.TempDir()}, config: Config{Bundle: bundle}}
			require.Equal(t, "never", runtime.pullPolicy())
			err := runtime.ensureBaseImage(t.Context())
			want := make([]string, len(test.want))
			for i, call := range test.want {
				want[i] = strings.ReplaceAll(call, "ARCHIVE", bundle.Path(bundleBaseImagePath))
			}
			require.Equal(t, want, readCalls(t, calls))
			if test.wantErr != "" {
				require.ErrorIs(t, err, ErrUnavailable)
				require.ErrorContains(t, err, test.wantErr)
				require.False(t, runtime.baseImage.loaded, "a refused image is checked again on the next boot")
				return
			}
			require.NoError(t, err)
			// A process checks the store once.
			require.NoError(t, runtime.ensureBaseImage(t.Context()))
			require.Equal(t, want, readCalls(t, calls))
		})
	}
	t.Run("a runtime without a bundle pulls on demand", func(t *testing.T) {
		binary, calls := fakeImageStore(t, pinnedDigest, false, false)
		runtime := &Runtime{cli: &cli{binary: binary, home: t.TempDir()}}
		require.NoError(t, runtime.ensureBaseImage(t.Context()))
		require.Empty(t, readCalls(t, calls))
		require.Equal(t, "if-missing", runtime.pullPolicy())
	})
}

// The first layer on a cold installed host boots only after the bundled
// image is loaded, and never pulls.
func TestFirstLayerLoadsTheBaseImageBeforeBooting(t *testing.T) {
	_, pinnedDigest, _ := strings.Cut(DefaultImage, "@")
	_, bundle := imageBundle(t)
	binary, calls := fakeImageStore(t, pinnedDigest, false, false)
	root := t.TempDir()
	runtime := &Runtime{config: Config{CPUs: 2, MemoryMiB: 2048, DiskMiB: 8192, MaxRunningVMs: 1, Bundle: bundle}, root: root, owner: "smithers-backend-0123456789abcdef", cli: &cli{binary: binary, home: root}}
	env := environments{runtime: runtime, config: EnvironmentConfig{Image: DefaultImage, PrepareCPUs: 2, PrepareMemoryMiB: 2048, PrepareTimeout: time.Minute}}
	_, _ = env.buildLayer(t.Context(), layerRecord{Kind: layerDependency, Key: strings.Repeat("a", 64), Name: "fixture"}, dependencyLayer{DetectorVersion: DetectorVersion}, "", nil)
	var order []string
	for _, call := range readCalls(t, calls) {
		if fields := strings.Fields(call); len(fields) > 0 && (fields[0] == "load" || fields[0] == "create") {
			order = append(order, fields[0])
			if fields[0] == "create" {
				require.Contains(t, call, "--pull never")
			}
		}
	}
	require.Equal(t, []string{"load", "create"}, order)
}
