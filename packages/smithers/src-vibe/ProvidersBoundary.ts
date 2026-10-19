// A-2/E-4 (EK1003): `claudeCode` is an async function that hands a Promise to
// TypeScript callers, so it stays TypeScript. Providers.vibe rebinds it with
// its JSDoc; the body is Providers.ts's own, line for line.
import * as Environment from "./Environment.ts"
import type { Host } from "./Providers.vibe"

export const claudeCode = async (host: Host): Promise<{
  readonly available: boolean
  readonly reason: string
  readonly setupHint: string
  readonly executable?: string | undefined
}> => {
  if (Environment.read(host.environment, "ANTHROPIC_API_KEY") !== undefined) {
    return {
      available: false,
      reason: "$ANTHROPIC_API_KEY is set, so Claude seats run on the API",
      setupHint: "use an anthropic:<model> seat, or unset ANTHROPIC_API_KEY to use your Claude subscription"
    }
  }
  const login = await host.claudeCode?.()
  if (login === undefined) {
    return {
      available: false,
      reason: "Claude Code is not installed",
      setupHint: "install Claude Code (https://code.claude.com), then run `claude auth login`"
    }
  }
  if (!login.loggedIn || (login.authMethod !== "claude.ai" && login.authMethod !== "oauth_token")) {
    return {
      available: false,
      reason: login.error === undefined
        ? "Claude Code is not signed in with a Claude subscription"
        : `Claude Code auth status failed: ${login.error}`,
      setupHint: "run `claude auth login`"
    }
  }
  return {
    available: true,
    reason: `Claude Code is signed in with a Claude ${login.subscriptionType ?? "subscription"}`,
    setupHint: "run `claude auth login`",
    executable: login.executable
  }
}

