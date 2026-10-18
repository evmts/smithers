import { SqlError } from "effect/sql"

/**
 * A failure's code for a log line (docs/observability.md): `sql:<reason>` for a SQL failure, otherwise the failure's
 * `_tag`, otherwise `unknown`. Never its message, which can quote what someone wrote or a provider's text.
 */
export const codeOf = (error: unknown): string =>
  SqlError.isSqlError(error)
    ? `sql:${error.reason._tag}`
    : typeof error === "object" && error !== null && "_tag" in error
    ? String(error._tag)
    : "unknown"
