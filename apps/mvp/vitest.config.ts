import { defineConfig } from "vitest/config"

// Unit tests in Node: the browser's framework-free state machine (src/), and ChatApi's handlers (worker/) against
// the compose Postgres and Electric.
export default defineConfig({
  test: { include: ["src/**/*.test.ts", "worker/**/*.test.ts"], environment: "node" },
})
