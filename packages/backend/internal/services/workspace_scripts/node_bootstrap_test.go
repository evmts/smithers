package workspace_scripts

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// nodeSection runs the rendered container bootstrap's Node section under bash
// as the caller, with root's PATH set to rootPath. baked stands in for the
// image's /usr/local/bin, /usr/bin and /bin. A test cannot switch users, so a
// runuser on rootPath stands in for the drop to the developer.
func nodeSection(t *testing.T, root, baked, rootPath string) (string, error) {
	t.Helper()
	vars := sampleBootstrapVars()
	vars["Home"] = root
	vars["LocalDir"] = filepath.Join(root, ".local")
	vars["LocalBinDir"], vars["LocalNodeDir"], vars["NodeInstallLog"] = filepath.Join(root, ".local", "bin"), filepath.Join(root, ".local", "node"), filepath.Join(root, "install.log")
	rendered := renderBootstrap(t, vars)
	start, end := strings.Index(rendered, "# Reuse the image's toolchain"), strings.Index(rendered, "# The configured coding host")
	if start < 0 || end <= start {
		t.Fatal("Node bootstrap section missing")
	}
	script := strings.NewReplacer(
		"in /usr/local/bin /usr/bin /bin;", "in '"+baked+"';",
		"PATH="+developerNodePath+" ", "PATH="+baked+":/usr/bin:/bin ",
		"/var/tmp/smithers-node-release", filepath.Join(root, "extract"),
	).Replace(rendered[start:end])
	cmd := exec.Command("bash", "-c", "set -euo pipefail\n"+script)
	cmd.Env = append(os.Environ(), "PATH="+rootPath)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// developerNodePath is the PATH the developer checks and installs Node with:
// the system directories, in the artifact guest PATH's order.
const developerNodePath = "/usr/bin:/bin:/usr/local/bin"

// writeRunuser writes a runuser that records its arguments, marks the
// developer's turn with a flag file while the command after "--" runs, and
// returns its status.
func writeRunuser(t *testing.T, dir, argsFile, developerFlag string) {
	t.Helper()
	body := "#!/bin/sh\nprintf '%s\\n' \"$@\" >'" + argsFile + "'\nwhile [ \"$1\" != -- ]; do shift; done\nshift\ntouch '" + developerFlag + "'\nstatus=0\n\"$@\" || status=$?\nrm -f '" + developerFlag + "'\nexit $status\n"
	if err := os.WriteFile(filepath.Join(dir, "runuser"), []byte(body), 0755); err != nil {
		t.Fatal(err)
	}
}

// Fake tool executables isolate version negotiation from network downloads;
// bash, tar and symlink resolution exercise the rendered production script.
func TestBootstrapReusesCompatibleNode(t *testing.T) {
	for _, tc := range []struct {
		name, version             string
		local, npmFails, download bool
	}{
		{"baked compatible", "v22.5.0", false, false, false},
		{"local compatible", "v22.1.0", true, false, false},
		{"older major", "v20.19.0", false, false, true},
		{"newer major", "v24.1.0", false, false, true},
		{"misleading version", "v22.bad.0", false, false, true},
		{"broken npm", "v22.5.0", false, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			local, baked, shims := filepath.Join(root, ".local", "bin"), filepath.Join(root, "baked"), filepath.Join(root, "shims")
			payload := filepath.Join(root, "payload", "node-test", "bin")
			for _, path := range []string{local, baked, shims, payload} {
				if err := os.MkdirAll(path, 0755); err != nil {
					t.Fatal(err)
				}
			}
			write := func(path, body string) {
				t.Helper()
				if err := os.WriteFile(path, []byte(body), 0755); err != nil {
					t.Fatal(err)
				}
			}
			writeRunuser(t, shims, filepath.Join(root, "runuser.args"), filepath.Join(root, "as-developer"))
			archive := filepath.Join(root, "fixture.tar.gz")
			for _, tool := range []string{"node", "npm", "npx"} {
				body := "#!/bin/sh\necho 10.0.0\n"
				if tool == "node" {
					body = "#!/bin/sh\necho v22.9.0\n"
				}
				write(filepath.Join(payload, tool), body)
			}
			if out, err := exec.Command("tar", "-czf", archive, "-C", filepath.Join(root, "payload"), "node-test").CombinedOutput(); err != nil {
				t.Fatalf("archive: %v %s", err, out)
			}
			bin := baked
			if tc.local {
				bin = local
			}
			write(filepath.Join(bin, "node"), "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '"+tc.version+"'; else touch '"+filepath.Join(root, "downloaded")+"'; cp '"+archive+"' \"$SMITHERS_NODE_ARCHIVE\"; mkdir -p \"$SMITHERS_NODE_EXTRACT_DIR\"; fi\n")
			npm := "#!/bin/sh\necho 10.0.0\n"
			if tc.npmFails {
				npm = "#!/bin/sh\nexit 1\n"
			}
			write(filepath.Join(bin, "npm"), npm)
			write(filepath.Join(bin, "npx"), "#!/bin/sh\necho npx-ok\n")
			if out, err := nodeSection(t, root, baked, shims+":/usr/bin:/bin"); err != nil {
				t.Fatalf("bootstrap: %v %s", err, out)
			}
			_, err := os.Stat(filepath.Join(root, "downloaded"))
			if (err == nil) != tc.download {
				t.Fatalf("download=%v want=%v", err == nil, tc.download)
			}
			for _, tool := range []string{"node", "npm", "npx"} {
				out, err := exec.Command(filepath.Join(local, tool), "--version").CombinedOutput()
				if err != nil {
					t.Fatalf("%s unusable: %v %s", tool, err, out)
				}
				if tool == "node" && !strings.HasPrefix(string(out), "v22.") {
					t.Fatalf("wrong Node: %s", out)
				}
			}
			if tc.download {
				if leftovers, _ := filepath.Glob(filepath.Join(root, "extract.*")); len(leftovers) != 0 {
					t.Fatalf("download scratch left behind: %v", leftovers)
				}
			}
		})
	}
}

