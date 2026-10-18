package workspace_scripts

import (
	"bytes"
	"encoding/base64"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"text/template"
)

// renderBootstrapTemplate renders either bootstrap template with
// missingkey=error so a field the provisioning struct lacks fails loudly.
func renderBootstrapTemplate(t *testing.T, raw string, vars map[string]string) string {
	t.Helper()
	tmpl, err := template.New("bootstrap").Option("missingkey=error").Parse(raw)
	if err != nil {
		t.Fatalf("parse bootstrap template: %v", err)
	}
	var sb strings.Builder
	if err := tmpl.Execute(&sb, vars); err != nil {
		t.Fatalf("execute bootstrap template: %v", err)
	}
	return sb.String()
}

// scriptSection returns rendered[start:end] where start is the first
// occurrence of from and end is the first occurrence of to after it.
func scriptSection(t *testing.T, rendered, from, to string) string {
	t.Helper()
	start := strings.Index(rendered, from)
	if start < 0 {
		t.Fatalf("section start %q missing", from)
	}
	end := strings.Index(rendered[start:], to)
	if end <= 0 {
		t.Fatalf("section end %q missing after %q", to, from)
	}
	return rendered[start : start+end]
}

// Prod 2026-10-19 05:19Z, canary box msb_f11acdd6: bootstrap.log said only
// "npm CLI smoke failed; see /tmp/smithers-workspace-cli-help.log", and the
// cause ("smthrs needs Node 26.4.0 or later; ... is Node 24.19.0") was only
// visible by exec'ing into the guest. The smoke must check what the developer
// gets (their user, HOME and PATH, so ~/.local/bin/node), like the jj export
// and coding host smokes, and a failure must copy the help log into the
// bootstrap's stderr, which the provisioner keeps as bootstrap.log.
func TestBootstrapTemplatesSmokeCLIAsDeveloperAndReportFailure(t *testing.T) {
	const cause = "smthrs needs Node 26.4.0 or later; /nix/store/x-nodejs-slim-24.19.0/bin/node is Node 24.19.0. Put a newer node first on PATH."
	for name, raw := range map[string]string{"container": BootstrapTemplate, "nixos": BootstrapNixOSTemplate} {
		for _, fails := range []bool{true, false} {
			t.Run(name+map[bool]string{true: "/fails", false: "/passes"}[fails], func(t *testing.T) {
				root := t.TempDir()
				home := filepath.Join(root, "home")
				local := filepath.Join(home, ".local", "bin")
				shims := filepath.Join(root, "shims")
				pkg := filepath.Join(root, "pkg", "node_modules", "@smthrs", "cli", "bin")
				for _, dir := range []string{local, shims, pkg} {
					if err := os.MkdirAll(dir, 0755); err != nil {
						t.Fatal(err)
					}
				}
				write := func(path, body string) {
					t.Helper()
					if err := os.WriteFile(path, []byte(body), 0755); err != nil {
						t.Fatal(err)
					}
				}
				// runuser cannot switch users in a test: the shim records its
				// arguments and runs the command after "--".
				runuserArgs := filepath.Join(root, "runuser.args")
				write(filepath.Join(shims, "runuser"), "#!/bin/sh\nprintf '%s\\n' \"$@\" > '"+runuserArgs+"'\nwhile [ \"$1\" != -- ]; do shift; done\nshift\nexec \"$@\"\n")
				// The developer's node: ~/.local/bin/node, first on their PATH.
				write(filepath.Join(local, "node"), "#!/bin/sh\necho v24.19.0\n")
				// The launcher records the identity and node it ran with.
				seen := filepath.Join(root, "launcher.env")
				launcher := "#!/bin/sh\nprintf 'HOME=%s\\nUSER=%s\\nnode=%s\\n' \"$HOME\" \"$USER\" \"$(command -v node)\" > '" + seen + "'\n"
				if fails {
					launcher += "echo '" + cause + "' >&2\nexit 1\n"
				} else {
					launcher += "echo usage: smithers\n"
				}
				write(filepath.Join(pkg, "smithers.mjs"), launcher)
				archive, err := exec.Command("tar", "-czf", "-", "-C", filepath.Join(root, "pkg"), "node_modules").Output()
				if err != nil {
					t.Fatalf("archive: %v", err)
				}
				b64 := filepath.Join(root, "cli-package.b64")
				if err := os.WriteFile(b64+".part00000000", []byte(base64.StdEncoding.EncodeToString(archive)), 0644); err != nil {
					t.Fatal(err)
				}

				vars := sampleBootstrapVars()
				vars["Home"], vars["LocalBinDir"] = home, local
				vars["CLIPackageB64Path"], vars["CLIPackageDir"] = b64, filepath.Join(root, "cli")
				rendered := renderBootstrapTemplate(t, raw, vars)
				const tail = "npm CLI package absent\" >&2\nfi\n"
				section := scriptSection(t, rendered, "# Install the deployed npm package", tail) + tail
				script := strings.ReplaceAll(section, "/tmp/smithers-workspace-cli-help.log", filepath.Join(root, "cli-help.log"))

				var stderr bytes.Buffer
				cmd := exec.Command("bash", "-c", "set -euo pipefail\n"+script)
				// The bootstrap's own PATH (root's unit) must not decide the
				// node: put a decoy node first and expect the developer's.
				write(filepath.Join(shims, "node"), "#!/bin/sh\necho v0.0.0-root-unit\n")
				cmd.Env = append(os.Environ(), "PATH="+shims+":/usr/bin:/bin")
				cmd.Stderr = &stderr
				if out, err := cmd.Output(); err != nil {
					t.Fatalf("CLI section must stay best-effort: %v %s %s", err, out, stderr.String())
				}

				args, err := os.ReadFile(runuserArgs)
				if err != nil {
					t.Fatalf("CLI smoke did not run through runuser as the developer: %v\nstderr:\n%s", err, stderr.String())
				}
				if !strings.HasPrefix(string(args), "-u\ndev\n--\n") {
					t.Fatalf("CLI smoke ran as %q, want runuser -u dev --", args)
				}
				env, err := os.ReadFile(seen)
				if err != nil {
					t.Fatalf("launcher did not run: %v", err)
				}
				for _, want := range []string{"HOME=" + home + "\n", "USER=dev\n", "node=" + filepath.Join(local, "node") + "\n"} {
					if !strings.Contains(string(env), want) {
						t.Fatalf("CLI smoke environment missing %q:\n%s", want, env)
					}
				}

				got := stderr.String()
				if fails {
					if !strings.Contains(got, "smithers workspace bootstrap: npm CLI smoke failed") {
						t.Fatalf("missing smoke failure line in stderr:\n%s", got)
					}
					if want := "smithers workspace bootstrap: cli smoke: " + cause; !strings.Contains(got, want) {
						t.Fatalf("help log was not copied into bootstrap stderr; want %q in:\n%s", want, got)
					}
				} else if strings.Contains(got, "smoke") {
					t.Fatalf("passing smoke must stay quiet, got:\n%s", got)
				}
			})
		}
	}
}
