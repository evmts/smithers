#!/usr/bin/env bun

import { Command } from "commander/esm.mjs";
import path from "path";
import { DEFAULT_DB_DIR, DEFAULT_MAIN_FILE, resolveDbPaths } from "../src/commands/cli-utils.ts";
import pkg from "../package.json";

const program = new Command();

program
  .name("smithers")
  .description(
    "AI orchestration framework - launches OpenCode with Smithers tools",
  )
  .version(pkg.version)
  .argument("[file]", "Optional .tsx workflow file to run directly")
  .action(async (file?: string) => {
    // If file provided, run it directly
    if (file && file.endsWith('.tsx')) {
      const { run } = await import("../src/commands/run.ts");
      return run(file);
    }
    
    // Use URL-based resolution that works regardless of build location
    const pkgRoot = new URL("../..", import.meta.url).pathname
    const configDir = path.join(pkgRoot, "opencode")
    const configFile = path.join(configDir, "opencode.json")
    
    // Include permissions in OPENCODE_CONFIG_CONTENT for strict enforcement
    // Project config loads before inline config, so inline takes precedence
    const configContent = JSON.stringify({
      default_agent: "smithers",
      permission: {
        "*": "deny",
        "read": {
          "*": "allow",
          "*.env": "deny",
          "*.env.*": "deny",
          ".env": "deny",
          "*.env.example": "allow"
        },
        "smithers_discover": "allow",
        "smithers_create": "allow",
        "smithers_run": "allow",
        "smithers_resume": "allow",
        "smithers_status": "allow",
        "smithers_frames": "allow",
        "smithers_cancel": "allow",
        "smithers_glob": "allow",
        "smithers_grep": "allow",
        "task": {
          "*": "deny",
          "planner": "allow",
          "explorer": "allow",
          "librarian": "allow",
          "oracle": "allow",
          "monitor": "allow"
        },
        "edit": "deny",
        "write": "deny",
        "bash": "deny",
        "websearch": "deny",
        "webfetch": "deny",
        "codesearch": "deny",
        "glob": "deny",
        "grep": "deny",
        "list": "deny"
      }
    })

    const proc = Bun.spawn(["opencode", "--agent", "smithers"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENCODE_CONFIG_DIR: configDir,
        OPENCODE_CONFIG: configFile,
        OPENCODE_CONFIG_CONTENT: configContent
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    })

    const exitCode = await proc.exited
    process.exit(exitCode)
  });

program
  .command("init")
  .description("Create a new Smithers orchestration in .smithers/")
  .option(
    "-d, --dir <directory>",
    "Directory to create .smithers in",
    process.cwd(),
  )
  .action(async (options) => {
    const { init } = await import("../src/commands/init.ts");
    return init(options);
  });

program
  .command("demo")
  .description("Create an interactive demo file to learn Smithers")
  .action(async () => {
    const { demo } = await import("../src/commands/demo.ts");
    return demo();
  });

program
  .command("run [file]")
  .description("Run a Smithers orchestration file (default: .smithers/main.tsx)")
  .action(async (file?: string) => {
    const { run } = await import("../src/commands/run.ts");
    return run(file);
  });

program
  .command("monitor [file]")
  .description("Run with LLM-friendly monitoring (recommended)")
  .option("--no-summary", "Disable Haiku summarization")
  .action(async (file: string | undefined, options: { summary: boolean }) => {
    const { monitor } = await import("../src/commands/monitor.ts");
    return monitor(file ?? DEFAULT_MAIN_FILE, options);
  });

program
  .command("db [subcommand] [args...]")
  .description("Inspect and manage the SQLite database")
  .option("--path <path>", "Database path", DEFAULT_DB_DIR)
  .option("--execution-id <id>", "Filter by execution ID")
  .action(async (subcommand: string | undefined, args: string[], options: { path?: string; executionId?: string }) => {
    const { dbCommand } = await import("../src/commands/db.ts");
    return dbCommand(subcommand, options, args);
  });

program
  .command("tui")
  .description("Launch observability TUI dashboard")
  .option("-p, --path <path>", "Database path", ".smithers/data")
  .action(async (options: { path: string }) => {
    try {
      const { launchTUI } = await import("../src/tui/index.tsx");
      await launchTUI({ dbPath: options.path });
    } catch (error) {
      console.error('❌ Failed to launch TUI:', error instanceof Error ? error.message : error);
      if (!process.stdout.isTTY) {
        console.error('   TUI requires an interactive terminal');
      }
      process.exit(1);
    }
  });

program
  .command("upgrade")
  .description("Upgrade Smithers to the latest version")
  .action(async () => {
    const { upgradeCommand } = await import("../src/commands/upgrade.ts");
    process.exit(upgradeCommand());
  });

program
  .command("serve")
  .description("Start the MCP server")
  .option("-p, --port <port>", "Server port", "3847")
  .option("-h, --host <host>", "Server host", "127.0.0.1")
  .action(async (options: { port: string; host: string }) => {
    const pkgRoot = new URL("../..", import.meta.url).pathname;
    const configDir = path.join(pkgRoot, "opencode");
    
    const proc = Bun.spawn(["opencode", "mcp"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENCODE_CONFIG_DIR: configDir,
        OPENCODE_MCP_PORT: options.port,
        OPENCODE_MCP_HOST: options.host,
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    process.exit(exitCode);
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

const hookTriggerHelp = process.argv.includes('hook-trigger') &&
  (process.argv.includes('--help') || process.argv.includes('-h'))
if (hookTriggerHelp) {
  const hookCommand = program.commands.find((cmd) => cmd.name() === 'hook-trigger')
  if (hookCommand) {
    hookCommand.outputHelp()
    process.exit(0)
  }
}

program.parse(process.argv);
