/**
 * Ownership declarations for `PACKAGE.ts` and `WORKSPACE.ts`, and the two
 * generated-file rules that project them.
 *
 * A package names who owns it the way it names its targets: inert data on
 * the `S.Package` call. `owners` lists logins and `team:<name>` references,
 * `perFile` adds owners for globs inside the package, `noparent` stops the
 * walk up to the parent package, `agents` is the policy an agent-authored
 * change lands under, and `upstream` lets a package claim changes to the
 * packages it depends on. The workspace declares default owners and the
 * team roster team references resolve against.
 *
 * Every constructor validates and freezes; nothing here reads a file or a
 * graph. Resolution against the package tree and the dependency graph lives
 * in `@smthrs/build-cli`, which also renders `.github/CODEOWNERS` and the
 * per-directory `OWNERS` tree from these declarations.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Target from "./Target.ts";
/**
 * Maximum owners one declaration may list.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumOwners = 64;
/**
 * Maximum per-file and policy patterns one declaration may list.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumPatterns = 128;
/**
 * The login grammar: GitHub-shaped, bounded, no leading punctuation.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const loginShape: RegExp;
/**
 * Schema for one owner: a login or a `team:<name>` reference.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Owner: Schema.NonEmptyString;
/**
 * One owner: a login or a `team:<name>` reference.
 *
 * @category models
 * @since 0.1.0
 */
export type Owner = typeof Owner.Type;
/**
 * Schema for the policy an agent-authored change lands under.
 *
 * `auto-land` lets an agent change land on an agent LGTM alone,
 * `human-approve` (the default) requires a human owner's approval, and
 * `deny` refuses agent-authored changes to the matched paths outright.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const AgentPolicy: Schema.Literals<readonly ["auto-land", "human-approve", "deny"]>;
/**
 * The policy an agent-authored change lands under.
 *
 * @category models
 * @since 0.1.0
 */
export type AgentPolicy = typeof AgentPolicy.Type;
/**
 * Schema for one per-glob policy override, matched against paths relative
 * to the declaring package, first match wins.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PolicyOverride: Schema.Struct<{
    readonly pattern: Schema.NonEmptyString;
    readonly policy: Schema.Literals<readonly ["auto-land", "human-approve", "deny"]>;
}>;
/**
 * Schema for the normalized agent policy: a default plus ordered overrides.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Agents: Schema.Struct<{
    readonly default: Schema.Literals<readonly ["auto-land", "human-approve", "deny"]>;
    readonly overrides: Schema.$Array<Schema.Struct<{
        readonly pattern: Schema.NonEmptyString;
        readonly policy: Schema.Literals<readonly ["auto-land", "human-approve", "deny"]>;
    }>>;
}>;
/**
 * The normalized agent policy.
 *
 * @category models
 * @since 0.1.0
 */
export type Agents = typeof Agents.Type;
/**
 * Schema for one per-file rule: owners added for paths matching a glob
 * relative to the declaring package.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PerFile: Schema.Struct<{
    readonly pattern: Schema.NonEmptyString;
    readonly owners: Schema.$Array<Schema.NonEmptyString>;
}>;
/**
 * Schema for the upstream claim: how a change to a package this package
 * depends on resolves to this package's owners.
 *
 * `review` adds them as suggested reviewers; `approve` adds them as required
 * approvers. `packages` bounds the claim to the named package labels or
 * subtree patterns; absent, it covers the whole transitive dependency set.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Upstream: Schema.Struct<{
    readonly mode: Schema.Literals<readonly ["review", "approve"]>;
    readonly packages: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
}>;
/**
 * The normalized upstream claim.
 *
 * @category models
 * @since 0.1.0
 */
export type Upstream = typeof Upstream.Type;
/**
 * Schema for the validated ownership declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Declaration: Schema.TaggedStruct<"Owners", {
    readonly owners: Schema.$Array<Schema.NonEmptyString>;
    readonly perFile: Schema.$Array<Schema.Struct<{
        readonly pattern: Schema.NonEmptyString;
        readonly owners: Schema.$Array<Schema.NonEmptyString>;
    }>>;
    readonly noparent: Schema.Boolean;
    readonly agents: Schema.optional<Schema.Struct<{
        readonly default: Schema.Literals<readonly ["auto-land", "human-approve", "deny"]>;
        readonly overrides: Schema.$Array<Schema.Struct<{
            readonly pattern: Schema.NonEmptyString;
            readonly policy: Schema.Literals<readonly ["auto-land", "human-approve", "deny"]>;
        }>>;
    }>>;
    readonly upstream: Schema.optional<Schema.Struct<{
        readonly mode: Schema.Literals<readonly ["review", "approve"]>;
        readonly packages: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    }>>;
}>;
/**
 * The validated ownership declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type Declaration = typeof Declaration.Type;
/**
 * Checks whether a value is a validated ownership declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isDeclaration: (value: unknown) => value is Declaration;
/**
 * The upstream forms {@link declare} accepts.
 *
 * @category models
 * @since 0.1.0
 */
export type UpstreamOption = "none" | "review" | "approve" | {
    readonly mode: "review" | "approve";
    readonly packages?: ReadonlyArray<string> | undefined;
};
/**
 * The agent policy forms {@link declare} accepts: one policy for the whole
 * package, or a default with per-glob overrides keyed by policy.
 *
 * @category models
 * @since 0.1.0
 */
