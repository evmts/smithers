import { $ } from 'bun'

export interface BugReport {
  title: string
  errorMessage: string
  stackTrace: string
  minimalRepro?: string
  workaroundApplied?: string
  smithersVersion: string
  bunVersion: string
  os: string
}

export async function checkGhAuth(): Promise<{ available: boolean; authenticated: boolean }> {
  try {
    const authResult = await $`gh auth status`.quiet().nothrow()
    if (authResult.exitCode !== 0) {
      return { available: true, authenticated: false }
    }

    const repoResult = await $`gh repo view evmts/smithers`.quiet().nothrow()
    return {
      available: true,
      authenticated: repoResult.exitCode === 0,
    }
  } catch {
    return { available: false, authenticated: false }
  }
}

export function getSmithersVersion(): string {
  try {
    const packagePath = new URL('../../package.json', import.meta.url)
    const pkg = require(packagePath.pathname)
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function getSystemInfo(): { os: string; bunVersion: string } {
  return {
    os: `${process.platform} ${process.arch}`,
    bunVersion: Bun.version,
  }
}

function buildIssueBody(report: BugReport): string {
  const lines = [
    '## Bug Report (SuperSmithers Auto-Generated)',
    '',
    `**Smithers Version**: ${report.smithersVersion}`,
    `**Environment**: ${report.os}, bun ${report.bunVersion}`,
    '',
    '### Error',
    '```',
    report.stackTrace,
    '```',
  ]

  if (report.minimalRepro) {
    lines.push('', '### Minimal Reproduction', '```tsx', report.minimalRepro, '```')
  }

  if (report.workaroundApplied) {
    lines.push('', '### Workaround Applied', report.workaroundApplied)
  }

  lines.push('', '---', '*This issue was automatically created by SuperSmithers god agent.*')

  return lines.join('\n')
}

export async function reportBug(
  report: BugReport
): Promise<{ success: boolean; issueUrl?: string; error?: string }> {
  const auth = await checkGhAuth()

  if (!auth.available) {
    return { success: false, error: 'gh CLI not installed' }
  }

  if (!auth.authenticated) {
    return { success: false, error: 'gh CLI not authenticated to evmts/smithers' }
  }

  const body = buildIssueBody(report)

  try {
    const result = await $`gh issue create --repo evmts/smithers --title ${report.title} --label bug,supersmithers-reported --body ${body}`.quiet()

    const output = result.text()
    const urlMatch = output.match(/https:\/\/github\.com\/evmts\/smithers\/issues\/\d+/)

    return {
      success: true,
      issueUrl: urlMatch?.[0] ?? output.trim(),
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
