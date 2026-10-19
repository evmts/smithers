// E-7 (EK4402): process.env is a platform read that VibeLang code does not make
// directly. commands/Claude.vibe falls back to Claude Code's session id
// through this, exactly as commands/Claude.ts reads it.

/** `process.env["CLAUDE_CODE_SESSION_ID"]`. */
export const claudeCodeSessionId = (): string | undefined => process.env["CLAUDE_CODE_SESSION_ID"]
