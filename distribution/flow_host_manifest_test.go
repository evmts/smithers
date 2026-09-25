package distribution_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/smithersai/smithers/packages/backend/flowmanifest"
)

// writeManifest runs the distribution script exactly as the image and native
// builds do, so its output is checked by the loader the backend uses.
func writeManifest(t *testing.T, args ...string) (string, error) {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH")
	}
	cmd := exec.Command(node, append([]string{"flow-host-manifest.mjs"}, args...)...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func bundleHosts(t *testing.T, names ...string) (string, []string) {
	t.Helper()
	directory := t.TempDir()
	paths := make([]string, 0, len(names))
	for _, name := range names {
		path := filepath.Join(directory, name)
		if err := os.WriteFile(path, []byte("#!/usr/bin/env node\n// "+name+"\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, path)
	}
	return directory, paths
}

func TestFlowHostManifestScriptLoadsWithoutOrganizationHost(t *testing.T) {
	directory, hosts := bundleHosts(t, "smithers-coding-host", "smithers-librarian-host")
	manifest := filepath.Join(directory, "flow-hosts.json")
	if out, err := writeManifest(t, append([]string{manifest}, hosts...)...); err != nil {
		t.Fatalf("manifest script failed: %v\n%s", err, out)
	}
	registry, err := flowmanifest.Load(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if registry.HasOrganization {
		t.Fatalf("two-host manifest reported an organization host: %+v", registry.Organization)
	}
	if _, err := os.Stat(filepath.Join(directory, "smithers-organization-host.sha256")); !os.IsNotExist(err) {
		t.Fatalf("two-host manifest wrote an organization digest: %v", err)
	}
}

func TestFlowHostManifestScriptWritesOptionalOrganizationHost(t *testing.T) {
	directory, hosts := bundleHosts(t, "smithers-coding-host", "smithers-librarian-host", "smithers-organization-host")
	manifest := filepath.Join(directory, "flow-hosts.json")
	if out, err := writeManifest(t, append([]string{manifest}, hosts...)...); err != nil {
		t.Fatalf("manifest script failed: %v\n%s", err, out)
	}
	registry, err := flowmanifest.Load(manifest)
	if err != nil {
		t.Fatalf("Go loader refused the script's organization manifest: %v", err)
	}
	if !registry.HasOrganization || registry.Organization.Executable != hosts[2] {
		t.Fatalf("organization host not loaded: %+v", registry.Organization)
	}
	if !reflect.DeepEqual(registry.Organization.Flows, flowmanifest.OrganizationFlows()) {
		t.Fatalf("script catalog %v differs from Go catalog %v", registry.Organization.Flows, flowmanifest.OrganizationFlows())
	}
	sidecar, err := os.ReadFile(filepath.Join(directory, "smithers-organization-host.sha256"))
	if err != nil || string(sidecar) != registry.Organization.SHA256+"  smithers-organization-host\n" {
		t.Fatalf("organization digest sidecar = %q, %v", sidecar, err)
	}
	info, err := os.Stat(hosts[2])
	if err != nil || info.Mode().Perm()&0o111 == 0 {
		t.Fatalf("organization host was not made executable: %v %v", info, err)
	}
}

func TestFlowHostManifestScriptRefusesInvalidOrganizationHost(t *testing.T) {
	directory, hosts := bundleHosts(t, "smithers-coding-host", "smithers-librarian-host")
	manifest := filepath.Join(directory, "flow-hosts.json")
	outside := filepath.Join(t.TempDir(), "smithers-organization-host")
	if err := os.WriteFile(outside, []byte("host"), 0o755); err != nil {
		t.Fatal(err)
	}
	out, err := writeManifest(t, manifest, hosts[0], hosts[1], outside)
	if err == nil || !strings.Contains(out, "escapes its bundle") {
		t.Fatalf("organization host outside the bundle accepted: %v\n%s", err, out)
	}
	out, err = writeManifest(t, manifest, hosts[0], hosts[1], filepath.Join(directory, "missing-organization-host"))
	if err == nil {
		t.Fatalf("missing organization host accepted:\n%s", out)
	}
	out, err = writeManifest(t, manifest, hosts[0], hosts[1], hosts[0], hosts[1])
	if err == nil || !strings.Contains(out, "usage:") {
		t.Fatalf("extra argument accepted: %v\n%s", err, out)
	}
	if _, err := os.Stat(manifest); !os.IsNotExist(err) {
		t.Fatalf("refused invocation published a manifest: %v", err)
	}
}
