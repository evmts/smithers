# CLI: smithers db executions command not implemented

## Status
Closed

## Description
Docs reference `smithers db executions` and `smithers db execution <id>` but these don't exist

## Resolution
Commands were already implemented but CLI bundling had a bug preventing schema.sql from being found.

Fixed by updating schema path resolution in `src/db/index.ts` to handle:
1. Standard case: schema.sql in same directory as index.js
2. Bundled CLI case: schema.sql in dist/src/db/ when CLI is at dist/bin/
3. NPM package case: schema.sql relative to package root

Existing implementation files:
- `src/commands/db/executions-view.ts` - Lists recent executions
- `src/commands/db/execution-view.ts` - Shows details for specific execution
- `src/commands/db/index.ts` - Wires up subcommands

## Files
- docs/guides/debugging.mdx
- src/commands/db/executions-view.ts
- src/commands/db/execution-view.ts
- src/commands/db/index.ts
- src/db/index.ts (fixed schema path resolution)

## Tasks
- [x] Implement CLI commands or update docs
