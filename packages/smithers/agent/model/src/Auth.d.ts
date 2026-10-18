/**
 * Credential handling for a model route: which field names carry secrets,
 * and how a redacted credential is resolved at request time without ever
 * entering the request's canonical, sealed form.
 *
 * @since 0.1.0
 */
import * as ChildProcessEnvironment from "@smthrs/kernel/ChildProcessEnvironment";
import { Effect, Redacted as EffectRedacted } from "effect";
import { ModelError } from "./ModelError.ts";
/**
 * Credential-bearing field names shared by prepared-request validation and
 * executor diagnostics. Keep this matcher aligned across headers, query
 * parameters, and structured bodies so the sealed-step boundary and logging
 * boundary cannot disagree.
 *
 * `chatgpt-account-id` names an account rather than a secret, but it is an
 * identity the ChatGPT-subscription route must keep out of step keys, journals,
 * and diagnostics, so it is matched here and applied through {@link Auth}.
 * `token` is anchored to a complete or separator-delimited suffix so numeric
 * token-count fields remain public diagnostics rather than false credentials.
 *
 * @since 0.1.0
 * @category constants
 * @slop
 */
export declare const credentialNamePattern: RegExp;
/**
 * Reports whether a field name conventionally carries credentials.
 *
 * @since 0.1.0
 * @category predicates
 * @slop
 */
export declare const isCredentialName: typeof ChildProcessEnvironment.isCredentialName;
/**
 * A value whose normal string and JSON representations conceal its contents.
 *
 * @since 0.1.0
 * @category models
 * @slop
 */
export type Redacted<A = string> = EffectRedacted.Redacted<A>;
/**
 * Per-request authentication applied after the secret-free prepared request
 * view has been created. This is the redaction boundary: credentials never
 * enter the harness step key, and signing never logs their values.
 *
 * `sign` may hold rotating state — an OAuth token store is one — but every
 * dependency it needs (host filesystem, HTTP, clock) is captured at
 * construction time: the type has no requirements channel, and the host that
 * composes the route owns the store. The constructors here are the static
 * cases; token-store auths live with their hosts.
 *
 * `refresh` is the optional reactive half of such a store. When present,
 * `Route.stream` runs it after an `authentication` failure and retries the
 * signed request exactly once, so an access token that expired between
 * proactive checks costs one recovery rather than the sealed step. A static
 * credential leaves it undefined and a bad key stays terminal.
 *
 * @since 0.1.0
 * @category models
 * @slop
 */
export interface Auth {
    readonly sign: (headers: Record<string, string>) => Effect.Effect<Record<string, string>, ModelError>;
    readonly refresh?: Effect.Effect<void, ModelError> | undefined;
    /** Header names `sign` fills with credentials, including unconventional names. */
    readonly credentialHeaders?: ReadonlyArray<string> | undefined;
}
/**
 * Adds Auth's header names and the shared credential matcher to the caller's
 * redaction policy while signing and executing a request. Stream sanitizers
 * must capture this policy before the effect completes.
 *
 * @since 0.1.0
 * @category combinators
 * @slop
 */
export declare const withRedaction: (auth: Auth) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
/**
 * Adds a redacted API key as an exact HTTP header.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const apiKeyHeader: (name: string, key: Redacted<string>) => Auth;
/**
 * Adds a redacted API key using the HTTP bearer convention.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const bearer: (key: Redacted<string>) => Auth;
