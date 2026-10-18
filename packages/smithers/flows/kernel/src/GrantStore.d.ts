/**
 * In-memory capability grants with an attended Deferred request lifecycle.
 *
 * Governing design:
 * `docs/specs/Concepts/Permission Kernel.md` and
 * `docs/specs/Concepts/Trust Granularity.md`.
 *
 * @since 1.0.0-rc.0
 */
import { type Capability, CapabilityPattern, type EffectTier } from "@smthrs/capability/Capability";
import { GrantStoreError, type PermissionDenied, type PermissionRequired, Rule } from "@smthrs/capability/Permission";
import { Context, Effect, Layer, type Scope } from "effect";
import { type CapabilitySet } from "./CapabilitySet.ts";
import { type GrantEvent } from "./GrantEvent.ts";
import { Workspace } from "./Workspace.ts";
/**
 * A capability request waiting for an attended reply.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface PendingRequest {
    readonly requestId: string;
    readonly capability: Capability;
    readonly tier: EffectTier;
    readonly meta: Record<string, unknown>;
}
/**
 * A resolution supplied by an attended permission surface.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type Resolution = "once" | "run" | "remembered" | "deny";
/**
 * Scope and plan identity for a bulk envelope approval.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface EnvelopeGrantOptions {
    readonly planDigest: string;
    readonly patterns: ReadonlyArray<CapabilityPattern>;
    readonly scope?: "run" | "remembered" | undefined;
}
/** A policy rule and the authority captured when it was granted.
 * @category models
 * @since 1.0.0-rc.1
 */
export interface PolicyRule {
    readonly rule: Rule;
    readonly ceiling: Pick<CapabilitySet, "groups">;
}
/** Atomic ordered policy snapshot, bounded by the calling fiber.
 * @category models
 * @since 1.0.0-rc.1
 */
export interface Policy {
    readonly groups: ReadonlyArray<ReadonlyArray<PolicyRule>>;
    readonly ceiling: CapabilitySet;
}
/** A conservative snapshot for services that expose no durable authority.
 * @category constructors
 * @since 1.0.0-rc.1
 */
export declare const emptyPolicy: Effect.Effect<Policy>;
/** Operations exposed by the grant store.
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Service {
    readonly policy: Effect.Effect<Policy, GrantStoreError>;
    readonly check: (capability: Capability, meta?: Record<string, unknown>) => Effect.Effect<void, PermissionRequired | PermissionDenied | GrantStoreError>;
    readonly reply: (requestId: string, resolution: Resolution, pattern?: CapabilityPattern) => Effect.Effect<void, GrantStoreError>;
    readonly list: Effect.Effect<ReadonlyArray<PendingRequest>>;
    readonly grantEnvelope: (options: EnvelopeGrantOptions) => Effect.Effect<void, GrantStoreError>;
}
declare const GrantStore_base: Context.ServiceClass<GrantStore, "@smthrs/kernel/GrantStore", Service>;
/**
 * Service key for permission decisions and attended grant requests.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export declare class GrantStore extends GrantStore_base {
}
/**
 * A hook that durably records a grant decision before it becomes active.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type Persist = (event: GrantEvent) => Effect.Effect<void, GrantStoreError>;
/**
 * Configuration for an in-memory grant store.
 *
 * A nested `rules` value is also accepted by the journal adapter: its first
 * ruleset is configured policy and subsequent rulesets are replayed remembered
 * grants.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface MakeOptions {
    readonly attended?: boolean | undefined;
    readonly rules?: ReadonlyArray<Rule> | ReadonlyArray<ReadonlyArray<Rule>> | undefined;
    /** Bare rules use the constructor ceiling; captured groups intersect it. */
    readonly runRules?: ReadonlyArray<Rule | {
        readonly rule: Rule;
        readonly ceiling: ReadonlyArray<ReadonlyArray<CapabilityPattern>>;
    }> | undefined;
    readonly envelope?: EnvelopeGrantOptions | undefined;
    /**
     * {@link envelopeSignature} values of envelopes that are already durable —
     * typically replayed from a journal. A construction or runtime envelope
     * matching a seeded signature still activates its rules but is not
     * persisted again.
     */
    readonly envelopeSignatures?: ReadonlyArray<string> | undefined;
    readonly runId?: string | undefined;
    readonly planDigest?: string | undefined;
    readonly persist?: Persist | undefined;
}
/**
 * Maximum policy rules retained by one store.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumRules = 1024;
/**
 * Maximum predicates in one approval envelope.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumEnvelopePatterns = 256;
/**
 * Maximum permission requests parked at once.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumPendingRequests = 1024;
/**
 * Maximum nesting depth of permission metadata.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumMetadataDepth = 16;
/**
 * Maximum members across one permission metadata graph.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumMetadataMembers = 1024;
/**
 * Maximum encoded bytes retained for one metadata value.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumMetadataBytes: number;
/**
 * Maximum encoded bytes persisted for one grant event.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumEventBytes: number;
/**
 * Maximum milliseconds one grant journal write may take before its reply or
 * envelope admission fails with `journal_failed`. Journal writes never hold
 * the store's mutation permit, so a slow write stalls only the admission that
 * issued it.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumPersistMillis = 30000;
/**
 * Maximum length of a run, plan, request, or signature identity.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumIdentityLength = 4096;
/**
 * Maximum capability resource length enforced by the capability vocabulary.
 * @category limits
 * @since 1.0.0-rc.0
 */
