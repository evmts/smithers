/**
 * The Jev rules macro: judgment rules a package declares in its own PACKAGE.ts.
 *
 * A rule such as "no hand-rolled retries" has no single syntax, so a judge
 * holds it instead of `ImportRules`. A package lists its rules, each with an
 * id from its rules catalog, the files it covers, and a yes-or-no question;
 * the macro declares one `JevLint` target that asks Jev about one file at a
 * time. See `JevLint` in `@smthrs/targets` for how a review runs.
 *
 * @since 0.1.0
 */

import { Smithers } from "@smthrs/targets"

/**
 * One judgment rule.
 *
 * @category models
 * @since 0.1.0
 */
export interface JevRule {
  /** The rule's id in the package's rules catalog, such as `durable.no-hand-rolled-durability`. */
  readonly id: string
  /**
   * Globs of the files the rule covers. They are package-relative unless they
   * carry the `//` workspace-root prefix. `//:targetIndex` refuses a glob
   * whose files all belong to another package.
   */
  readonly files: ReadonlyArray<string>
  /** A yes-or-no question about one file; "yes" means the file breaks the rule. */
  readonly lookFor: string
  /** What "yes" means. */
  readonly violation: string
  /** What "no" means. */
  readonly compliant: string
  /** @default "error" */
  readonly severity?: "info" | "warning" | "error" | undefined
}

/**
 * Options accepted by {@link JevRules}.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /** The workspace-relative directory of the declaring package, or `"."` for the workspace root. */
  readonly cwd: string
  /** The rules, with distinct ids. */
  readonly rules: ReadonlyArray<JevRule>
  /** The probability at or above which a "yes" is a finding. @default JevLint's default, 0.8 */
  readonly threshold?: number | undefined
  /** @default "error" */
  readonly failOn?: "info" | "warning" | "error" | undefined
  readonly summary?: string | undefined
  /** @default false */
  readonly featured?: boolean | undefined
}

/**
 * The target {@link JevRules} returns.
 *
 * @category models
 * @since 0.1.0
 */
export type JevRulesTarget = ReturnType<typeof Smithers.JevLint>

/** Re-roots a package-relative glob at the workspace root, where the review expands it. */
const anchor = (cwd: string, pattern: string) =>
  Smithers.Input.Glob.make({ pattern: `//${Smithers.Input.resolvePath(cwd, pattern)}`, exclude: [] })

/**
 * Declares one `JevLint` target that fails when Jev judges a covered file to
 * break one of `rules`.
 *
 * Each rule's `files` resolve against `cwd`, the way every review macro
 * anchors its globs, so the review matches workspace-relative paths. The
 * declaration is checked when it is made: a rule id that is not dotted
 * lowercase, a repeated id, a blank question, or a `files` glob that escapes
 * the workspace throws. The target is `lint`-kind and manual, so `//...` never
 * plans it and naming its label does; it needs `AI_GATEWAY_API_KEY` when it
 * runs, and model output is never cached.
 *
 * @example
 * ```ts
 * import { JevRules } from "@smthrs/repo-targets"
 *
 * const jevRules = JevRules({
 *   cwd: "apps/mvp",
 *   rules: [{
 *     id: "durable.no-hand-rolled-durability",
 *     files: ["worker/!(*.test).ts"],
 *     lookFor: "Does this file implement its own retry loop, sweep or background job?",
 *     violation: "The file hand-rolls durability the flow engine owns.",
 *     compliant: "The file has no retry loop, sweep or background job of its own."
 *   }]
 * })
 * ```
 *
 * @category macros
 * @since 0.1.0
 */
export const JevRules = (options: Options): JevRulesTarget => {
  const cwd = options.cwd
  if (cwd === "" || cwd.startsWith("/") || cwd.split("/").includes("..")) {
    throw new TypeError(`JevRules cwd "${cwd}" must be a workspace-relative package directory`)
  }
  return Smithers.JevLint({
    rules: options.rules.map((rule) => ({
      id: rule.id,
      files: rule.files.map((pattern) => anchor(cwd, pattern)),
      lookFor: rule.lookFor,
      violation: rule.violation,
      compliant: rule.compliant,
      ...(rule.severity === undefined ? {} : { severity: rule.severity })
    })),
    ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
    ...(options.failOn === undefined ? {} : { failOn: options.failOn }),
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    featured: options.featured ?? false
  })
}
