package workspace_scripts

import (
	"fmt"
	"strings"
	"testing"
)

// Both bootstraps run as root and rerun on resume, reprovision and live
// staging. The developer owns ~/.local/bin and the rest of home, so a binary
// planted there would run as root if a root step ran it or put it on PATH
// (Security s-qizs0e). Root steps may create and link developer paths
// and test them with [ -x ]; only the developer may run or write through them,
// on a runuser line or in a script that a runuser line hands to the developer.
func TestNixOSBootstrapRootStepsNeverRunDeveloperPaths(t *testing.T) {
	vars := sampleBootstrapVars()
	vars["NodeInstallLog"] = vars["Home"] + "/.smithers/node-install.log" // layout.nodeInstallLog()
	rendered := renderBootstrapTemplate(t, BootstrapNixOSTemplate, vars)
	resolvesTools := false
	for number, raw := range strings.Split(rendered, "\n") {
		line := strings.TrimSpace(raw)
		if strings.Contains(line, `command -v "$tool"`) {
			resolvesTools = true
			if !strings.Contains(line, "PATH=/run/current-system/sw/bin:/usr/bin:/bin;") {
				t.Errorf("line %d: root resolves the linked tools on an inherited PATH: %s", number+1, line)
			}
		}
	}
	if !resolvesTools {
		t.Fatal("the tool-linking loop moved; update this test")
	}
	for _, violation := range rootStepViolations(rendered, vars) {
		t.Error(violation)
	}
}

// The container bootstrap also resolves bun, jj, node and npm by name, so it
// pins root's PATH to root-owned system directories before its first command,
// and the developer, not root, checks and installs the Node in ~/.local.
func TestContainerBootstrapRootStepsNeverRunDeveloperPaths(t *testing.T) {
	vars := sampleBootstrapVars()
	vars["NodeInstallLog"] = vars["Home"] + "/.smithers/node-install.log" // layout.nodeInstallLog()
	rendered := renderBootstrapTemplate(t, BootstrapTemplate, vars)
	var commands []string
	for _, raw := range strings.Split(rendered, "\n") {
		if line := strings.TrimSpace(raw); line != "" && !strings.HasPrefix(line, "#") {
			commands = append(commands, line)
		}
	}
	// set -euo pipefail, then the PATH, then everything else.
	if len(commands) < 2 || commands[0] != "set -euo pipefail" || commands[1] != "PATH="+containerRootPath {
		t.Errorf("root must set PATH=%s right after set -euo pipefail, before resolving any tool; script starts %q", containerRootPath, commands[:min(len(commands), 4)])
	}
	for _, violation := range rootStepViolations(rendered, vars) {
		t.Error(violation)
	}
}

// Security d-evwgfi: root turns on fs.protected_symlinks and
// fs.protected_hardlinks, then makes its private log directory, before any
// other step touches a path the developer can write.
func TestBootstrapTemplatesHardenBeforeAnyStep(t *testing.T) {
	for name, raw := range map[string]string{"container": BootstrapTemplate, "nixos": BootstrapNixOSTemplate} {
		t.Run(name, func(t *testing.T) {
			rendered := renderBootstrapTemplate(t, raw, sampleBootstrapVars())
			sysctl := strings.Index(rendered, "for smithers_sysctl in fs/protected_symlinks fs/protected_hardlinks; do")
			logs := strings.Index(rendered, `smithers_log_dir="$(mktemp -d /tmp/smithers-workspace-logs.XXXXXX)"`)
			first := strings.Index(rendered, "install -d ")
			if group := strings.Index(rendered, "group=\"$(id -gn"); group >= 0 && group < first {
				first = group
			}
			if sysctl < 0 || logs < 0 || first < 0 || sysctl > logs || logs > first {
				t.Fatalf("want the sysctls (at %d), then the log directory (at %d), before the first step (at %d)", sysctl, logs, first)
			}
			if !strings.Contains(rendered, `echo 1 >"/proc/sys/$smithers_sysctl"`) {
				t.Fatal("root must write 1 to each sysctl")
			}
		})
	}
}

