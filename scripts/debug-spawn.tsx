#!/usr/bin/env bun

// Test Bun.spawn with Claude CLI arguments

const prompt = `Read the full spec at issues/smithers-py.md focusing on M0 requirements:
- Plan IR (Pydantic models for nodes)
- JSX runtime (jsx() function)
- XML serializer

Output a structured implementation plan.`;

const args = [
  "--print",
  "--model", "claude-haiku-4-5-20251001",
  "--max-turns", "1",
  "--allowedTools", "Read",
  prompt
];

console.log("=== Command ===");
console.log("claude", args.join(" ").slice(0, 200) + "...");

console.log("\n=== Args array ===");
console.log(JSON.stringify(args, null, 2));

console.log("\n=== Spawning ===");
const proc = Bun.spawn(["claude", ...args], {
  stdout: "pipe",
  stderr: "pipe",
  cwd: process.cwd(),
});

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
const exitCode = await proc.exited;

console.log("\n=== Exit code ===", exitCode);
console.log("\n=== Stdout ===");
console.log(stdout.slice(0, 500));
console.log("\n=== Stderr ===");
console.log(stderr);
