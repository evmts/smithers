package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Security f-ye4hz9: the container bootstrap downloads one exact Node, at or
// above the CLI's floor (packages/smithers/src/internal/NodeVersion.ts,
// 26.4.0), in the major the bootstrap checks for, with a SHA-256 pinned per
// architecture.
func TestWorkspaceNodePinMeetsTheCLIFloor(t *testing.T) {
	parts := strings.Split(workspaceNodeVersion, ".")
	require.Len(t, parts, 3, "an exact x.y.z release, never a range")
	version := make([]int, 3)
	for i, part := range parts {
		n, err := strconv.Atoi(part)
		require.NoError(t, err)
		version[i] = n
	}
	require.Equal(t, workspaceNodeMajor, parts[0], "the pin must be in the major the bootstrap accepts")
	require.True(t, version[0] > 26 || version[0] == 26 && version[1] >= 4, "Node %s is below the CLI floor 26.4.0", workspaceNodeVersion)
	hex := regexp.MustCompile(`^[0-9a-f]{64}$`)
	require.Regexp(t, hex, workspaceNodeSHA256LinuxX64)
	require.Regexp(t, hex, workspaceNodeSHA256LinuxARM)
	require.NotEqual(t, workspaceNodeSHA256LinuxX64, workspaceNodeSHA256LinuxARM)

	script := buildWorkspaceClaudeBootstrapScript(defaultWorkspaceGuestLayout)
	for _, want := range []string{
		`export SMITHERS_NODE_VERSION="` + workspaceNodeVersion + `"`,
		`export SMITHERS_NODE_SHA256_X64="` + workspaceNodeSHA256LinuxX64 + `"`,
		`export SMITHERS_NODE_SHA256_ARM64="` + workspaceNodeSHA256LinuxARM + `"`,
	} {
		require.Contains(t, script, want)
	}
	require.NotContains(t, script, "index.json", "the newest release in the index is never what installs")
}

// Security d-evwgfi: root opens the launch log, so it may not sit at a fixed
// /tmp name a developer could plant a symlink at.
func TestWorkspaceArtifactLaunchLogIsRootPrivate(t *testing.T) {
	require.True(t, strings.HasPrefix(workspaceArtifactLaunchLog, workspaceArtifactRoot+"/"), "launch log %s is outside the root-owned artifact root", workspaceArtifactLaunchLog)
	for _, log := range []string{workspaceCodingHostSmokeLog, workspaceJJExportSmokeLog} {
		require.True(t, strings.HasPrefix(log, "$smithers_log_dir/"), "smoke log %s is outside the bootstrap's root-only log directory", log)
	}
}

// Security d-evwgfi: a fork hands the working copy's .jj to the developer
// without following a symlink and without touching a regular file that has a
// second link, so a hardlink planted there to a root-owned file keeps its
// owner. The walk runs here with a chown that records its arguments, and a
// uid that owns nothing, so every entry not owned by the developer is offered.
func TestForkHandsJJToTheDeveloperWithoutFollowingLinks(t *testing.T) {
	command := buildForkBookmarkSwitchCommand("smithers_token", "landing/demo-123")
	jjDir := shellQuote(defaultWorkspaceClonePath + "/.jj")
	start := strings.Index(command, "find -P "+jjDir)
	require.GreaterOrEqual(t, start, 0, "the fork must hand .jj over with a find -P walk")
	end := strings.Index(command[start:], "; else ")
	require.Greater(t, end, 0)
	walk := command[start : start+end]

	root := t.TempDir()
	jj, shims := filepath.Join(root, ".jj"), filepath.Join(root, "shims")
	require.NoError(t, os.MkdirAll(filepath.Join(jj, "repo"), 0755))
	require.NoError(t, os.MkdirAll(shims, 0755))
	shadow := filepath.Join(root, "shadow")
	require.NoError(t, os.WriteFile(shadow, []byte("root-owned\n"), 0600))
	require.NoError(t, os.Link(shadow, filepath.Join(jj, "repo", "planted")))
	require.NoError(t, os.WriteFile(filepath.Join(jj, "repo", "config-id"), []byte("id"), 0600))
	require.NoError(t, os.Symlink("/etc/passwd", filepath.Join(jj, "repo", "link")))
	args := filepath.Join(root, "chown.args")
	require.NoError(t, os.WriteFile(filepath.Join(shims, "chown"), []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" >>'"+args+"'\n"), 0755))

	walk = strings.NewReplacer(jjDir, shellQuote(jj), "-user "+shellQuote(defaultWorkspaceUser), "-user 4242").Replace(walk)
	cmd := exec.Command("/bin/sh", "-c", walk)
	cmd.Env = append(os.Environ(), "PATH="+shims+":/usr/bin:/bin")
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, string(out))
	raw, err := os.ReadFile(args)
	require.NoError(t, err, "the walk chowned nothing")
	offered := strings.Split(strings.TrimSpace(string(raw)), "\n")
	require.Contains(t, offered, "-h", "chown must not follow a symlink")
	require.Contains(t, offered, filepath.Join(jj, "repo", "config-id"))
	require.Contains(t, offered, filepath.Join(jj, "repo", "link"))
	require.NotContains(t, offered, filepath.Join(jj, "repo", "planted"), "a hardlinked file must keep its owner")
}
