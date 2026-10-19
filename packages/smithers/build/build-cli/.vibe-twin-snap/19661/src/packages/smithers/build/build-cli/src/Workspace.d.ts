/**
 * Shared workspace cache and input models.
 *
 * @since 0.1.0
 */
import type * as Input from "@smthrs/targets/Input";
import * as RemoteCache from "@smthrs/targets/RemoteCache";
/**
 * A file and the digest that contributes to target key material.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type FileDigest = Input.FileDigest;
/**
 * One declared matcher after discovery and content measurement.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface ExpandedInput {
    readonly declaration: Input.Declared;
    readonly files: ReadonlyArray<FileDigest>;
    readonly digest: string;
}
/**
 * The only target declaration filename.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const declarationFileNames: readonly ["PACKAGE.ts"];
/**
 * Which credentials a workspace declared for its remote cache.
 *
 * A remote build cache has untrusted readers and trusted writers: every job
 * pulls, and only a job whose inputs were reviewed may publish. `split` is
 * that posture. `shared` is one credential doing both jobs, which is what a
 * deployment that has not separated its secrets yet has, and it is a tag
 * rather than an absent field so no caller can read the single-credential case
 * as an oversight.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ResolvedRemoteCacheCredentials = {
    readonly _tag: "shared";
    readonly tokenEnv: string;
} | {
    readonly _tag: "split";
    readonly readTokenEnv: string;
    readonly writeTokenEnv: string;
}
/** Reads use a committed public read token; writes read `writeTokenEnv`. */
 | {
    readonly _tag: "public";
    readonly publicReadToken: string;
    readonly writeTokenEnv: string;
}
/**
 * No declaration: the endpoint was discovered from the Smithers Cloud remote. Reads
 * go out anonymously (a public repository answers them) unless
 * `writeTokenEnv` holds a credential, which then serves both directions.
 */
 | {
    readonly _tag: "anonymous";
    readonly writeTokenEnv: string;
};
/**
 * The remote-cache settings one command runs under.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface ResolvedRemoteCache {
    readonly endpoint: string;
    readonly credentials: ResolvedRemoteCacheCredentials;
    /** Present when the endpoint came from the workspace's Smithers Cloud remote, not a declaration. */
    readonly discovered?: DiscoveredSmithersCloudRepository | undefined;
}
/**
 * A repository found on a Smithers Cloud remote of the workspace.
 *
 * @category models
 * @since 0.1.0
 */
export interface DiscoveredSmithersCloudRepository {
    readonly repo: string;
    readonly host: string;
}
/**
 * Every environment variable name a resolved credential reads.
 *
 * Callers withhold these from child processes, so both halves of a split have
 * to be listed. Missing one is how a target got to read the credential it was
 * never meant to hold.
 *
 * @category discovery
 * @since 0.1.0
 * @slop
 */
export declare const credentialEnvNames: (credentials: ResolvedRemoteCacheCredentials) => ReadonlyArray<string>;
/**
 * The host environment a child process may see.
 *
 * Withholds the default cache names and every name the workspace declares for
 * a remote-cache credential. Planning spawns host tools over workspace-controlled
 * input (`forge config`, `go env`, `nix develop`, `docker info`), and a
 * `Repo.Target` spawns this CLI in a child repository that evaluates its own
 * declarations. Every such spawn draws from this record rather than from
 * `process.env`, so a declared token never reaches code it was not meant for.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const withheldEnvironment: (environment: Readonly<Record<string, string | undefined>>, credentials: ResolvedRemoteCacheCredentials | undefined) => Readonly<Record<string, string | undefined>>;
/**
 * A resolved remote cache with the readers that fetch its credentials.
 *
 * The readers are invoked only while an outbound request is being built, so a
 * credential is never held in a field anything can serialize. A shared
 * declaration returns the same value from both.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface RemoteCacheAccess extends ResolvedRemoteCache {
    readonly readToken: () => string | undefined;
    readonly writeToken: () => string | undefined;
    /**
     * The trust domain this process publishes into, or undefined for the
     * trusted one. Host state: which domain a job runs in is a property of the
     * job, not of the workspace it builds.
     */
    readonly publishNamespace: string | undefined;
}
/**
 * The hosts whose remotes identify a Smithers Cloud repository. `SMITHERS_CLOUD_HOSTS`
 * (comma separated) adds a self-hosted deployment's hosts.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const defaultSmithersCloudHosts: ReadonlyArray<string>;
/**
 * The cache endpoint of a repository on Smithers Cloud. `SMITHERS_CLOUD_API_URL`
 * overrides the API base for a self-hosted deployment.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const smithersCloudCacheEndpoint: (repo: string, environment: Readonly<Record<string, string | undefined>>) => string;
/**
 * Parses one remote URL into `owner/name` when its host is a Smithers Cloud host.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const parseSmithersCloudRemote: (url: string, hosts?: ReadonlySet<string>) => DiscoveredSmithersCloudRepository | undefined;
/**
 * Finds the Smithers Cloud repository a workspace's `origin` (or any) remote points
 * at, reading the colocated Git config first (`.git/config`, or a linked
 * worktree's common-directory config) and the jj git backend's config second.
 * Never spawns git or jj.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const discoverSmithersCloudRepository: (root: string, environment: Readonly<Record<string, string | undefined>>) => Promise<DiscoveredSmithersCloudRepository | undefined>;
/**
 * Validates the `SMITHERS_CACHE_URL` override.
 *
 * A declaration must be HTTPS. The process override may also be plain HTTP
 * on loopback, which is how a cache running on the same host (the self-hosted
 * module, or a local API) is reached; `Cache.ts` admits exactly the same set,
 * so the override cannot pass discovery and then be refused when the store
 * opens.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const normalizeOverrideEndpoint: (value: string) => string;
/**
 * Resolves a remote cache from an already-read declaration.
 *
 * Workspace execution reads its declaration from WORKSPACE.ts; target
 * mode reads the same declaration out of `WORKSPACE.ts`'s `S.Cache({ remote })`
 * field, which `WorkspaceDeclaration.CacheDeclaration` schema-validates as a
 * real `RemoteCache`. Both then need the identical endpoint-override and
 * credential-name precedence, so it lives here rather than being reimplemented
 * once per mode.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const remoteCacheOf: (declaration: RemoteCache.RemoteCache | undefined, endpointOverride?: string | undefined) => ResolvedRemoteCache | undefined;
