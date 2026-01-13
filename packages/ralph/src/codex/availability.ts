import { execSync } from 'child_process'
import pc from 'picocolors'

export async function checkCodexAvailable(): Promise<boolean> {
  try {
    execSync('which codex', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function displayCodexInstallGuide() {
  console.log(`
${pc.yellow('⚠️  Codex CLI not found')}

Ralph uses Codex for automated code reviews.

${pc.bold('Install Codex:')}
  ${pc.dim('$')} brew install codex
  ${pc.dim('$')} npm install -g codex-cli

${pc.bold('Or skip reviews:')}
  ${pc.dim('$')} ralph setup-hooks --no-codex

More info: ${pc.underline('https://github.com/evmts/codex')}
  `)
}
