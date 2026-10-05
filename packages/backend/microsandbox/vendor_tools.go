package microsandbox

// R2 permits only the vendor API/login endpoints and public npm registry.
// Reuse the layer net-rule contract; the credential relay audit is T-MCH-12.
var vendorHosts = [...]string{
	"api.anthropic.com", "claude.ai", "console.anthropic.com",
	"api.openai.com", "auth.openai.com", "chatgpt.com", "registry.npmjs.org",
}

// Installation runs inside the terminal's existing unprivileged execution
// boundary. npm lifecycle scripts never run as root. Guest home is retained
// across terminal closes and workspace stops, including vendor login files.
// Existing layer installation handles repository dependencies, not interactive
// tools, so first-open installation needs this small terminal wrapper.
const vendorTerminalBootstrap = `set -eu
export PATH="$HOME/.local/bin:${PATH:-/usr/local/bin:/usr/bin:/bin}"
mkdir -p "$HOME/.local"
(
 flock -x 9
 if [ ! -x "$HOME/.local/bin/claude" ] || [ ! -x "$HOME/.local/bin/codex" ]; then
  npm i -g --prefix "$HOME/.local" --registry https://registry.npmjs.org @anthropic-ai/claude-code @openai/codex
 fi
) 9>"$HOME/.local/.vendor-install.lock"
exec "$@"
`

func vendorTerminalArgs(argv []string) []string {
	return append([]string{"/bin/sh", "-c", vendorTerminalBootstrap, "vendor-terminal"}, argv...)
}
