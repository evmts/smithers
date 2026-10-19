package workspace_scripts

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestDownloadReleaseUsesGuestProxy(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node unavailable")
	}
	if _, err := exec.LookPath("curl"); err != nil {
		t.Skip("curl unavailable")
	}
	for _, deny := range []bool{false, true} {
		t.Run(map[bool]string{false: "download", true: "refused"}[deny], func(t *testing.T) {
			var requests atomic.Int32
			proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests.Add(1)
				if deny {
					w.WriteHeader(403)
					return
				}
				switch r.URL.Path {
				case "/release":
					if r.Header.Get("User-Agent") != "smithers-workspace-bootstrap" {
						t.Error("missing release header")
					}
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"assets":[{"name":"jj-x86_64-unknown-linux-musl.tar.gz","browser_download_url":"http://release.invalid/redirect"},{"name":"jj-aarch64-unknown-linux-musl.tar.gz","browser_download_url":"http://release.invalid/redirect"}]}`))
				case "/redirect":
					http.Redirect(w, r, "http://assets.invalid/archive", 302)
				case "/archive":
					_, _ = w.Write([]byte("release archive"))
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					w.WriteHeader(404)
				}
			}))
			defer proxy.Close()
			dir := t.TempDir()
			script := filepath.Join(dir, "download.cjs")
			archive := filepath.Join(dir, "release.tar.gz")
			if err := os.WriteFile(script, []byte(DownloadReleaseScript), 0600); err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command("node", script)
			for _, v := range os.Environ() {
				key := strings.ToLower(strings.SplitN(v, "=", 2)[0])
				if !strings.Contains(key, "proxy") && !strings.HasPrefix(key, "smithers_download") && !strings.HasPrefix(key, "smithers_jj_") {
					cmd.Env = append(cmd.Env, v)
				}
			}
			cmd.Env = append(cmd.Env, "http_proxy="+proxy.URL, "HTTP_PROXY="+proxy.URL, "NO_PROXY=", "no_proxy=", "SMITHERS_DOWNLOAD_MODE=jj", "SMITHERS_JJ_RELEASE_API_URL=http://release.invalid/release", "SMITHERS_JJ_ARCHIVE="+archive)
			out, err := cmd.CombinedOutput()
			if (err != nil) != deny {
				t.Fatalf("deny=%v error=%v: %s", deny, err, out)
			}
			if requests.Load() == 0 {
				t.Fatal("download bypassed guest proxy")
			}
			if !deny {
				body, err := os.ReadFile(archive)
				if err != nil || string(body) != "release archive" {
					t.Fatalf("archive=%q err=%v", body, err)
				}
			}
		})
	}
}

// Security f-ye4hz9: the Node download fetches one pinned release and writes
// it only when its SHA-256 matches the pin for this architecture. A mismatch
// leaves no archive, so the bootstrap installs nothing.
func TestDownloadReleaseNodeIsPinnedAndVerified(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node unavailable")
	}
	if _, err := exec.LookPath("curl"); err != nil {
		t.Skip("curl unavailable")
	}
	tarball := []byte("pinned node tarball")
	sum := sha256.Sum256(tarball)
	good := hex.EncodeToString(sum[:])
	for _, tc := range []struct {
		name, digest string
		ok           bool
	}{
		{"matching digest", good, true},
		{"mismatched digest", strings.Repeat("0", 64), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var paths []string
			proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				paths = append(paths, r.URL.Path)
				if r.URL.Path != "/dist/v26.5.0/node-v26.5.0-linux-x64.tar.gz" && r.URL.Path != "/dist/v26.5.0/node-v26.5.0-linux-arm64.tar.gz" {
					w.WriteHeader(404)
					return
				}
				_, _ = w.Write(tarball)
			}))
			defer proxy.Close()
			dir := t.TempDir()
			script := filepath.Join(dir, "download.cjs")
			archive := filepath.Join(dir, "node.tar.gz")
			if err := os.WriteFile(script, []byte(DownloadReleaseScript), 0600); err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command("node", script)
			for _, v := range os.Environ() {
				key := strings.ToLower(strings.SplitN(v, "=", 2)[0])
				if !strings.Contains(key, "proxy") && !strings.HasPrefix(key, "smithers_download") && !strings.HasPrefix(key, "smithers_node_") {
					cmd.Env = append(cmd.Env, v)
				}
			}
			cmd.Env = append(cmd.Env, "http_proxy="+proxy.URL, "HTTP_PROXY="+proxy.URL, "NO_PROXY=", "no_proxy=",
				"SMITHERS_DOWNLOAD_MODE=node", "SMITHERS_NODE_DIST_URL=http://nodejs.invalid/dist", "SMITHERS_NODE_VERSION=26.5.0",
				"SMITHERS_NODE_SHA256_X64="+tc.digest, "SMITHERS_NODE_SHA256_ARM64="+tc.digest, "SMITHERS_NODE_ARCHIVE="+archive)
			out, err := cmd.CombinedOutput()
			if len(paths) != 1 {
				t.Fatalf("want exactly one fetch of the pinned tarball, got %v: %s", paths, out)
			}
			body, readErr := os.ReadFile(archive)
			if tc.ok {
				if err != nil || readErr != nil || !bytes.Equal(body, tarball) {
					t.Fatalf("matching digest: err=%v archive=%q readErr=%v: %s", err, body, readErr, out)
				}
				return
			}
			if err == nil || !strings.Contains(string(out), "does not match the pinned") {
				t.Fatalf("a mismatched digest must refuse: err=%v: %s", err, out)
			}
			if !os.IsNotExist(readErr) {
				t.Fatalf("a refused download must leave no archive, got %q (%v)", body, readErr)
			}
		})
	}
}
