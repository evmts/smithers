/** Explicit external requirements for integration cases; never infer availability from a failed assertion. */
import type { TestContext } from "vitest"

export const postgres = (context: TestContext): string => {
  const url = process.env.SMITHERS_HISTORY_TEST_PG_URL ?? process.env.SMITHERS_TEST_DATABASE_URL
  if (url === undefined || url === "") {
    return context.skip(
      "needs PostgreSQL: set SMITHERS_HISTORY_TEST_PG_URL or SMITHERS_TEST_DATABASE_URL to a reachable test server"
    )
  }
  return url
}

export const postgresConfigured =
  (process.env.SMITHERS_HISTORY_TEST_PG_URL ?? process.env.SMITHERS_TEST_DATABASE_URL ?? "") !== ""
