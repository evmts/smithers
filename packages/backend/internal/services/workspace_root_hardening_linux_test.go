//go:build linux

package services

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// plantedLinkGuest runs guest commands under bash on this host, with the
// guest's /run, /tmp, /etc/profile.d, home and workdir mapped into root. Its
// WriteFile follows symlinks, as a write by root in a real guest does.
type plantedLinkGuest struct {
	*mockWorkspaceSandboxVMClient
	root, shims string
	paths       *strings.Replacer
}

func newPlantedLinkGuest(t *testing.T) *plantedLinkGuest {
	t.Helper()
	root := t.TempDir()
	g := &plantedLinkGuest{mockWorkspaceSandboxVMClient: &mockWorkspaceSandboxVMClient{}, root: root, shims: filepath.Join(root, "shims")}
	for _, dir := range []string{"shims", "run", "tmp", "etc/profile.d", strings.TrimPrefix(defaultWorkspaceHome, "/"), strings.TrimPrefix(defaultWorkspaceClonePath, "/"), "protected"} {
		require.NoError(t, os.MkdirAll(filepath.Join(root, dir), 0755))
	}
	g.paths = strings.NewReplacer(
		root, root, // t.TempDir lives in /tmp: never map a mapped path again
		"PATH=/run/current-system/sw/bin:/usr/sbin:/usr/bin:/sbin:/bin", "PATH="+g.shims+":/usr/bin:/bin",
		"/run/smithers-agent-environment", root+"/run/smithers-agent-environment",
		"/tmp/", root+"/tmp/",
		"/etc/profile.d/", root+"/etc/profile.d/",
		defaultWorkspaceHome, root+defaultWorkspaceHome,
		shellQuote(defaultWorkspaceClonePath), shellQuote(root+defaultWorkspaceClonePath),
	)
	return g
}

func (g *plantedLinkGuest) WriteFile(_ context.Context, _ string, path string, req sandbox.WriteFileRequest) error {
	path = g.paths.Replace(path)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(g.paths.Replace(req.Content)), 0644)
}

