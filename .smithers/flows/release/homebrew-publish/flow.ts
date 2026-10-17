/**
 * `release/homebrew-publish`: publish qualified Homebrew assets.
 *
 * `assets` uploads the formula, bottle and signed checksums to the GitHub
 * Release; `tap` opens the tap's formula bump. Both refuse without the
 * authenticated C-REL-02 qualification. The GitHub token comes from the
 * environment, never the payload.
 *
 * ```sh
 * smthrs flow start release/homebrew-publish --data '{"command":"assets","directory":"assets","tag":"v1.0.0"}' --wait
 * ```
 *
 * @since 1.0.0
 */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { ModuleFailed, runModule } from "../../automation/run-module.ts"

/**
 * What to publish, from which asset directory, for which tag.
 *
 * @since 1.0.0
 * @category models
 */
export const Request = Schema.Struct({
  command: Schema.Literals(["assets", "tap"]),
  directory: Schema.NonEmptyString,
  tag: Schema.NonEmptyString
})

const implementationVersion = "release/homebrew-publish/v1"

/**
 * Runs `homebrew-publish.mjs`.
 *
 * @since 1.0.0
 * @category actions
 */
export const HomebrewPublish = Action.make("release/homebrew-publish/run", {
  implementationVersion,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  nondeterministic: true
})

/**
 * The argument array `homebrew-publish.mjs` reads for a request.
 *
 * @since 1.0.0
 * @category utils
 */
export const argv = (
  request: typeof Request.Type
): ReadonlyArray<string> => [request.command, request.directory, request.tag]

/**
 * @since 1.0.0
 * @category layers
 */
export const layer = HomebrewPublish.toLayer(
  (request) => runModule(new URL("../homebrew-publish.mjs", import.meta.url), argv(request)),
  { implementationVersion }
)

export default Flow.make("release/homebrew-publish", {
  description: "Publish qualified Homebrew release assets or open the tap formula bump.",
  capabilities: [
    "fs:read:**",
    "proc:spawn:node *",
    "proc:spawn:git *",
    "proc:spawn:cosign *",
    "net:get:api.github.com/**",
    "net:post:api.github.com/**",
    "net:put:api.github.com/**",
    "net:post:uploads.github.com/**",
    "net:get:github.com/**",
    "net:get:token.actions.githubusercontent.com/**"
  ],
  effects: { reads: ["**"], writes: [], mode: "expected", onConflict: "serialize", tier: "irreversible" },
  modelInvocable: false,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  body: Node.capture({ implementationVersion }, (request) => HomebrewPublish.call(request))
})
