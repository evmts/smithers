package microsandbox

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestVendorNetworkRules(t *testing.T) {
	r := &Runtime{config: Config{CPUs: 2, MemoryMiB: 1024, HostPorts: []uint16{4000}}, owner: "smithers-backend-0123456789abcdef", holder: "test"}
	flags := strings.Join(r.machineFlags("lane"), " ")
	require.Contains(t, flags, "--no-net --net-rule allow@dns")
	for _, host := range vendorHosts {
		require.Equal(t, 1, strings.Count(flags, "--net-rule allow@"+host))
	}
	require.Contains(t, flags, "--net-rule allow@host:tcp:4000")
	require.NotContains(t, flags, "allow@*")
	require.NotContains(t, flags, "example.com")
}

// Supplemental shell tests use a stand-in npm; the real guest test below is
// the installation/network receipt. macOS has no flock, so only this stand-in
// acknowledges it; actual locking is exercised by concurrent guest opens.
func TestVendorBootstrapFailureRetryDuplicateAndCancellation(t *testing.T) {
	home := t.TempDir()
	bin := t.TempDir()
	write := func(name, body string) {
		require.NoError(t, os.WriteFile(filepath.Join(bin, name), []byte("#!/bin/sh\n"+body), 0700))
	}
	write("flock", "exit 0\n")
	write("npm", `echo install >> "$HOME/calls"
[ ! -e "$HOME/fail" ] || exit 7
if [ -e "$HOME/slow" ]; then sleep 30; fi
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\nexit 0\n' > "$HOME/.local/bin/claude"
cp "$HOME/.local/bin/claude" "$HOME/.local/bin/codex"
chmod +x "$HOME/.local/bin/claude" "$HOME/.local/bin/codex"
`)
	run := func(ctx context.Context) ([]byte, error) {
		args := vendorTerminalArgs([]string{"/bin/sh", "-c", `printf '%s' "$1"`, "shell", "literal $HOME; space"})
		cmd := exec.CommandContext(ctx, args[0], args[1:]...)
		cmd.Env = append(os.Environ(), "HOME="+home, "PATH="+bin+":/usr/bin:/bin")
		return cmd.CombinedOutput()
	}
	require.NoError(t, os.WriteFile(filepath.Join(home, "fail"), nil, 0600))
	_, err := run(t.Context())
	require.Error(t, err)
	require.NoError(t, os.Remove(filepath.Join(home, "fail")))
	out, err := run(t.Context())
	require.NoError(t, err, string(out))
	require.Equal(t, "literal $HOME; space", string(out))
	out, err = run(t.Context())
	require.NoError(t, err, string(out))
	calls, err := os.ReadFile(filepath.Join(home, "calls"))
	require.NoError(t, err)
	require.Equal(t, "install\ninstall\n", string(calls))
	require.NoError(t, os.Remove(filepath.Join(home, ".local/bin/codex")))
	require.NoError(t, os.WriteFile(filepath.Join(home, "slow"), nil, 0600))
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	start := time.Now()
	_, err = run(ctx)
	require.Error(t, err)
	require.Less(t, time.Since(start), time.Second)
}

func FuzzVendorTerminalArguments(f *testing.F) {
	f.Add("space and ; $HOME")
	f.Add("")
	f.Add("--version")
	f.Fuzz(func(t *testing.T, arg string) {
		argv := []string{"claude", arg}
		wrapped := vendorTerminalArgs(argv)
		require.Equal(t, argv, wrapped[4:])
		require.Equal(t, "vendor-terminal", wrapped[3])
		wrapped[4] = "changed"
		require.Equal(t, "claude", argv[0])
	})
}
