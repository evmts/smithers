#!/usr/bin/env bun

import { PGlite } from "@electric-sql/pglite";

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  stop_hook_active: boolean;
}

interface HookOutput {
  decision: "block" | "allow";
  reason?: string;
}

async function main() {
  const input: HookInput = await Bun.stdin.json();

  const ralphFlagPath = `${input.cwd}/.smithers/ralph-enabled`;
  const dbPath = `${input.cwd}/.smithers/db`;

  const ralphEnabled = await Bun.file(ralphFlagPath).exists();
  if (!ralphEnabled) {
    process.exit(0);
  }

  try {
    const pg = new PGlite(dbPath);

    const result = await pg.query<{
      initial_prompt: string;
      ralph_count: number;
    }>(
      "SELECT initial_prompt, ralph_count FROM ralph_sessions WHERE session_id = $1",
      [input.session_id],
    );

    if (result.rows.length === 0) {
      await pg.close();
      process.exit(0);
    }

    const { initial_prompt, ralph_count } = result.rows[0];

    await pg.query(
      `UPDATE ralph_sessions
       SET ralph_count = ralph_count + 1, last_ralph_at = NOW()
       WHERE session_id = $1`,
      [input.session_id],
    );

    await pg.close();

    await Bun.file(ralphFlagPath).delete?.();

    const output: HookOutput = {
      decision: "block",
      reason: `RALPH ACTIVATED (iteration ${ralph_count + 1}): Context cleared. Continue with the original task:\n\n${initial_prompt}`,
    };

    console.log(JSON.stringify(output));
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main().catch(() => process.exit(0));
