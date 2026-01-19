#!/usr/bin/env bun

import { Command } from "commander";
import { init } from "../src/commands/init.ts";
import { run } from "../src/commands/run.ts";
import { monitor } from "../src/commands/monitor.ts";
import { dbCommand } from "../src/commands/db.ts";
import { launchTUI } from "../src/tui/index.tsx";
import { DEFAULT_DB_DIR, DEFAULT_MAIN_FILE, resolveDbPaths } from "../src/commands/cli-utils.ts";

const program = new Command();

program
  .name("smithers")
  .description(
    "CLI tool for multi-agent AI orchestration with Smithers framework",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Create a new Smithers orchestration in .smithers/")
  .option(
    "-d, --dir <directory>",
    "Directory to create .smithers in",
    process.cwd(),
  )
  .action(init);

program
  .command("run [file]")
  .description("Run a Smithers orchestration file (default: .smithers/main.tsx)")
  .action((file?: string) => run(file));

program
  .command("monitor [file]")
  .description("Run with LLM-friendly monitoring (recommended)")
  .option(
    "-f, --file <file>",
    "Orchestration file to monitor",
    DEFAULT_MAIN_FILE,
  )
  .option("--no-summary", "Disable Haiku summarization")
  .action(monitor);

program
  .command("db [subcommand]")
  .description("Inspect and manage the SQLite database")
  .option("--path <path>", "Database path", DEFAULT_DB_DIR)
  .action(dbCommand);

program
  .command("tui")
  .description("Launch observability TUI dashboard")
  .option("-p, --path <path>", "Database path", ".smithers/data")
  .action(async (options: { path: string }) => {
    try {
      await launchTUI({ dbPath: options.path });
    } catch (error) {
      console.error('❌ Failed to launch TUI:', error instanceof Error ? error.message : error);
      if (!process.stdout.isTTY) {
        console.error('   TUI requires an interactive terminal');
      }
      process.exit(1);
    }
  });

const VALID_HOOK_TYPES = ['pre-commit', 'post-commit', 'pre-push', 'post-merge'] as const

program
  .command("hook-trigger <type> <data>")
  .description("Trigger a hook event (used by git hooks). Data must be valid JSON.")
  .option("--path <path>", "Database path", DEFAULT_DB_DIR)
  .action(async (type: string, data: string, options: { path: string }) => {
    if (!VALID_HOOK_TYPES.includes(type as typeof VALID_HOOK_TYPES[number])) {
      console.error(`❌ Invalid hook type: ${type}`)
      console.error(`   Valid types: ${VALID_HOOK_TYPES.join(', ')}`)
      process.exit(1)
    }

    let parsedData: unknown
    try {
      parsedData = JSON.parse(data)
    } catch {
      console.error(`❌ Invalid JSON data: ${data}`)
      console.error('   Data must be valid JSON')
      process.exit(1)
    }

    try {
      const { createSmithersDB } = await import(
        "../src/db/index.ts"
      );

      const { dbFile } = resolveDbPaths(options.path);
      const db = createSmithersDB({ path: dbFile });

      db.state.set(
        "last_hook_trigger",
        {
          type,
          data: parsedData,
          timestamp: Date.now(),
        },
        "hook-trigger",
      );

      db.close();

      console.log(`[Hook] Triggered: ${type}`);
    } catch (error) {
      console.error("[Hook] Error:", error);
      process.exit(1);
    }
  });

program.parse(process.argv);