// containerRootPath is root's whole PATH in the container bootstrap: the
// artifact guest PATH the provisioner already runs it with, minus the NixOS
// profile a container guest does not have.
const containerRootPath = "/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/sbin:/usr/local/bin"

// developerScriptMarker opens a quoted here-document whose body only the
// developer runs: the function that prints it may appear only on runuser lines.
const developerScriptMarker = "<<'SMITHERS_AS_DEVELOPER'"

func rootStepViolations(rendered string, vars map[string]string) []string {
	developerPaths := []string{vars["LocalBinDir"], vars["LocalDir"], vars["Home"]}
	// No chown: root changes no ownership under the developer's home, where a
	// planted hardlink would hand a root-owned file over (Security d-evwgfi).
	rootMayTouch := []string{"install -d ", "ln -sfn ", "if [ -x ", "[ -x ", "if [ ! -x ", "mkdir -p "}
	var violations, developerScripts, runuserLines []string
	report := func(number int, format string, args ...any) {
		violations = append(violations, fmt.Sprintf("line %d: ", number)+fmt.Sprintf(format, args...))
	}
	lines := strings.Split(rendered, "\n")
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if strings.HasSuffix(line, developerScriptMarker) {
			// name() { cat <<'SMITHERS_AS_DEVELOPER' ... SMITHERS_AS_DEVELOPER }
			name, isFunction := strings.CutSuffix(strings.TrimSpace(strings.TrimSuffix(line, developerScriptMarker)), "() { cat")
			if !isFunction || name == "" {
				report(i+1, "a developer script must be a function that only cats it: %s", line)
			}
			developerScripts = append(developerScripts, name)
			for i++; i < len(lines) && strings.TrimSpace(lines[i]) != "SMITHERS_AS_DEVELOPER"; i++ {
			}
			continue
		}
		if strings.Contains(line, "runuser -u ") {
			runuserLines = append(runuserLines, line)
			continue
		}
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// /tmp and /var/tmp are world-writable: a fixed name there lets the
		// developer plant the file root extracts or a symlink root writes
		// through. Root's scratch and logs are fresh mktemp -d directories.
		if (strings.Contains(line, "/tmp/") || strings.Contains(line, "/var/tmp/")) && !strings.Contains(line, "$(mktemp -d /") {
			report(i+1, "root uses a fixed /tmp or /var/tmp path: %s", line)
		}
		for _, name := range developerScripts {
			if strings.Contains(line, name) {
				report(i+1, "root runs developer script %s outside runuser: %s", name, line)
			}
		}
		for rest := line; strings.Contains(rest, "PATH="); {
			rest = rest[strings.Index(rest, "PATH=")+len("PATH="):]
			value, _, _ := strings.Cut(rest, " ")
			value, _, _ = strings.Cut(value, ";")
			if strings.Contains(value, "$PATH") {
				report(i+1, "root PATH inherits the caller's PATH: %s", line)
			}
			for _, path := range developerPaths {
				if strings.Contains(value, path) {
					report(i+1, "root PATH holds developer path %s: %s", path, line)
				}
			}
		}
		if hasAnyPrefix(line, rootMayTouch) {
			continue
		}
		for _, path := range developerPaths {
			if strings.Contains(line, path) {
				report(i+1, "root step uses developer path %s outside install, ln or a test: %s", path, line)
				break
			}
		}
	}
	for _, name := range developerScripts {
		handed := false
		for _, line := range runuserLines {
			handed = handed || strings.Contains(line, "runuser -u "+vars["User"]+" -- ") && strings.Contains(line, `"$(`+name+`)"`)
		}
		if !handed {
			violations = append(violations, fmt.Sprintf("developer script %s is never handed to runuser -u %s", name, vars["User"]))
		}
	}
	return violations
}

func hasAnyPrefix(line string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if strings.HasPrefix(line, prefix) {
			return true
		}
	}
	return false
}