export type AgentsOption = AgentPolicy | {
    readonly default?: AgentPolicy | undefined;
    readonly "auto-land"?: ReadonlyArray<string> | undefined;
    readonly "human-approve"?: ReadonlyArray<string> | undefined;
    readonly deny?: ReadonlyArray<string> | undefined;
};
/**
 * Options accepted by {@link declare}.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
    readonly owners?: ReadonlyArray<string> | undefined;
    readonly perFile?: Readonly<Record<string, string | ReadonlyArray<string>>> | undefined;
    readonly noparent?: boolean | undefined;
    readonly agents?: AgentsOption | undefined;
    readonly upstream?: UpstreamOption | undefined;
}
/**
 * Validates and normalizes an ownership declaration.
 *
 * `S.Package({ owners: { ... } })` and `S.Workspace(name, { owners: { ... } })`
 * call this on the plain object they receive; a caller may also call it
 * directly and pass the result.
 *
 * Throws a `TypeError` or `Error` naming the offending field when a value is
 * malformed. A `perFile` or `agents` glob must be package-relative and must
 * not contain whitespace, control characters, or a leading `#` or `!`,
 * because each glob is written verbatim into a CODEOWNERS line.
 *
 * @example
 * ```ts
 * import { Smithers as S } from "@smthrs/targets"
 *
 * export const Package = S.Package({
 *   owners: {
 *     owners: ["will", "team:platform"],
 *     perFile: { "*.sql": ["team:data"] },
 *     agents: { default: "human-approve", "auto-land": ["*.md", "docs/**"], deny: ["migrations/**"] },
 *     upstream: "review"
 *   },
 *   targets: { ... }
 * })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const declare: (options: Options | Declaration) => Declaration;
/**
 * Schema for the workspace team roster: team name to member logins.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const TeamsDeclaration: Schema.TaggedStruct<"Teams", {
    readonly teams: Schema.$Record<Schema.String, Schema.$Array<Schema.NonEmptyString>>;
}>;
/**
 * The validated team roster.
 *
 * @category models
 * @since 0.1.0
 */
export type TeamsDeclaration = typeof TeamsDeclaration.Type;
/**
 * Checks whether a value is a validated team roster.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isTeamsDeclaration: (value: unknown) => value is TeamsDeclaration;
/**
 * Validates a team roster: team names are login-shaped, members are logins,
 * and every list is deduplicated and sorted.
 *
 * @example
 * ```ts
 * export const Workspace = S.Workspace("force", {
 *   teams: S.Teams({ platform: ["will", "erik"], data: ["chungyi"] }),
 *   owners: { owners: ["team:platform"] },
 *   ...
 * })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Teams: (roster: Readonly<Record<string, ReadonlyArray<string>>> | TeamsDeclaration) => TeamsDeclaration;
/**
 * The team names one declaration references, without the `team:` prefix.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const teamReferences: (declaration: Declaration) => ReadonlyArray<string>;
/**
 * Attrs for {@link Codeowners}.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const CodeownersAttrs: Schema.Struct<{
    /** GitHub organization teams render under, as `@<org>/<team>`. */
    readonly org: Schema.NonEmptyString;
    /** Workspace-relative output path; defaults to `.github/CODEOWNERS`. */
    readonly path: Schema.optional<Schema.NonEmptyString>;
}>;
/**
 * Generates `.github/CODEOWNERS` from every package's `owners` declaration.
 *
 * GitHub semantics: one line per package and per-file rule, ordered so the
 * most specific rule comes last and wins. Required approvers only: an
 * `upstream: "approve"` claim adds the claiming package's owners to the
 * claimed package's line, an `upstream: "review"` claim does not appear
 * because CODEOWNERS has no suggested-reviewer form. Check by default under
 * `lint`; `build --write` applies.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const Codeowners: Target.Definition<"Owners.Codeowners", Schema.Struct<{
    /** GitHub organization teams render under, as `@<org>/<team>`. */
    readonly org: Schema.NonEmptyString;
    /** Workspace-relative output path; defaults to `.github/CODEOWNERS`. */
    readonly path: Schema.optional<Schema.NonEmptyString>;
}>, Schema.Schema<never>, Schema.Schema<Target.NotImplemented>, import("@smthrs/flow/Action").Requirement<"smithers-build/not-implemented">>;
/**
 * Attrs for {@link Tree}.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const TreeAttrs: Schema.Struct<{
    /** File name written in each owning package directory; defaults to `OWNERS`. */
    readonly file: Schema.optional<Schema.NonEmptyString>;
}>;
/**
 * Generates the per-directory `OWNERS` tree from every package's `owners`
 * declaration, in the Google format the Smithers landing gate reads:
 * `set noparent`, one owner per line, `per-file <glob> = <owners>`,
 * `agents: <policy> [globs]`, and `reviewers: <owners>` for upstream review
 * claims. Check by default under `lint`; `build --write` applies.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const Tree: Target.Definition<"Owners.Tree", Schema.Struct<{
    /** File name written in each owning package directory; defaults to `OWNERS`. */
    readonly file: Schema.optional<Schema.NonEmptyString>;
}>, Schema.Schema<never>, Schema.Schema<Target.NotImplemented>, import("@smthrs/flow/Action").Requirement<"smithers-build/not-implemented">>;
