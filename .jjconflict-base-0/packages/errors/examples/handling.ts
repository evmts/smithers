import { getSmithersErrorDefinition, hasSmithersErrorShape, SmithersError } from "@smthrs/errors"
import { Effect } from "effect"

/**
 * Constructs a failure containing safe context and a cause without credentials.
 *
 * @returns The tagged failure, ready to raise or inspect.
 * @since 1.0.0
 */
export const makeFailure = (): SmithersError<"SmithersError"> =>
  new SmithersError<"SmithersError">(
    "INTEGRATION_ERROR",
    "Provider unavailable",
    { reason: "transport", retryable: true },
    { cause: new Error("Connection closed") }
  )

/**
 * Looks up recovery guidance for a structurally recognized failure.
 *
 * @param failure - A caught value, possibly from another package copy.
 * @returns The catalog description, or undefined for an unrecognized failure.
 * @since 1.0.0
 */
export const describeFailure = (failure: unknown): string | undefined =>
  hasSmithersErrorShape(failure) ? getSmithersErrorDefinition(failure.code)?.when : undefined

/**
 * Recovers an Effect failure by its tag and reads its machine-readable code.
 *
 * @returns A successful Effect containing the classified code.
 * @since 1.0.0
 */
export const recoverFailure = (): Effect.Effect<string> =>
  Effect.fail(makeFailure()).pipe(
    Effect.catchTag("SmithersError", (failure) => Effect.succeed(`Recovered ${failure.code}`))
  )
