import { defineConfig } from "@microsoft/tui-test";

export default defineConfig({
  retries: 2,
  timeout: 60000,
  trace: false,
  testMatch: ['test/e2e/**/*.test.ts'],
  // Exclude large reference directories to avoid copy issues
});
