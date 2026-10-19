/**
 * Scoped supervisor for `S.Shell.Serve` services.
 *
 * A `services` edge means: acquire the Serve target, await bounded readiness,
 * keep probing its health while consumers run, scope it to them, and always
 * release it through the declared stop contract. This module owns that
 * lifecycle. The executor resolves a Serve target's attrs into a
 * {@link ServiceSpec} and calls {@link ServiceSupervisor.acquire} inside the
 * consumer's scope; the consumer's work runs under
 * {@link ServiceHandle.whileHealthy} so a service that dies or stops answering
 * fails the consumer with the tail of the captured server output instead of
 * hanging it.
 *
 * Lifetime is scope-based throughout (repo rule: no threaded `AbortSignal`s).
 * One supervisor is created per CLI command; services are reference-counted by
 * `key` through an `RcMap`, so two consumers of one Serve target share one
 * spawn and the process group is stopped when the last consumer's scope
 * closes — on success, on failure, and on interruption alike. A separate
 * process owner enforces that deadline after target exit and after the host
 * loses its private connection; raw numeric-PID backstops are unnecessary.
 *
 * @since 0.1.0
 */
import * as Secret from "@smthrs/targets/Secret";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Scope from "effect/Scope";
import type * as OutputStream from "./OutputStream.ts";
/**
 * Optional command-scoped progress observers; service capture and readiness are independent.
 * @category services
 * @since 1.0.0
 */
export declare const Output: Context.Reference<(spec: ServiceSpec) => OutputStream.Observer | undefined>;
/**
 * The readiness probe of a Serve target: an open TCP port on the loopback
 * interface, or an HTTP GET whose response status below 500 means ready.
 * Structurally identical to the decoded `Attr.Readiness` union, so executor
 * code passes Serve attrs through unchanged.
 *
 * @category models
 * @since 0.1.0
 */
export type Readiness = {
    readonly port: number;
} | {
    readonly http: string;
    readonly timeout: string;
} | {
    readonly exec: ReadonlyArray<string>;
    readonly timeout: string;
};
/**
 * The health contract of a Serve target: the readiness probe repeated on an
 * interval while consumers run, with `failures` consecutive misses marking
 * the service unhealthy. Structurally identical to the decoded `Attr.Health`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Health {
    readonly interval: string;
    readonly failures?: number | undefined;
}
/**
 * The stop contract of a Serve target: the graceful-exit signal and the grace
 * period applied before the process group is killed. Structurally identical
 * to the decoded `Attr.Stop`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Stop {
    readonly signal: string;
    readonly grace: string;
}
/**
 * One resolved Serve target as the supervisor consumes it.
 *
 * The executor derives this from a Serve target's decoded attrs at the
 * integration seam: `key` is the target's label (the refcount identity — two
 * consumers naming one label share one spawn), `cwd` is the
 * workspace-resolved absolute package directory, `argv` is the resolved
 * executable and arguments, and `readiness`/`health`/`stop` are the Serve
 * probe attrs passed through unchanged.
 *
 * @category models
 * @since 0.1.0
 */
