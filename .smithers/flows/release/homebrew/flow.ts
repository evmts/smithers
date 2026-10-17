/**
 * `release/homebrew`: prepare the Homebrew formula and bottle assets, or
 * require the authenticated receipts that qualify them.
 *
 * `prepare` writes the formula and checksums for a signed installer set, with
 * `root` as the download root; `normalize-bottle` renames a built bottle to
 * Homebrew's download filename and checks its digest; `qualify` requires the
 * fresh-user journey and bottle receipts on `main` for the checked-out commit.
 *
 * ```sh
 * smthrs flow start release/homebrew --data '{"command":"prepare","directory":"assets","tag":"v1.0.0"}' --wait
 * smthrs flow start release/homebrew --data '{"command":"normalize-bottle","directory":"assets"}' --wait
 * ```
 *
 * @since 1.0.0
 */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { ModuleFailed, runModule } from "../../automation/run-module.ts"

/**
 * The Homebrew command, its asset directory, tag and download root.
 *
 * @since 1.0.0
 * @category models
 */
export const Request = Schema.Struct({
  command: Schema.Literals(["prepare", "normalize-bottle", "qualify"]),
  directory: Schema.NonEmptyString,
  tag: Schema.optionalKey(Schema.NonEmptyString),
  root: Schema.optionalKey(Schema.NonEmptyString)
}).check(
  Schema.makeFilter((request) =>
    request.command !== "normalize-bottle" && request.tag === undefined
      ? `${request.command} needs the release tag`
      : request.root !== undefined && request.command !== "prepare"
      ? "only prepare takes a download root"
      : undefined
  )
)

const implementationVersion = "release/homebrew/v1"

/**
 * Runs `homebrew-release.mjs`.
 *
 * @since 1.0.0
 * @category actions
 */
export const Homebrew = Action.make("release/homebrew/run", {
  implementationVersion,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  nondeterministic: true
})

/**
 * The argument array `homebrew-release.mjs` reads for a request.
 *
 * @since 1.0.0
 * @category utils
 */
export const argv = (request: typeof Request.Type): ReadonlyArray<string> => [
  request.command,
  request.directory,
  ...(request.tag === undefined ? [] : [request.tag]),
  ...(request.root === undefined ? [] : [request.root])
]

/**
 * @since 1.0.0
 * @category layers
 */
export const layer = Homebrew.toLayer(
  (request) => runModule(new URL("../homebrew-release.mjs", import.meta.url), argv(request)),
  { implementationVersion }
)

export default Flow.make("release/homebrew", {
  description:
    "Prepare the Homebrew formula and bottle assets of a signed release, or require the receipts that qualify them.",
  capabilities: [
    "fs:read:**",
    "fs:write:**",
    "proc:spawn:node *",
    "proc:spawn:git *",
    "net:get:api.github.com/**",
    "net:get:github.com/**",
    "net:get:token.actions.githubusercontent.com/**"
  ],
  effects: { reads: ["**"], writes: ["**"], mode: "expected", onConflict: "serialize", tier: "irreversible" },
  modelInvocable: false,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  body: Node.capture({ implementationVersion }, (request) => Homebrew.call(request))
})
