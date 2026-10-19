import { Effect, Path, Schema } from "effect";
import { type ImmutableSourceOptions } from "../coding/immutable-source.ts";
import type { Check } from "./schema.ts";
export declare const ContextRead: Schema.Struct<{
    readonly path: Schema.String;
    readonly from: Schema.String;
    readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
    readonly required: Schema.Boolean;
    readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
    readonly digest: Schema.optionalKey<Schema.String>;
}>;
export declare const CheckContext: Schema.Struct<{
    readonly checkId: Schema.String;
    readonly source: Schema.NonEmptyString;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly digest: Schema.String;
        readonly text: Schema.String;
        readonly truncated: Schema.Boolean;
    }>>;
    readonly reads: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly from: Schema.String;
        readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
        readonly required: Schema.Boolean;
        readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
        readonly digest: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export type CheckContext = typeof CheckContext.Type;
/** A job's own retained configuration. `writeCandidate` commits it into the
 * repository, and no check may read it back as reviewable source. */
export declare const privatePath: (path: string) => boolean;
/** Bare prose and package names are not file requirements. Slash paths and
 * explicitly quoted filenames in the reviewed rule are repository inputs. */
export declare const rulePaths: (rule: string) => Array<string>;
/** Literal module edges only. Dynamic expressions cannot establish a known
 * local dependency; external package imports are recorded, never fetched.
 * A static specifier whose escapes are not valid is returned as written, so it
 * resolves to a required gap instead of silently becoming no import. */
export declare const sourceImports: (name: string, text: string) => Array<string>;
export declare const contextFailure: (context: CheckContext, source: string, checkId: string, paths?: ReadonlyArray<string>) => string | undefined;
export declare const captureCheckContext: (options: ImmutableSourceOptions, root: string, input: {
    readonly source: string;
    readonly check: typeof Check.Type;
    readonly paths: ReadonlyArray<string>;
    readonly deadlineAt: number;
    /** Host-selected direct rule paths for this source side. Imports never cross sides. */
    readonly ruleInputs?: ReadonlyArray<string>;
    readonly conventionPaths?: ReadonlyArray<string>;
    /** Changed paths this check may not read. They are recorded as refused
     * evidence so the checker sees what the change touched and was withheld. */
    readonly refusedPaths?: ReadonlyArray<string>;
}) => Effect.Effect<{
    checkId: string;
    source: string;
    files: {
        readonly path: string;
        readonly digest: string;
        readonly text: string;
        readonly truncated: boolean;
    }[];
    reads: {
        readonly path: string;
        readonly from: string;
        readonly reason: "convention" | "import" | "rule" | "source";
        readonly required: boolean;
        readonly status: "external" | "limit" | "missing" | "oversized" | "read" | "refused" | "unreadable" | "unresolved";
        readonly digest?: string;
    }[];
}, never, Path.Path>;
