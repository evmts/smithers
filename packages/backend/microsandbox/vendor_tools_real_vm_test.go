package microsandbox

import (
	"bytes"
	"io"
	"sync"
	"testing"
	"time"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

// J6.1c requires a real guest: direct TLS, refusal outside the allowlist,
// first-open installation, concurrent opens, and credentials retained on reopen.
func TestRealMicroVMVendorTerminal(t *testing.T) {
	r := realRuntime(t, t.TempDir())
	ctx := operation("vendor-terminal")
	id := "vendor-terminal"
	_, err := r.CreateWorkspace(ctx, workspaceapi.WorkspaceSpec{ID: id})
	require.NoError(t, err)
	run := func(script string) string {
		result, err := r.ExecuteCommand(ctx, id, workspaceapi.Command{Args: []string{"/bin/sh", "-c", script}})
		require.NoError(t, err)
		require.Equal(t, 0, result.ExitCode, result.Stdout+result.Stderr)
		return result.Stdout
	}
	require.Equal(t, "connected\nconnected\ndenied\n", run(`for host in api.anthropic.com registry.npmjs.org; do curl --noproxy '*' -sS -m 20 -o /dev/null "https://$host/" && echo connected || exit 1; done
curl --noproxy '*' -s -m 5 -o /dev/null https://example.com/ && exit 1 || echo denied`))
	open := func() workspaceapi.Terminal {
		term, err := r.OpenWorkspaceTerminal(ctx, id, workspaceapi.Command{Args: []string{"/bin/sh", "-c", `claude --version && codex --version && printf 'VENDOR_READY\n'; sleep 2`}})
		require.NoError(t, err)
		return term
	}
	first, second := open(), open()
	for _, term := range []workspaceapi.Terminal{first, second} {
		var mu sync.Mutex
		var output bytes.Buffer
		done := make(chan struct{})
		go func() {
			defer close(done)
			b := make([]byte, 4096)
			for {
				n, err := term.Read(b)
				mu.Lock()
				output.Write(b[:n])
				mu.Unlock()
				if err != nil {
					return
				}
			}
		}()
		require.Eventually(t, func() bool {
			mu.Lock()
			defer mu.Unlock()
			return bytes.Contains(output.Bytes(), []byte("VENDOR_READY"))
		}, 4*time.Minute, 100*time.Millisecond)
		require.NoError(t, term.Close())
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Fatal("terminal did not close")
		}
	}
	require.Equal(t, "agent\n", run(`stat -c '%U' "$HOME/.local/lib/node_modules/@openai/codex"`))
	require.Equal(t, "", run(`mkdir -p "$HOME/.claude" "$HOME/.codex"; printf sentinel > "$HOME/.codex/login-test"`))
	require.NoError(t, r.StopWorkspace(ctx, id))
	_, err = r.StartWorkspace(ctx, id)
	require.NoError(t, err)
	require.Equal(t, "sentinel", run(`cat "$HOME/.codex/login-test"`))
	term := open()
	defer term.Close()
	output, _ := io.ReadAll(term)
	require.Contains(t, string(output), "VENDOR_READY")
}