export interface ServiceSpec {
    readonly key: string;
    readonly cwd: string;
    readonly argv: readonly [string, ...Array<string>];
    /**
     * Docker container name prefix, scoped to the invocation. When present,
     * argv is the Docker executable followed by create options/image/command;
     * exec readiness and init are container commands. Each shared lifetime gets
     * a unique name, and all operations after creation address its returned ID.
     */
    readonly docker?: string | undefined;
    readonly env?: Readonly<Record<string, string>> | undefined;
    /** Destination-bound credentials exposed only as proxy placeholders. */
    readonly secrets?: ReadonlyArray<Secret.HttpCredential> | undefined;
    /**
     * Argv positions that receive loopback egress URLs. The real URL is read
     * from the declaration only when the service requests the loopback URL.
     */
    readonly secretUrls?: ReadonlyArray<{
        readonly index: number;
        readonly secret: Secret.Secret;
    }> | undefined;
    readonly readiness?: Readiness | undefined;
    readonly health?: Health | undefined;
    readonly stop?: Stop | undefined;
    /**
     * Best-effort commands run before the process is spawned. Hooks may touch
     * only resources owned by this invocation; a matching target label or
     * working directory does not establish ownership across commands.
     */
    readonly prepare?: ReadonlyArray<readonly [string, ...Array<string>]> | undefined;
    /** Commands run after readiness and before the service is handed to consumers. */
    readonly init?: ReadonlyArray<readonly [string, ...Array<string>]> | undefined;
    /** Best-effort commands run during finalization after the process stop contract. */
    readonly cleanup?: ReadonlyArray<readonly [string, ...Array<string>]> | undefined;
}
declare const ServiceError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/ServiceError";
} & Readonly<A>;
/**
 * A service acquisition or supervision failure.
 *
 * `outputTail` carries the trailing captured server output so a consumer
 * failed by its service sees what the server last said.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class ServiceError extends ServiceError_base<{
    readonly key: string;
    readonly reason: "invalid-spec" | "spec-drift" | "spawn-failed" | "exited" | "readiness-timeout" | "init-failed" | "unhealthy";
    readonly message: string;
    readonly outputTail: string;
}> {
}
/**
 * A live, ready service held by one consumer's scope.
 *
 * @category models
 * @since 0.1.0
 */
export interface ServiceHandle {
    readonly key: string;
    /** Process id of the actual shared service child. */
    readonly pid: number;
    /** Trailing captured stdout+stderr of the service, for diagnostics. */
    readonly outputTail: () => string;
    /**
     * Runs a consumer effect raced against the service's health: when the
     * service exits or its health probe misses `failures` times in a row, the
     * consumer is interrupted and the result fails with a `ServiceError`
     * carrying the output tail.
     */
    readonly whileHealthy: <A, E, R>(consumer: Effect.Effect<A, E, R>) => Effect.Effect<A, E | ServiceError, R>;
}
/**
 * The per-command service supervisor.
 *
 * @category models
 * @since 0.1.0
 */
export interface ServiceSupervisor {
    /**
     * Acquires the service for a spec inside the current scope: spawns it in
     * its own process group on first acquisition (subsequent acquisitions of
     * the same `key` share it), awaits bounded readiness, and registers a
     * release on the scope that applies the stop contract when the last
     * consumer lets go.
     */
    readonly acquire: (spec: ServiceSpec) => Effect.Effect<ServiceHandle, ServiceError, Scope.Scope>;
}
/**
 * Overall readiness deadline applied to `{port}` probes, which carry no
 * declared timeout of their own.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultReadinessTimeoutMs = 60000;
/**
 * Delay between readiness probe attempts.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const readinessPollMs = 250;
/**
 * Consecutive health-probe misses that mark a service unhealthy when the
 * declaration omits `failures`.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultHealthFailures = 3;
/**
 * Graceful-exit signal applied when the declaration omits `stop`.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultStopSignal: NodeJS.Signals;
/**
 * Grace period before SIGKILL when the declaration omits `stop`.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultStopGraceMs = 5000;
/**
 * Maximum length of the captured output tail, in UTF-16 code units.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const outputTailLimit: number;
/**
 * Parses a Serve duration attr such as `"500ms"`, `"15s"`, `"2m"`, or `"1h"`
 * into milliseconds. This module owns the parser because `Attr.ts` validates
 * these values only as non-empty strings; any other format is refused loudly.
 *
 * @category parsing
 * @since 0.1.0
 */
export declare const parseDurationMs: (text: string, what: string) => number;
/**
 * Creates a per-command supervisor whose services live at most as long as
 * the provided scope. Consumers acquire services in their own scopes; a
 * service is spawned on its first acquisition, shared by refcount while any
 * consumer holds it, and released through its stop contract when the last
 * consumer scope closes.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: Effect.Effect<ServiceSupervisor, never, Scope.Scope>;
export {};