func (g *plantedLinkGuest) Execute(_ context.Context, _ string, req sandbox.ExecRequest) (sandbox.ExecResult, error) {
	if strings.HasPrefix(strings.TrimPrefix(req.Command, workspaceArtifactGuestPath), "if ! test -L ") {
		return sandbox.ExecResult{StatusCode: new(int32), Stdout: "done"}, nil
	}
	cmd := exec.Command("bash", "-c", g.paths.Replace(req.Command))
	cmd.Env = append(os.Environ(), "PATH="+g.shims+":/usr/bin:/bin")
	for name, value := range req.Secrets {
		cmd.Env = append(cmd.Env, name+"="+value)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	status := int32(0)
	if err := cmd.Run(); err != nil {
		var exit *exec.ExitError
		if !errors.As(err, &exit) {
			return sandbox.ExecResult{}, err
		}
		status = int32(exit.ExitCode())
	}
	return sandbox.ExecResult{StatusCode: &status, Stdout: strings.ReplaceAll(stdout.String(), g.root, ""), Stderr: stderr.String()}, nil
}

// writeDropShim writes a runuser that records its arguments, marks the
// developer's turn with a flag file while the command after "--" runs, and
// returns its status. A test cannot switch users; the flag stands for the uid.
func (g *plantedLinkGuest) writeDropShim(t *testing.T) (args, flag string) {
	t.Helper()
	args, flag = filepath.Join(g.root, "runuser.args"), filepath.Join(g.root, "as-developer")
	body := "#!/bin/sh\nprintf '%s\\n' \"$@\" >>'" + args + "'\nwhile [ \"$1\" != -- ]; do shift; done\nshift\ntouch '" + flag + "'\nstatus=0\n\"$@\" || status=$?\nrm -f '" + flag + "'\nexit $status\n"
	require.NoError(t, os.WriteFile(filepath.Join(g.shims, "runuser"), []byte(body), 0755))
	return args, flag
}

// Security d-7lu7ja: root staged the repository's setup script at the fixed
// /tmp/smithers-agent-environment-setup.sh, so a symlink planted there made
// the repository's content a root-owned file anywhere. The setup must leave
// that link's target alone and still run the script as the developer, in the
// workdir, with no arguments and /dev/null for input.
func TestAgentEnvironmentSetupIgnoresAPlantedTmpLinkAndRunsAsTheDeveloper(t *testing.T) {
	g := newPlantedLinkGuest(t)
	args, flag := g.writeDropShim(t)
	target := filepath.Join(g.root, "protected", "target")
	require.NoError(t, os.WriteFile(target, []byte("root-owned\n"), 0644))
	require.NoError(t, os.Symlink(target, filepath.Join(g.root, "tmp", "smithers-agent-environment-setup.sh")))
	out := func(name string) string { return filepath.Join(g.root, name) }
	script := strings.Join([]string{
		"pwd >'" + out("pwd") + "'",
		"if [ -e '" + flag + "' ]; then touch '" + out("ran-as-developer") + "'; fi",
		"printf '%s' \"$#\" >'" + out("argc") + "'",
		"cat >'" + out("stdin") + "'",
		"test \"$SETUP_TOKEN\" = setup-only-value",
	}, "\n")
	queries := &agentEnvironmentStageQuerier{mockWorkspaceQuerier: &mockWorkspaceQuerier{}}
	service := &WorkspaceService{q: queries, sandbox: g, agentEnvironment: staticAgentEnvironmentProvider{config: AgentEnvironmentProvisioningConfig{
		SetupScript: script,
		Secrets:     map[string]string{"SETUP_TOKEN": "setup-only-value"},
	}}}

	require.NoError(t, service.runWorkspaceAgentEnvironmentSetup(context.Background(), db.Workspace{ID: "ws-planted"}, "vm-planted"))
	require.Equal(t, []string{"toolchain_bootstrap", "environment_setup", "ready"}, queries.stages)

	body, err := os.ReadFile(target)
	require.NoError(t, err)
	require.Equal(t, "root-owned\n", string(body), "root wrote the setup script through the planted /tmp link")
	require.FileExists(t, out("ran-as-developer"), "the setup script must run inside runuser, as the developer")
	recorded, err := os.ReadFile(args)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(string(recorded), "-u\n"+defaultWorkspaceUser+"\n--preserve-environment\n--\n"), "runuser args: %q", recorded)
	for name, want := range map[string]string{"pwd": g.root + defaultWorkspaceClonePath + "\n", "argc": "0", "stdin": ""} {
		got, err := os.ReadFile(out(name))
		require.NoError(t, err)
		require.Equal(t, want, string(got), name)
	}
	leftovers, _ := filepath.Glob(filepath.Join(g.root, "run", "smithers-agent-environment*"))
	require.Empty(t, leftovers, "the run directory and its secret-bearing wrapper must be gone")
}

// Security d-7lu7ja: root created the children token file inside the
// developer's own directory and then chowned it, so the developer could swap
// the entry for a hardlink or symlink between two root steps. The developer
// now writes its own credential, which reaches it on standard input only.
func TestWorkspaceChildrenTokenIsWrittenByTheDeveloper(t *testing.T) {
	g := newPlantedLinkGuest(t)
	args, flag := g.writeDropShim(t)
	// Root's ownership tools record any call made outside runuser.
	rootCalls := filepath.Join(g.root, "root-calls")
	for _, tool := range []string{"chown", "install"} {
		body := "#!/bin/sh\n[ -e '" + flag + "' ] || echo \"" + tool + " $*\" >>'" + rootCalls + "'\n"
		if tool == "install" {
			body += "for last; do :; done\nmkdir -p \"$last\"\n"
		}
		require.NoError(t, os.WriteFile(filepath.Join(g.shims, tool), []byte(body), 0755))
	}
	const secret = "children-token-value"
	result, err := g.Execute(context.Background(), "vm", sandbox.ExecRequest{
		Command: workspaceChildrenTokenInstallCommand(defaultWorkspaceUser),
		Secrets: map[string]string{workspaceChildrenTokenEnv: secret},
	})
	require.NoError(t, err)
	require.Equal(t, int32(0), *result.StatusCode, result.Stderr)

	token := g.root + workspaceChildrenTokenPath
	body, err := os.ReadFile(token)
	require.NoError(t, err)
	require.Equal(t, secret, string(body))
	info, err := os.Stat(token)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0600), info.Mode().Perm())
	if calls, err := os.ReadFile(rootCalls); err == nil {
		t.Fatalf("root changed ownership in the developer's directory:\n%s", calls)
	}
	recorded, err := os.ReadFile(args)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(string(recorded), "-u\n"+defaultWorkspaceUser+"\n--\nenv\n-i\n"), "runuser args: %q", recorded)
	require.NotContains(t, string(recorded), secret, "the token never rides an argument")
}
