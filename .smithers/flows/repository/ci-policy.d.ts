import { Effect, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import { Check, Job } from "./schema.ts";
/** requiredCheckIds holds the raw configured ids the reviewed policy requires. */
export declare const CiPolicyRef: Schema.Struct<{
    readonly repositoryId: Schema.Int;
    readonly registrationId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly executionDigest: Schema.String;
    readonly requiredCheckIds: Schema.$Array<Schema.String>;
}>;
export type CiPolicyRef = typeof CiPolicyRef.Type;
/** One reviewed CI rule, still carrying the exact id stored in its registration. */
export declare const InheritedCheck: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly kind: Schema.Literals<readonly ["command", "ai"]>;
    readonly rule: Schema.String;
    readonly paths: Schema.$Array<Schema.String>;
    readonly policy: Schema.Literals<readonly ["report", "required"]>;
}>;
export type InheritedCheck = typeof Check.Type;
export declare const CiPolicy: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"none">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"pinned">;
    readonly ref: Schema.Struct<{
        readonly repositoryId: Schema.Int;
        readonly registrationId: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly executionDigest: Schema.String;
        readonly requiredCheckIds: Schema.$Array<Schema.String>;
    }>;
    readonly checks: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
    }>>;
}>]>;
export type CiPolicy = typeof CiPolicy.Type;
export declare const readCiPolicy: (repo: string, response: unknown, repositoryId?: number) => CiPolicy;
/** Bounded because Check.id holds 100 characters and a raw id may hold all 100.
 * The tuple is shared with the later authoritative proof verifier. */
export declare const inheritedCheckId: (ref: CiPolicyRef, rawId: string) => string;
/** Provenance is recomputed from the pinned policy, never parsed out of the id,
 * so a local identifier can never present itself as an inherited CI result. */
export declare const rawCheckId: (ref: CiPolicyRef, reviewed: ReadonlyArray<{
    readonly id: string;
}>, inheritedId: string) => string | undefined;
export declare const composeCiChecks: (local: ReadonlyArray<typeof Check.Type>, policy: CiPolicy) => ReadonlyArray<typeof Check.Type>;
/** Pause is absent from the redacted policy, so it cannot withdraw protection. */
export declare const assertCiPolicyCurrent: (expected: CiPolicy, observed: CiPolicy) => void;
/** The reserved native landing status context for this exact reviewed policy. */
export declare const requiredContextFor: (ref: Pick<CiPolicyRef, "registrationId" | "revision" | "digest">) => string;
/** Research-only issue work, the CI candidate itself, trials and replayed
 * evaluations keep their own checks and never inherit the active policy. */
export declare const inheritsCiPolicy: (input: {
    readonly job: typeof Job.Type;
    readonly event: {
        readonly trial?: boolean;
    };
}, steps: ReadonlyArray<{
    readonly id: string;
}>, evaluation: boolean) => boolean;
/** A repository without the provisioned registration read has no reviewed CI;
 * a refused or malformed read is unavailable and never absence. */
export declare const captureCiPolicy: (repo: string) => Effect.Effect<{
    readonly kind: "none";
} | {
    readonly kind: "pinned";
    readonly ref: {
        readonly repositoryId: number;
        readonly registrationId: string;
        readonly revision: number;
        readonly digest: string;
        readonly executionDigest: string;
        readonly requiredCheckIds: readonly string[];
    };
    readonly checks: readonly {
        readonly id: string;
        readonly name: string;
        readonly kind: "ai" | "command";
        readonly rule: string;
        readonly paths: readonly string[];
        readonly policy: "report" | "required";
    }[];
}, CodingError, never>;
/** Re-read immediately before a delivering step: a replaced or revoked policy
 * refuses, while a paused one keeps its reviewed rules and proceeds. */
export declare const revalidateCiPolicy: (repo: string, expected: CiPolicy) => Effect.Effect<void, CodingError, never>;
