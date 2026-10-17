/**
 * `land/renumber-migration`: give an unlanded product migration the next number on `origin/main`.
 *
 * Runs `renumber-migration.mjs` on one `packages/backend/db/product/migrations`
 * file. It renames the file, rewrites its registry row, converts the ticket's
 * `planned:` table reservations in `ownership.csv`, regenerates sqlc with the
 * pinned v1.30.0 and runs the DB-free migration gate, restoring every byte
 * when a step fails. It refuses root, a home holding the issue-claim credential
 * store, a missing `origin/main`, and a migration already on it. Fetch first.
 *
 * ```sh
 * smthrs flow start land/renumber-migration --data '{"file":"packages/backend/db/product/migrations/0009_reserved.sql","ticket":"T-PRC-02"}' --wait
 * ```
 *
 * Directly, as the repair path: `SMITHERS_MIGRATION_TICKET=<ticket> node flows/land/renumber-migration.mjs <file>`.
 *
 * @since 1.0.0
 */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { ModuleFailed, runModule } from "../../automation/run-module.ts"

/**
 * The migration file, and the ticket whose reservations it converts
 * (`SMITHERS_MIGRATION_TICKET`; inherited from the environment when omitted).
 *
 * @since 1.0.0
 * @category models
 */
export const Request = Schema.Struct({
  file: Schema.NonEmptyString,
  ticket: Schema.optionalKey(Schema.NonEmptyString)
})

const implementationVersion = "land/renumber-migration/v1"

/**
 * Runs `renumber-migration.mjs`.
 *
 * @since 1.0.0
 * @category actions
 */
export const Renumber = Action.make("land/renumber-migration/run", {
  implementationVersion,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  nondeterministic: true
})

/**
 * The argument array `renumber-migration.mjs` reads for a request.
 *
 * @since 1.0.0
 * @category utils
 */
export const argv = (request: typeof Request.Type): ReadonlyArray<string> => [request.file]

/**
 * The environment the module reads for a request.
 *
 * @since 1.0.0
 * @category utils
 */
export const env = (request: typeof Request.Type): Readonly<Record<string, string>> =>
  request.ticket === undefined ? {} : { SMITHERS_MIGRATION_TICKET: request.ticket }

/**
 * @since 1.0.0
 * @category layers
 */
export const layer = Renumber.toLayer(
  (request) => runModule(new URL("../renumber-migration.mjs", import.meta.url), argv(request), { env: env(request) }),
  { implementationVersion }
)

export default Flow.make("land/renumber-migration", {
  description: "Renumber an unlanded product migration after origin/main, regenerate sqlc and run the migration gate.",
  capabilities: [
    "fs:read:**",
    "fs:write:packages/backend/db/**",
    "fs:write:packages/backend/internal/db/**",
    "proc:spawn:node *",
    "proc:spawn:git *",
    "proc:spawn:go *",
    "proc:spawn:sqlc *",
    "proc:spawn:/*/.backend-sqlc/sqlc *"
  ],
  effects: {
    reads: ["**"],
    writes: ["packages/backend/db/**", "packages/backend/internal/db/**"],
    mode: "expected",
    onConflict: "serialize",
    tier: "irreversible"
  },
  modelInvocable: false,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  body: Node.capture({ implementationVersion }, (request) => Renumber.call(request))
})
