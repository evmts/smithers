/**
 * Inert remote-cache configuration for a workspace root PACKAGE.ts file.
 *
 * @since 0.1.0
 */
import * as Secret from "./Secret.ts";
/**
 * Runtime marker for a remote-cache declaration.
 *
 * @category type ids
 * @since 0.1.0
 */
export declare const TypeId: unique symbol;
/**
 * Environment variable read for the bearer token when none is declared.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultTokenEnv = "SMITHERS_CACHE_TOKEN";
/**
 * Maximum UTF-8 size of one remote-cache endpoint.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumEndpointBytes: number;
/**
 * Maximum length of the environment-variable name carrying a cache token.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumTokenEnvironmentLength = 256;
/**
 * A pure remote-cache declaration.
 *
 * The declaration carries only the HTTPS endpoint and the name of the
 * environment variable holding its bearer token. The token value remains
 * host state and is never part of PACKAGE.ts or target key material.
 *
 * @category models
 * @since 0.1.0
 */
export interface RemoteCache {
    readonly [TypeId]: typeof TypeId;
    readonly endpoint: string;
    /**
     * The declared secret holding the bearer token reads authenticate with.
     *
     * A {@link Secret.Secret} rather than a bare variable name, so the remote
     * cache uses the same declaration every other secret-taking target uses. The
     * value is still host state: the declaration names where to read it, and
     * nothing here ever holds it.
     */
    readonly token: Secret.Secret;
    /**
     * The declared secret holding the bearer token writes authenticate with,
     * when the declaration splits read and write credentials. Undefined means
     * one token serves both directions.
     */
    readonly write: Secret.Secret | undefined;
    /**
     * A public read token committed to the repository, or undefined.
     *
     * The one credential that may appear in PACKAGE.ts as a literal. Smithers Cloud mints
     * it per repository (`smithers cache token create`); it can only read that
     * repository's cache, is refused with 403 on every publication before the
     * body is read, and never authenticates anywhere else, so committing it is
     * the same posture as an Nx read-only access token. Reads use it; writes
     * still read {@link RemoteCache.write} (or {@link RemoteCache.token} when no
     * write secret is declared) from the environment.
     */
    readonly publicReadToken: string | undefined;
}
/**
 * Validates a public read token literal.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const normalizePublicReadToken: (value: string) => string;
/**
 * The Smithers Cloud API base a {@link smithersCloud} declaration derives its endpoint from.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultSmithersCloudApiBase = "https://api.jjhub.tech";
/**
 * Options accepted by {@link make}.
 *
 * Two forms: the single-token form (`token`, defaulting to
 * `Secret("SMITHERS_CACHE_TOKEN")`) and the split form (`read` plus an
 * optional `write`). `token` and `read` name the same slot and are exclusive.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
    readonly endpoint: string;
    /** @default Secret("SMITHERS_CACHE_TOKEN") */
    readonly token?: Secret.Secret | undefined;
    /** The read token; an alias of `token` for the split read/write form. */
    readonly read?: Secret.Secret | undefined;
    /** The write token of the split form. */
    readonly write?: Secret.Secret | undefined;
    /**
     * A committed public read token. Exclusive with `token` and `read`: reads
     * use the literal, and `write` (default `Secret("SMITHERS_CACHE_TOKEN")`)
     * names the publishing credential.
     */
    readonly publicReadToken?: string | undefined;
}
/**
 * Options accepted by {@link smithersCloud}.
 *
 * @category models
 * @since 0.1.0
 */
export interface SmithersCloudOptions {
    /** The repository as `owner/name`. */
    readonly repo: string;
    /** The committed public read token, when the repository is private or publishes. */
    readonly publicReadToken?: string | undefined;
    /** The write credential; defaults to `Secret("SMITHERS_CACHE_TOKEN")`. */
    readonly write?: Secret.Secret | undefined;
    /** The Smithers Cloud API base; defaults to {@link defaultSmithersCloudApiBase}. */
    readonly apiBase?: string | undefined;
}
/**
 * Validates and normalizes a remote-cache endpoint.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const normalizeEndpoint: (value: string) => string;
/**
 * Validates one bearer-token environment variable name.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const normalizeTokenEnv: (value: string) => string;
/**
 * Creates a pure remote-cache declaration.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (options: Options) => RemoteCache;
/**
 * Creates the declaration for a repository's Smithers Cloud-hosted cache.
 *
 * The endpoint is derived from the API base and the repository, so the only
 * thing a workspace commits is the repository name and, optionally, its
 * public read token. `smthrs cache connect` writes exactly this line.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const smithersCloud: (options: SmithersCloudOptions) => RemoteCache;
/**
 * Checks whether a PACKAGE.ts export is a remote-cache declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isRemoteCache: (value: unknown) => value is RemoteCache;
