package flowmanifest

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func bundledManifest(t *testing.T) (string, map[string]rawHost) {
	t.Helper()
	directory := t.TempDir()
	hosts := map[string]rawHost{}
	for family, flows := range expectedFlows {
		name := "smithers-" + family + "-host-v10"
		contents := []byte("host:" + family)
		if err := os.WriteFile(filepath.Join(directory, name), contents, 0o755); err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(contents)
		hosts[family] = rawHost{Executable: name, SHA256: hex.EncodeToString(digest[:]), Flows: flows}
	}
	return filepath.Join(directory, "flow-hosts.json"), hosts
}

func writeManifest(t *testing.T, path string, hosts map[string]rawHost) {
	t.Helper()
	data, err := json.Marshal(rawManifest{Version: 1, Hosts: hosts})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadVerifiesTwoCanonicalHosts(t *testing.T) {
	path, hosts := bundledManifest(t)
	writeManifest(t, path, hosts)
	registry, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if registry.Coding.Executable != filepath.Join(filepath.Dir(path), hosts["coding"].Executable) ||
		registry.Librarian.SHA256 != hosts["librarian"].SHA256 {
		t.Fatalf("wrong registry: %+v", registry)
	}
	if err := os.WriteFile(registry.Coding.Executable, []byte("altered host"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("tampered host accepted: %v", err)
	}
}

func TestLoadRejectsEscapedOrSubstitutedHost(t *testing.T) {
	path, hosts := bundledManifest(t)
	coding := hosts["coding"]
	coding.Executable = "../other-host"
	hosts["coding"] = coding
	writeManifest(t, path, hosts)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "basename") {
		t.Fatalf("path escape accepted: %v", err)
	}
	coding.Executable = "smithers-coding-host-v10"
	hosts["coding"] = coding
	if err := os.Remove(filepath.Join(filepath.Dir(path), coding.Executable)); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(filepath.Dir(path), hosts["librarian"].Executable), filepath.Join(filepath.Dir(path), coding.Executable)); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, path, hosts)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "regular file") {
		t.Fatalf("symlinked host accepted: %v", err)
	}
}

func TestLoadRejectsMissingFlow(t *testing.T) {
	path, hosts := bundledManifest(t)
	librarian := hosts["librarian"]
	librarian.Flows = []string{"librarian/wiki"}
	hosts["librarian"] = librarian
	writeManifest(t, path, hosts)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "unexpected flows") {
		t.Fatalf("incomplete flow host accepted: %v", err)
	}
}

func TestLoadManifestValidation(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func([]byte) []byte
	}{
		{"empty", func([]byte) []byte { return nil }},
		{"null", func([]byte) []byte { return []byte("null") }},
		{"unsupported_version", func(data []byte) []byte {
			return []byte(strings.Replace(string(data), `"version":1`, `"version":2`, 1))
		}},
		{"unknown_field", func(data []byte) []byte {
			return append([]byte(`{"unexpected":true,`), data[1:]...)
		}},
		{"unknown_host_field", func(data []byte) []byte {
			return []byte(strings.Replace(string(data), `"coding":{`, `"coding":{"unexpected":true,`, 1))
		}},
		{"unexpected_family", func(data []byte) []byte {
			return []byte(strings.Replace(string(data), `"coding":`, `"unknown":`, 1))
		}},
		{"trailing_json", func(data []byte) []byte { return append(data, []byte(` {}`)...) }},
		{"trailing_garbage", func(data []byte) []byte { return append(data, '!') }},
		{"oversized", func(data []byte) []byte {
			return append(data, []byte(strings.Repeat(" ", maxManifestBytes+1-len(data)))...)
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			path, hosts := bundledManifest(t)
			data, err := json.Marshal(rawManifest{Version: 1, Hosts: hosts})
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, test.change(data), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := Load(path); err == nil {
				t.Fatal("invalid manifest accepted")
			}
		})
	}
}

func TestLoadManifestAtSizeLimit(t *testing.T) {
	path, hosts := bundledManifest(t)
	librarian := hosts["librarian"]
	librarian.Flows = []string{"librarian/wiki", "librarian/history"}
	hosts["librarian"] = librarian
	data, err := json.Marshal(rawManifest{Version: 1, Hosts: hosts})
	if err != nil {
		t.Fatal(err)
	}
	data = append(data, []byte(strings.Repeat(" ", maxManifestBytes-len(data)))...)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	registry, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(registry.Librarian.Flows, ",") != "librarian/history,librarian/wiki" {
		t.Fatalf("flows were not canonicalized: %v", registry.Librarian.Flows)
	}
}

func TestLoadRegularManifestSymlink(t *testing.T) {
	path, hosts := bundledManifest(t)
	writeManifest(t, path, hosts)
	link := filepath.Join(filepath.Dir(path), "manifest-link.json")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(link); err != nil {
		t.Fatalf("regular manifest symlink rejected: %v", err)
	}
}

