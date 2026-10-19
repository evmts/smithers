//go:build linux

package workspace_scripts

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// Security d-evwgfi: both bootstraps run as root, and the developer can plant
// a symlink in /tmp or a hardlink under ~/.local. Root once opened fixed /tmp
// logs (bun, jj, coding host, jj export, CLI help) and chowned ~/.local and
// ~/.smithers recursively, so a planted link redirected a root write or handed
// a root-owned file to the developer.
//
// The whole rendered template runs as the test user against stand-ins: a
// private /tmp and /var/tmp, a home, the image's tool directory, payloads for
// every staged binary and a runuser that runs the command after "--". Every
// old log name in the /tmp stand-in is a symlink to a protected file, and
// ~/.local/bin holds a hardlink to another; none of them may change.
func TestBootstrapRootNeverWritesThroughPlantedLinks(t *testing.T) {
	me, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}
	if group, err := user.LookupGroupId(me.Gid); err != nil || group.Name != me.Username {
		t.Skipf("the container template uses %s:%s as owner and group; this user's group differs", me.Username, me.Username)
	}
	oldLogs := []string{"bun-install", "jj-bootstrap", "coding-host-smoke", "jj-export-smoke", "cli-help"}
	for name, tc := range map[string]struct {
		raw  string
		runs []string // markers proving each root-logged step ran
	}{
		"container": {BootstrapTemplate, []string{"npm-install", "node-jj", "coding-host", "jj-export", "cli"}},
		"nixos":     {BootstrapNixOSTemplate, []string{"coding-host", "jj-export", "cli"}},
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			dirs := map[string]string{}
			for _, d := range []string{"tmp", "vartmp", "home/.local/bin", "sys", "shims", "tools", "protected", "artifacts", "usrlocal", "ran", "payload"} {
				dirs[d] = filepath.Join(root, d)
				if err := os.MkdirAll(dirs[d], 0755); err != nil {
					t.Fatal(err)
				}
			}
			home, bin, ran := filepath.Join(root, "home"), dirs["home/.local/bin"], dirs["ran"]
			write := func(path, body string, mode os.FileMode) {
				t.Helper()
				if err := os.WriteFile(path, []byte(body), mode); err != nil {
					t.Fatal(err)
				}
			}
			mark := func(name string) string { return "touch '" + filepath.Join(ran, name) + "'\n" }

			// Only the tools the templates use, so nothing on the host (bun,
			// claude, a real node) changes which branch runs.
			for _, tool := range []string{"bash", "sh", "install", "mktemp", "cat", "grep", "rm", "mkdir", "tar", "find", "head", "base64", "gzip", "env", "sed", "ln", "mv", "cp", "touch", "chown", "id", "sleep", "readlink", "dirname"} {
				if path, err := exec.LookPath(tool); err == nil {
					if err := os.Symlink(path, filepath.Join(dirs["tools"], tool)); err != nil {
						t.Fatal(err)
					}
				}
			}
			write(filepath.Join(dirs["shims"], "runuser"), "#!/bin/sh\nwhile [ \"$1\" != -- ]; do shift; done\nshift\nexec \"$@\"\n", 0755)
			// The image's tools: an incompatible jj, a Node to reuse, an npm.
			jjArchive := filepath.Join(root, "jj.tar.gz")
			write(filepath.Join(dirs["payload"], "jj"), "#!/bin/sh\necho 'jj 0.39.0'\n", 0755)
			if out, err := exec.Command("tar", "-czf", jjArchive, "-C", dirs["payload"], "jj").CombinedOutput(); err != nil {
				t.Fatalf("jj archive: %v %s", err, out)
			}
			write(filepath.Join(dirs["sys"], "jj"), "#!/bin/sh\necho 'jj 0.44.0'\n", 0755)
			write(filepath.Join(dirs["sys"], "node"), "#!/bin/sh\nif [ \"$1\" = --version ]; then echo v22.9.0; exit 0; fi\ntouch \""+filepath.Join(ran, "node-")+"$SMITHERS_DOWNLOAD_MODE\"\n"+"[ \"$SMITHERS_DOWNLOAD_MODE\" != jj ] || cp '"+jjArchive+"' \"$SMITHERS_JJ_ARCHIVE\"\necho downloaded\n", 0755)
			write(filepath.Join(dirs["sys"], "npm"), "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 10.0.0; exit 0; fi\n"+mark("npm-install")+"echo \"npm $*\"\n", 0755)
			// Claude is already there, so the bootstrap ends at its ownership step.
			write(filepath.Join(bin, "claude"), "#!/bin/sh\n", 0755)

			// Payloads for the coding host, the jj export helper and the CLI.
			gz := func(body string) string {
				var buf bytes.Buffer
				zw := gzip.NewWriter(&buf)
				_, _ = zw.Write([]byte(body))
				_ = zw.Close()
				return base64.StdEncoding.EncodeToString(buf.Bytes())
			}
			write(filepath.Join(dirs["artifacts"], "coding-host.b64.part00000000"), gz("#!/bin/sh\n"+mark("coding-host")+"echo coding host help\n"), 0644)
			write(filepath.Join(dirs["artifacts"], "jj-export.b64.part00000000"), gz("#!/bin/sh\n"+mark("jj-export")+"echo jj export 1\n"), 0644)
			var cli bytes.Buffer
			zw := gzip.NewWriter(&cli)
			tw := tar.NewWriter(zw)
			launcher := []byte("#!/bin/sh\n" + mark("cli") + "echo usage: smithers\n")
			if err := tw.WriteHeader(&tar.Header{Name: "node_modules/@smthrs/cli/bin/smithers.mjs", Mode: 0755, Size: int64(len(launcher))}); err != nil {
				t.Fatal(err)
			}
			_, _ = tw.Write(launcher)
			_ = tw.Close()
			_ = zw.Close()
			write(filepath.Join(dirs["artifacts"], "cli.b64.part00000000"), base64.StdEncoding.EncodeToString(cli.Bytes()), 0644)

			// The planted links: every old fixed log name, and a hardlink.
			const untouched = "root-owned\n"
			for _, log := range oldLogs {
				target := filepath.Join(dirs["protected"], log)
				write(target, untouched, 0644)
				if err := os.Symlink(target, filepath.Join(dirs["tmp"], "smithers-workspace-"+log+".log")); err != nil {
					t.Fatal(err)
				}
			}
			shadow := filepath.Join(dirs["protected"], "shadow")
			write(shadow, untouched, 0600)
			if err := os.Link(shadow, filepath.Join(bin, "shadow")); err != nil {
				t.Fatal(err)
			}
			var before syscall.Stat_t
			if err := syscall.Stat(shadow, &before); err != nil {
				t.Fatal(err)
			}

			vars := sampleBootstrapVars()
			for key, value := range map[string]string{
				"User": me.Username, "Home": "/PLACEHOLDER-home", "LocalDir": "/PLACEHOLDER-home/.local", "LocalBinDir": "/PLACEHOLDER-home/.local/bin",
				"LocalNodeDir": "/PLACEHOLDER-home/.local/node", "NodeInstallLog": "/PLACEHOLDER-home/.smithers/node-install.log", "ClaudeInstallScript": "true",
				"CodingHostPath": "/PLACEHOLDER-usrlocal/smithers-coding-host", "CodingHostB64Path": "/PLACEHOLDER-artifacts/coding-host.b64",
				"JJExportPath": "/PLACEHOLDER-usrlocal/smithers-jj-export", "JJExportB64Path": "/PLACEHOLDER-artifacts/jj-export.b64",
				"CLIPackageB64Path": "/PLACEHOLDER-artifacts/cli.b64", "CLIPackageDir": "/PLACEHOLDER-cli",
			} {
				vars[key] = value
			}
			rendered := renderBootstrapTemplate(t, tc.raw, vars)
			toolPath := dirs["shims"] + ":" + dirs["sys"] + ":" + dirs["tools"]
			// One pass, so a replacement (t.TempDir lives in /tmp) is never
			// rewritten again.
			script := strings.NewReplacer(
				"/var/tmp/", dirs["vartmp"]+"/",
				"/tmp/", dirs["tmp"]+"/",
				"/PLACEHOLDER-home", home,
				"/PLACEHOLDER-usrlocal", dirs["usrlocal"],
				"/PLACEHOLDER-artifacts", dirs["artifacts"],
				"/PLACEHOLDER-cli", filepath.Join(root, "cli"),
				"PATH="+containerRootPath+"\n", "PATH="+toolPath+"\n",
				"PATH="+developerNodePath+" ", "PATH="+dirs["sys"]+":"+dirs["tools"]+" ",
				"in /usr/local/bin /usr/bin /bin;", "in '"+dirs["sys"]+"';",
				"/usr/local/bin/jj", filepath.Join(dirs["sys"], "jj"),
			).Replace(rendered)
			cmd := exec.Command(filepath.Join(dirs["tools"], "bash"), "-c", script)
			cmd.Env = append(os.Environ(), "PATH="+toolPath)
			out, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("bootstrap failed: %v\n%s", err, out)
			}

			for _, step := range tc.runs {
				if _, err := os.Stat(filepath.Join(ran, step)); err != nil {
					t.Errorf("step %s never ran, so its log was never opened:\n%s", step, out)
				}
			}
			for _, log := range oldLogs {
				if body, _ := os.ReadFile(filepath.Join(dirs["protected"], log)); string(body) != untouched {
					t.Errorf("root wrote through the symlink planted at /tmp/smithers-workspace-%s.log: target now %q", log, body)
				}
			}
			var after syscall.Stat_t
			if err := syscall.Stat(shadow, &after); err != nil {
				t.Fatal(err)
			}
			if after.Ctim != before.Ctim || after.Uid != before.Uid || after.Gid != before.Gid {
				t.Errorf("root changed the hardlinked file's inode (chown through ~/.local): ctime %v -> %v", before.Ctim, after.Ctim)
			}
			// Root's logs are in one fresh directory only its owner can enter.
			logDirs, _ := filepath.Glob(filepath.Join(dirs["tmp"], "smithers-workspace-logs.*"))
			if len(logDirs) != 1 {
				t.Fatalf("want one root log directory, got %v\n%s", logDirs, out)
			}
			if info, err := os.Stat(logDirs[0]); err != nil || info.Mode().Perm() != 0700 {
				t.Errorf("root log directory %s: %v %v, want mode 0700", logDirs[0], info, err)
			}
			if _, err := os.Stat(filepath.Join(logDirs[0], "cli-help.log")); err != nil {
				t.Errorf("the CLI smoke log is not in the root log directory: %v", err)
			}
		})
	}
}
