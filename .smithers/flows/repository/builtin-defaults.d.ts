/**
 * The overridable flows the install ships as packaged defaults
 * (`packages/backend/internal/services/builtin_flows.json`) and the files each
 * one carries: its entry and the source modules beside it.
 *
 * `.smithers/flows/coding/build.mjs` compiles these bytes into the deployed host and
 * `provisionBuiltins` writes them under the host's policy root, so discovery
 * measures the same closure, and the same execution digest, on every host.
 */
export declare const builtinDefaults: readonly ["todo", "learning", "review"];
/** Whether a POSIX path under a default's own directory ships with that default. */
export declare const shipsWithDefault: (relative: string) => boolean;
