#!/usr/bin/env bun
/**
 * Captures the initial user prompt and stores it in the Smithers DB
 * for potential ralph (restart with same prompt) operations.
 */

import { PGlite } from '@electric-sql/pglite'

interface HookInput {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string
  prompt: string
}

async function main() {
  const input: HookInput = await Bun.stdin.json()

  // Only capture the first prompt (initial prompt)
  const dbPath = `${input.cwd}/.smithers/db`

  try {
    const pg = new PGlite(dbPath)

    // Create ralph_sessions table if it doesn't exist
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS ralph_sessions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        session_id TEXT NOT NULL,
        initial_prompt TEXT NOT NULL,
        ralph_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        last_ralph_at TIMESTAMP
      )
    `)

    // Check if we already have this session
    const existing = await pg.query(
      'SELECT id FROM ralph_sessions WHERE session_id = $1',
      [input.session_id]
    )

    if (existing.rows.length === 0) {
      // First prompt for this session - capture it
      await pg.query(
        `INSERT INTO ralph_sessions (session_id, initial_prompt) VALUES ($1, $2)`,
        [input.session_id, input.prompt]
      )
    }

    await pg.close()
  } catch (error) {
    // DB not initialized or other error - silently continue
    // This hook should never block the user
  }

  // Exit 0 to allow the prompt through
  process.exit(0)
}

main().catch(() => process.exit(0))
