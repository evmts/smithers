#!/usr/bin/env bun
/** @jsxImportSource smithers-orchestrator */

import { extractText } from "../src/utils/extract-text.js";

const SPEC_PATH = "issues/smithers-py.md";

// Simulate the Claude component children from build-smithers-py.tsx
const children = `Read the full spec at ${SPEC_PATH} focusing on M0 requirements:
- Plan IR (Pydantic models for nodes)
- JSX runtime (jsx() function)
- XML serializer
- Volatile + SQLite state with snapshot/write-queue/commit
- Simple tick loop with no runnable nodes

Also study the TypeScript implementation patterns in:
- src/reconciler/ (React reconciler patterns)
- src/db/ (SQLite schema and state management)
- src/components/ (component structure)

Output a structured implementation plan for M0.`;

console.log("=== Children string ===");
console.log(children);
console.log("\n=== Length ===");
console.log(children.length);

const extracted = extractText(children);
console.log("\n=== Extracted ===");
console.log(extracted);
console.log("\n=== Extracted length ===");
console.log(extracted.length);

// Test with Bun.spawn
console.log("\n=== Testing Bun.spawn with long prompt ===");
const testArgs = ["--version"];
const proc = Bun.spawn(["claude", ...testArgs], {
  stdout: "pipe",
  stderr: "pipe",
});
const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
console.log("Claude version:", stdout.trim() || stderr.trim());