func addOrganizationHost(t *testing.T, path string, hosts map[string]rawHost, flows []string) {
	t.Helper()
	name := "smithers-organization-host-v10"
	contents := []byte("host:organization")
	if err := os.WriteFile(filepath.Join(filepath.Dir(path), name), contents, 0o755); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(contents)
	hosts[OrganizationFamily] = rawHost{Executable: name, SHA256: hex.EncodeToString(digest[:]), Flows: flows}
}

func TestLoadWithoutOrganizationHostKeepsExistingRegistry(t *testing.T) {
	path, hosts := bundledManifest(t)
	writeManifest(t, path, hosts)
	registry, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if registry.HasOrganization || registry.Organization.Executable != "" || len(registry.Organization.Flows) != 0 {
		t.Fatalf("a two-host manifest reported an organization host: %+v", registry.Organization)
	}
	if registry.Coding.SHA256 != hosts["coding"].SHA256 || registry.Librarian.SHA256 != hosts["librarian"].SHA256 {
		t.Fatalf("wrong registry: %+v", registry)
	}
}

func TestLoadVerifiesOptionalOrganizationHost(t *testing.T) {
	path, hosts := bundledManifest(t)
	reversed := OrganizationFlows()
	for left, right := 0, len(reversed)-1; left < right; left, right = left+1, right-1 {
		reversed[left], reversed[right] = reversed[right], reversed[left]
	}
	addOrganizationHost(t, path, hosts, reversed)
	writeManifest(t, path, hosts)
	registry, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !registry.HasOrganization || registry.Organization.SHA256 != hosts[OrganizationFamily].SHA256 ||
		registry.Organization.Executable != filepath.Join(filepath.Dir(path), hosts[OrganizationFamily].Executable) {
		t.Fatalf("organization host not verified: %+v", registry)
	}
	if !reflect.DeepEqual(registry.Organization.Flows, OrganizationFlows()) {
		t.Fatalf("organization flows were not canonicalized: %v", registry.Organization.Flows)
	}
	if err := os.WriteFile(registry.Organization.Executable, []byte("altered host"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "organization Flow host checksum") {
		t.Fatalf("tampered organization host accepted: %v", err)
	}
}

func TestLoadRejectsOrganizationHostWithDifferentCatalog(t *testing.T) {
	complete := OrganizationFlows()
	for name, flows := range map[string][]string{
		"missing":   complete[1:],
		"extra":     append(OrganizationFlows(), "organization/unknown"),
		"duplicate": append(OrganizationFlows(), complete[0]),
		"empty":     nil,
		"foreign":   append(OrganizationFlows()[1:], "coding/dispatch"),
	} {
		t.Run(name, func(t *testing.T) {
			path, hosts := bundledManifest(t)
			addOrganizationHost(t, path, hosts, flows)
			writeManifest(t, path, hosts)
			if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "organization Flow host declares unexpected flows") {
				t.Fatalf("organization host with a different catalog accepted: %v", err)
			}
		})
	}
}

func TestLoadStillRequiresBothCanonicalHostsBesideOrganization(t *testing.T) {
	path, hosts := bundledManifest(t)
	addOrganizationHost(t, path, hosts, OrganizationFlows())
	delete(hosts, "librarian")
	writeManifest(t, path, hosts)
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "lacks librarian") {
		t.Fatalf("organization host replaced a required host: %v", err)
	}
}

// The organization catalog is the one list the host, the distribution script
// and this loader agree on. Its source of truth is flows/organization.
func TestOrganizationFlowsCatalog(t *testing.T) {
	want := []string{
		"organization/intake", "organization/deliver", "organization/task", "organization/hire",
		"organization/retire", "organization/delegate", "organization/meetings-plan",
		"organization/meeting-prepare", "organization/book-block", "organization/sync",
		"organization/saas-request", "organization/status",
	}
	sort.Strings(want)
	if !reflect.DeepEqual(OrganizationFlows(), want) {
		t.Fatalf("organization catalog = %v, want %v", OrganizationFlows(), want)
	}
	if !sort.StringsAreSorted(organizationFlows) {
		t.Fatal("organization catalog must be stored sorted")
	}
	copied := OrganizationFlows()
	copied[0] = "mutated"
	if organizationFlows[0] == "mutated" {
		t.Fatal("OrganizationFlows exposed the catalog for mutation")
	}
}

// When the organization host source is present, every file flow it packages
// must be in the catalog and nothing else may be.
func TestOrganizationFlowsMatchSourceDirectory(t *testing.T) {
	directory := filepath.Join("..", "..", "..", "flows", "organization")
	entries, err := os.ReadDir(directory)
	if os.IsNotExist(err) {
		t.Skip("flows/organization is not in this checkout")
	}
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(directory, entry.Name(), "flow.ts")); err == nil {
			found = append(found, "organization/"+entry.Name())
		}
	}
	sort.Strings(found)
	if !reflect.DeepEqual(found, OrganizationFlows()) {
		t.Fatalf("flows/organization declares %v, catalog is %v", found, OrganizationFlows())
	}
}
