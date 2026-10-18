package workspace_scripts

import (
	"strings"
	"testing"
)

// The NixOS bootstrap runs as root and reruns on resume, reprovision and live
// staging. The developer owns ~/.local/bin and home, so a binary planted there
// would run as root if a root step ran it or put it on PATH. Root steps may
// create, link and chown developer paths; only runuser steps may execute them.
func TestNixOSBootstrapRootStepsNeverRunDeveloperPaths(t *testing.T) {
	vars := sampleBootstrapVars()
	rendered := renderBootstrapTemplate(t, BootstrapNixOSTemplate, vars)
	developerPaths := []string{vars["LocalBinDir"], vars["LocalDir"], vars["Home"]}
	rootMayTouch := []string{"install -d ", "ln -sfn ", "chown -R ", "if [ -x ", "[ -x ", "mkdir -p "}
	resolvesTools := false
	for number, raw := range strings.Split(rendered, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") || strings.Contains(line, "runuser -u ") {
			continue
		}
		if strings.Contains(line, `command -v "$tool"`) {
			resolvesTools = true
			if !strings.Contains(line, "PATH=/run/current-system/sw/bin:/usr/bin:/bin;") {
				t.Errorf("line %d: root resolves the linked tools on an inherited PATH: %s", number+1, line)
			}
		}
		for rest := line; strings.Contains(rest, "PATH="); {
			rest = rest[strings.Index(rest, "PATH=")+len("PATH="):]
			value, _, _ := strings.Cut(rest, " ")
			value, _, _ = strings.Cut(value, ";")
			if strings.Contains(value, "$PATH") {
				t.Errorf("line %d: root PATH inherits the caller's PATH: %s", number+1, line)
			}
			for _, path := range developerPaths {
				if strings.Contains(value, path) {
					t.Errorf("line %d: root PATH holds developer path %s: %s", number+1, path, line)
				}
			}
		}
		if !strings.Contains(line, vars["LocalBinDir"]) || hasAnyPrefix(line, rootMayTouch) {
			continue
		}
		t.Errorf("line %d: root step uses ~/.local/bin outside install, ln, chown or a test: %s", number+1, line)
	}
	if !resolvesTools {
		t.Fatal("the tool-linking loop moved; update this test")
	}
}

func hasAnyPrefix(line string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if strings.HasPrefix(line, prefix) {
			return true
		}
	}
	return false
}
