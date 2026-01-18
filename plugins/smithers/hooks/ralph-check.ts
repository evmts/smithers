#!/usr/bin/env bun
/**
 * Ralph hook - checks if ralph mode is enabled and restarts with initial prompt.
 *
 * To enable ralph mode, create a file: .smithers/ralph-enabled
 * The hook will:
 * 1. Read the initial prompt from the Smithers DB
 * 2. Block stopping and return the initial prompt as context
 * 3. Increment the ralph counter
 * 4. Remove the ralph-enabled file (one-shot)
 */

import { PGlite } from '@electric-sql/pglite'

interface HookInput {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string
  stop_hook_active: boolean
}

interface HookOutput {
  decision: 'block' | 'allow'
  reason?: string
}

async function main() {
  const input: HookInput = await Bun.stdin.json()

  const ralphFlagPath = `${input.cwd}/.smithers/ralph-enabled`
  const dbPath = `${input.cwd}/.smithers/db`

  // Check if ralph mode is enabled
  const ralphEnabled = await Bun.file(ralphFlagPath).exists()

  if (!ralphEnabled) {
    // Ralph not enabled - allow stopping
    process.exit(0)
  }

  try {
    const pg = new PGlite(dbPath)

    // Get the initial prompt for this session
    const result = await pg.query<{ initial_prompt: string; ralph_count: number }>(
      'SELECT initial_prompt, ralph_count FROM ralph_sessions WHERE session_id = $1',
      [input.session_id]
    )

    if (result.rows.length === 0) {
      // No session found - allow stopping
      await pg.close()
      process.exit(0)
    }

    const { initial_prompt, ralph_count } = result.rows[0]

    // Increment ralph count
    await pg.query(
      `UPDATE ralph_sessions
       SET ralph_count = ralph_count + 1, last_ralph_at = NOW()
       WHERE session_id = $1`,
      [input.session_id]
    )

    await pg.close()

    // Remove the ralph flag (one-shot trigger)
    const deleted = await Bun.file(ralphFlagPath).delete?.()
    if (!deleted) await Bun.write(ralphFlagPath + '.done', '')

    // Block stopping and provide the initial prompt
    const output: HookOutput = {
      decision: 'block',
      reason: `RALPH ACTIVATED (iteration ${ralph_count + 1}): Context cleared. Continue with the original task:\n\n${initial_prompt}`
    }

    console.log(JSON.stringify(output))
    process.exit(0)
  } catch {
    // DB error - allow stopping
    process.exit(0)
  }
}

main().catch(() => process.exit(0))