// Security s-qizs0e: the bootstrap runs as root on every provision, resume and
// live staging, and the developer owns ~/.local/bin. A node or npm planted
// there, or first on an inherited PATH, must never run as root. Each planted
// tool writes a marker unless it runs inside runuser; the old section ran
// "$1/node --version" and the download's node as root and wrote it.
func TestContainerBootstrapNeverRunsDeveloperNodeAsRoot(t *testing.T) {
	for _, tc := range []struct {
		name, planted   string
		bakedCompatible bool
		runuserFails    bool
		wantLink        string // ~/.local/bin/node target; "" keeps the planted file
	}{
		{name: "planted compatible", planted: "v22.1.0"},
		{name: "planted incompatible", planted: "v20.0.0", bakedCompatible: true, wantLink: "baked"},
		{name: "planted incompatible and nothing to reuse", planted: "v20.0.0"},
		{name: "runuser fails", planted: "v20.0.0", bakedCompatible: true, runuserFails: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			local, baked, shims := filepath.Join(root, ".local", "bin"), filepath.Join(root, "baked"), filepath.Join(root, "shims")
			for _, path := range []string{local, baked, shims} {
				if err := os.MkdirAll(path, 0755); err != nil {
					t.Fatal(err)
				}
			}
			write := func(path, body string) {
				t.Helper()
				if err := os.WriteFile(path, []byte(body), 0755); err != nil {
					t.Fatal(err)
				}
			}
			argsFile, developerFlag, ranAsRoot := filepath.Join(root, "runuser.args"), filepath.Join(root, "as-developer"), filepath.Join(root, "ran-as-root")
			if tc.runuserFails {
				write(filepath.Join(shims, "runuser"), "#!/bin/sh\necho 'runuser: user dev does not exist' >&2\nexit 1\n")
			} else {
				writeRunuser(t, shims, argsFile, developerFlag)
			}
			planted := func(output string) string {
				return "#!/bin/sh\n[ -e '" + developerFlag + "' ] || echo \"$0 $*\" >>'" + ranAsRoot + "'\necho " + output + "\n"
			}
			write(filepath.Join(local, "node"), planted(tc.planted))
			write(filepath.Join(local, "npm"), planted("10.0.0"))
			if tc.bakedCompatible {
				write(filepath.Join(baked, "node"), "#!/bin/sh\necho v22.9.0\n")
				write(filepath.Join(baked, "npm"), "#!/bin/sh\necho 10.0.0\n")
			}
			// Worst case for root: ~/.local/bin first on the PATH it inherited.
			out, err := nodeSection(t, root, baked, shims+":"+local+":/usr/bin:/bin")
			if err != nil {
				t.Fatalf("the Node section must stay best-effort: %v %s", err, out)
			}
			if ran, err := os.ReadFile(ranAsRoot); err == nil {
				t.Fatalf("root ran the developer's planted tools:\n%s\noutput:\n%s", ran, out)
			}
			if tc.runuserFails {
				if !strings.Contains(out, "smithers workspace bootstrap: Node 22 setup as dev failed") {
					t.Fatalf("a failed drop must say so in bootstrap.log, got:\n%s", out)
				}
			} else {
				raw, err := os.ReadFile(argsFile)
				if err != nil {
					t.Fatalf("Node section never dropped to the developer: %v\n%s", err, out)
				}
				args := strings.Split(strings.TrimSpace(string(raw)), "\n")
				if len(args) < 4 || strings.Join(args[:4], " ") != "-u dev -- env" {
					t.Fatalf("runuser args = %q, want -u dev -- env ...", args)
				}
				// env's PATH= argument, before the command it runs.
				var path string
				for _, arg := range args[4:] {
					if !strings.Contains(arg, "=") {
						break
					}
					if value, ok := strings.CutPrefix(arg, "PATH="); ok {
						path = value
					}
				}
				if path != baked+":/usr/bin:/bin" {
					t.Fatalf("developer PATH = %q, want the system directories only", path)
				}
			}
			target, _ := os.Readlink(filepath.Join(local, "node"))
			if tc.wantLink == "baked" && target != filepath.Join(baked, "node") {
				t.Fatalf("~/.local/bin/node -> %q, want the compatible system node", target)
			}
			if tc.wantLink == "" && target != "" {
				t.Fatalf("~/.local/bin/node -> %q, want the developer's file untouched", target)
			}
		})
	}
}

