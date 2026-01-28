export class PiNotInstalledError extends Error {
  readonly code = 'PI_NOT_INSTALLED'
  constructor() {
    super('pi CLI not found. Install with: npm i -g @mariozechner/pi-coding-agent')
  }
}

export class PiAuthError extends Error {
  readonly code = 'PI_AUTH_ERROR'
  readonly provider: string
  constructor(provider: string, message: string) {
    super(`${provider} auth failed: ${message}`)
    this.provider = provider
  }
}

export function detectPiError(stderr: string, exitCode: number): Error | null {
  // Not installed
  if (exitCode === 127) return new PiNotInstalledError()
  
  // Auth errors
  if (stderr.includes('API key') || stderr.includes('ANTHROPIC_API_KEY')) {
    const provider = extractProvider(stderr)
    return new PiAuthError(provider, 'Missing or invalid API key')
  }
  
  // OAuth expired
  if (stderr.includes('token expired') || stderr.includes('refresh failed')) {
    const provider = extractProvider(stderr)
    return new PiAuthError(provider, 'OAuth token expired, run /login')
  }
  
  // Rate limiting
  if (stderr.includes('429') || stderr.includes('rate limit')) {
    return new Error('Rate limited - retry after cooldown')
  }
  
  return null
}

function extractProvider(text: string): string {
  const providers = ['anthropic', 'openai', 'google', 'github-copilot']
  for (const p of providers) {
    if (text.toLowerCase().includes(p)) return p
  }
  return 'unknown'
}
