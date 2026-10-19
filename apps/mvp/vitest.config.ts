import { defineConfig } from "vitest/config"

// Unit tests of the framework-free state machine, in Node with LiveStore's in-memory adapter.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
})