// Security f-ye4hz9: a download refused for a digest mismatch leaves no
// archive. The section must then install and link nothing, and stay
// best-effort.
func TestBootstrapInstallsNothingWhenNodeDownloadIsRefused(t *testing.T) {
	root := t.TempDir()
	local, baked, shims := filepath.Join(root, ".local", "bin"), filepath.Join(root, "baked"), filepath.Join(root, "shims")
	for _, path := range []string{local, baked, shims} {
		if err := os.MkdirAll(path, 0755); err != nil {
			t.Fatal(err)
		}
	}
	writeRunuser(t, shims, filepath.Join(root, "runuser.args"), filepath.Join(root, "as-developer"))
	refused := filepath.Join(root, "refused")
	node := "#!/bin/sh\nif [ \"$1\" = --version ]; then echo v20.0.0; exit 0; fi\ntouch '" + refused + "'\necho 'refusing Node 26.5.0 linux-x64: SHA-256 0 does not match the pinned 1' >&2\nexit 1\n"
	if err := os.WriteFile(filepath.Join(baked, "node"), []byte(node), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(baked, "npm"), []byte("#!/bin/sh\necho 10.0.0\n"), 0755); err != nil {
		t.Fatal(err)
	}
	if out, err := nodeSection(t, root, baked, shims+":/usr/bin:/bin"); err != nil {
		t.Fatalf("the Node section must stay best-effort: %v %s", err, out)
	}
	if _, err := os.Stat(refused); err != nil {
		t.Fatal("the download never ran")
	}
	for _, path := range []string{filepath.Join(local, "node"), filepath.Join(local, "npm"), filepath.Join(root, ".local", "node")} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Errorf("%s exists after a refused download", path)
		}
	}
	if leftovers, _ := filepath.Glob(filepath.Join(root, "extract.*")); len(leftovers) != 0 {
		t.Errorf("download scratch left behind: %v", leftovers)
	}
}
