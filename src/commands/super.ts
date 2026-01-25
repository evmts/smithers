import { existsSync } from 'fs'
import * as path from 'path'
import { resolveDbPaths } from './cli-utils.js'
import { runGodAgent } from '../supersmithers-cli/god-agent.js'

export interface SuperOptions {
  model: 'haiku' | 'sonnet' | 'opus'
  maxRestarts: number
  restartCooldown: number
  dbPath: string
  reportBugs: boolean
  dryRun: boolean
}

export const DEFAULT_SUPER_OPTIONS: SuperOptions = {
  model: 'sonnet',
  maxRestarts: 10,
  restartCooldown: 30,
  dbPath: '.smithers/data',
  reportBugs: true,
  dryRun: false,
}

export function parseCooldown(value: string): number {
  const match = value.match(/^(\d+)(s|m|h)?$/)
  if (!match) {
    throw new Error(`Invalid cooldown format: ${value}. Use format like "30s", "5m", or "1h"`)
  }
  const num = parseInt(match[1]!, 10)
  const unit = match[2] || 's'
  switch (unit) {
    case 's': return num
    case 'm': return num * 60
    case 'h': return num * 3600
    default: return num
  }
}

export async function superCommand(file: string, options: Partial<SuperOptions> = {}): Promise<void> {
  const opts: SuperOptions = { ...DEFAULT_SUPER_OPTIONS, ...options }

  const filePath = path.resolve(file)
  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    process.exit(1)
  }

  if (!filePath.endsWith('.tsx')) {
    console.error(`❌ File must be a .tsx file: ${filePath}`)
    process.exit(1)
  }

  const { dbFile } = resolveDbPaths(opts.dbPath)

  console.log('[SUPER] SuperSmithers v2 - CLI God Agent')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log(`  Plan file:        ${filePath}`)
  console.log(`  Model:            ${opts.model}`)
  console.log(`  Max restarts:     ${opts.maxRestarts}`)
  console.log(`  Restart cooldown: ${opts.restartCooldown}s`)
  console.log(`  Database:         ${dbFile}`)
  console.log(`  Report bugs:      ${opts.reportBugs}`)
  console.log(`  Dry run:          ${opts.dryRun}`)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (opts.dryRun) {
    console.log('')
    console.log('[SUPER] Dry run mode - exiting without execution')
    return
  }

  console.log('')

  const exitCode = await runGodAgent({
    planFile: filePath,
    dbPath: dbFile,
    maxRestarts: opts.maxRestarts,
    restartCooldown: opts.restartCooldown,
    model: opts.model,
    reportBugs: opts.reportBugs,
    dryRun: opts.dryRun,
  })

  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