export declare const maximumCapabilityResourceLength = 4096;
/**
 * Canonicalizes an envelope pattern list: duplicate predicates collapse to
 * their first occurrence and the survivors sort by their formatted identity.
 *
 * An envelope is a *set* of predicates, so two envelopes listing the same
 * predicates in a different order or multiplicity are the same approval. Every
 * envelope is canonicalized before it is persisted or compared, which makes
 * envelope idempotency structural rather than dependent on caller discipline.
 *
 * The ordering is the code-unit sort of `format(pattern)` — the one renderer
 * for capability identity. RFC 8785 canonical JSON (`@smthrs/canonical`)
 * was considered and does not fit: it canonicalizes object keys but preserves
 * array order as semantic, and the ordering that matters here is exactly the
 * pattern-array order.
 *
 * @category validation
 * @since 1.0.0-rc.0
 */
export declare const canonicalEnvelopePatterns: (patterns: ReadonlyArray<CapabilityPattern>) => ReadonlyArray<CapabilityPattern>;
/**
 * Computes the canonical identity of an envelope approval.
 *
 * Two envelopes with the same plan digest, scope, and predicate set produce
 * the same signature regardless of pattern order or repetition. The signature
 * is how the store, and journal replay above it, recognise an envelope that
 * is already durable. It is `sha256:` followed by 64 lowercase hex digits.
 *
 * @category validation
 * @since 1.0.0-rc.0
 */
export declare const envelopeSignature: (planDigest: string, scope: "run" | "remembered", patterns: ReadonlyArray<CapabilityPattern>) => string;
/**
 * Checks that a request-scoped grant cannot authorize a different action or a
 * more dangerous effect tier than the request displayed to the user. A
 * wildcard-bearing pattern identical to the resource is ambiguous because the
 * grammar has no escape, so its wildcard reading would silently widen access.
 *
 * @category validation
 * @since 1.0.0-rc.0
 */
export declare const isValidGrantPattern: (pattern: CapabilityPattern, capability: Capability, tier: EffectTier, workspaceRoot: string) => boolean;
/**
 * Checks that a bulk envelope pattern preserves exact action and filesystem
 * effect-tier boundaries.
 *
 * @category validation
 * @since 1.0.0-rc.0
 */
export declare const isValidEnvelopePattern: (pattern: CapabilityPattern, workspaceRoot: string) => boolean;
/**
 * Builds an in-memory grant store.
 *
 * Attended stores suspend an asking fiber on a request-local `Deferred`.
 * Unattended stores fail immediately with `PermissionRequired`. The returned
 * service is scoped: closing its scope rejects every waiter and clears the
 * pending map.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const make: (options?: MakeOptions) => Effect.Effect<Service, GrantStoreError, Scope.Scope | Workspace>;
/**
 * Provides a scoped in-memory grant store.
 *
 * @category layers
 * @since 1.0.0-rc.0
 */
export declare const layer: (options?: MakeOptions) => Layer.Layer<GrantStore, GrantStoreError, Workspace>;
/**
 * An allow-all grant store.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const makeNoop: Service;
/**
 * Provides the allow-all grant store.
 *
 * @category layers
 * @since 1.0.0-rc.0
 */
export declare const layerNoop: Layer.Layer<GrantStore>;
export {};
