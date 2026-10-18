/**
 * What the `smthrs` process measures about itself, and where each measurement
 * goes.
 *
 * OTLP export is opted into by the standard OpenTelemetry environment. The
 * timing records are not opt-in: {@link record} writes each one to the journal
 * of the run it was measured in, which is where a run's report reads from, and
 * sets the same fields on the span open at that point for a collector.
 *
 * Three facts sit outside the model call and the harness loop, and nothing else
 * times them: turning a subscription login into a credential ({@link SignIn}),
 * the process's way from its start to its first model request
 * ({@link StartUp}), and each process a sealed host starts in its container
 * ({@link Command}). Every duration is whole milliseconds, and each record
 * names the engine step it was measured in.
 *
 * A fourth belongs to no run: when the process started and when its host
 * closed ({@link Lifetime}), written to the control journal's host stream by
 * every process that builds an executor, a `plan` or an `approve` included.
 *
 * @since 1.0.0
 */
import * as Journal from "@smthrs/journal/Journal";
import * as Otlp from "@smthrs/observability/Otlp";
import { Effect, Schema } from "effect";
import type * as Layer from "effect/Layer";
import { type ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import type * as Tracer from "effect/Tracer";
/**
 * Exports traces, logs and metrics to `OTEL_EXPORTER_OTLP_ENDPOINT` with
 * `OTEL_EXPORTER_OTLP_HEADERS`; with no endpoint it installs no exporter.
 *
 * Provide it outside `RedactedLogger.layer`, so the exported log records pass
 * through the same redaction as the terminal's.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layer: (environment: Readonly<Record<string, string | undefined>>) => Layer.Layer<never, Otlp.LayerError>;
/**
 * The journal event one resolution of a subscription login is written to.
 *
 * @category records
 * @since 1.0.0
 */
export declare const signInEvent = "flows.host.sign-in.v1";
/**
 * What one resolution of a subscription login cost (`CodexLogin`). It holds no
 * token, no account id and no path.
 *
 * `trigger` is `request` for the credential a model request is signed with and
 * `rejected` for the refresh a 401 asks for. `readMs` is every read of the
 * login file in this resolution. `lockWaitMs` is the wait for the refresh
 * flight, this process's permit and then the lock file beside the login, and
 * zero when the access token was fresh. `refreshed` says whether the login's
 * owner was asked to refresh; `refreshMs` and `refreshOutcome` describe that
 * ask and are absent without one. `unchanged` is an owner that answered and
 * left the same token in the file.
 *
 * @category records
 * @since 1.0.0
 */
export declare const SignIn: Schema.Struct<{
    readonly trigger: Schema.Literals<readonly ["request", "rejected"]>;
    readonly readMs: Schema.Finite;
    readonly lockWaitMs: Schema.Finite;
    readonly refreshed: Schema.Boolean;
    readonly refreshMs: Schema.optional<Schema.Finite>;
    readonly refreshOutcome: Schema.optional<Schema.Literals<readonly ["rotated", "unchanged", "failed"]>>;
    readonly totalMs: Schema.Finite;
    /** Whether the resolution ended with a credential. */
    readonly ok: Schema.Boolean;
    /** The engine step the record was measured in, as `flows.engine.attempt-started` names it. */
    readonly stepKeyDigest: Schema.optional<Schema.String>;
}>;
/**
 * One decoded {@link SignIn} record.
 *
 * @category records
 * @since 1.0.0
 */
export type SignIn = typeof SignIn.Type;
/**
 * The journal event one process started in a sealed host's container is
 * written to.
 *
 * @category records
 * @since 1.0.0
 */
export declare const commandEvent = "flows.host.command.v1";
/**
 * Where the time of one transport process went ({@link timedSpawner}).
 *
 * `spawnMs` runs from the spawn request to a started process, `runMs` from
 * there to its exit, and `collectMs` from its exit to the end of its output.
 * The three add up to `totalMs`. `bytesOut` counts what was read of its
 * standard output and error. `exitCode` is absent for a process stopped before
 * it exited, whose `runMs` then ends where it was stopped.
 *
 * One `bash` call in a container is up to three of these: the command, and a
 * fingerprint of its working directory before and after it.
 *
 * @category records
 * @since 1.0.0
 */
export declare const Command: Schema.Struct<{
    readonly spawnMs: Schema.Finite;
    readonly runMs: Schema.Finite;
    readonly collectMs: Schema.Finite;
    readonly totalMs: Schema.Finite;
    readonly bytesOut: Schema.Finite;
    readonly exitCode: Schema.optional<Schema.Finite>;
    /** The engine step the record was measured in, as `flows.engine.attempt-started` names it. */
    readonly stepKeyDigest: Schema.optional<Schema.String>;
}>;
/**
 * One decoded {@link Command} record.
 *
 * @category records
 * @since 1.0.0
 */
export type Command = typeof Command.Type;
/**
 * The journal event a process's start-up is written to.
 *
 * @category records
 * @since 1.0.0
 */
export declare const startUpEvent = "flows.host.start-up.v1";
/**
 * A process's way from its start to its first model request
 * ({@link makeStartUp}).
 *
 * `stages` are in the order they ended, and each `ms` runs from the end of the
 * stage before it, or from `processStartedAtMs` for the first, so they add up
 * to `totalMs`. See {@link Stage} for what ends each one.
 *
 * @category records
 * @since 1.0.0
 */
export declare const StartUp: Schema.Struct<{
    readonly processStartedAtMs: Schema.Finite;
    readonly totalMs: Schema.Finite;
    readonly stages: Schema.$Array<Schema.Struct<{
        readonly stage: Schema.String;
        readonly ms: Schema.Finite;
    }>>;
    /** The engine step the record was measured in, as `flows.engine.attempt-started` names it. */
    readonly stepKeyDigest: Schema.optional<Schema.String>;
}>;
/**
 * One decoded {@link StartUp} record.
 *
 * @category records
 * @since 1.0.0
 */
export type StartUp = typeof StartUp.Type;
/**
 * The journal event a host process's lifetime is written to.
 *
 * @category records
 * @since 1.0.0
 */
export declare const lifetimeEvent = "flows.host.lifetime.v1";
/**
 * When a host process started and when its host closed, with the start-up
 * stages it reached ({@link StartUpClock.ended}).
 *
 * It is written to the control journal's host stream (`flows.host:<host>`),
 * not to a run's: a process that plans or approves serves no run. `endedAtMs`
 * is the last moment the process could write, with its executor closed and
 * only the control database still open, so the process's exit follows it
 * closely. `stages` are as {@link StartUp} holds them, and include `request`
 * only for a process that sent a model request.
 *
 * @category records
 * @since 1.0.0
 */
export declare const Lifetime: Schema.Struct<{
    readonly pid: Schema.Finite;
    readonly processStartedAtMs: Schema.Finite;
    readonly endedAtMs: Schema.Finite;
    readonly stages: Schema.$Array<Schema.Struct<{
        readonly stage: Schema.String;
        readonly ms: Schema.Finite;
    }>>;
}>;
/**
 * One decoded {@link Lifetime} record.
 *
 * @category records
 * @since 1.0.0
 */
export type Lifetime = typeof Lifetime.Type;
/**
 * Writes one timing record to the journal of the run this fiber serves, and
 * answers whether the journal took it.
 *
 * The run is the engine execution the fiber runs under, so the record lands in
 * its engine journal and reaches the control journal as a `control.engine.event`
 * whose `eventType` is the one given here. It goes through the journal's lossy
 * channel: a record the journal drops or refuses is not written and nothing
 * fails. A fiber that serves no run has no journal to write to.
 *
 * The journaled record also carries `stepKeyDigest`, the engine step the fiber
 * runs under. The engine's `flows.engine.attempt-started` and
 * `attempt-finished` events of the same execution carry the same digest and
 * bracket the step, so a sign-in is matched to its model call and a command to
 * its cell call.
 *
 * Each string, number and boolean field is also set on `span`, or on the span
 * open here, as `<eventType>.<field>`.
 *
 * @category records
 * @since 1.0.0
 */
export declare const record: (eventType: string, payload: Readonly<Record<string, unknown>>, span?: Tracer.Span) => Effect.Effect<boolean>;
/**
 * What ends each start-up stage. A stage is named for the mark that closes it
 * and covers everything since the mark before it.
 *
 * - `boot`: the host composition starts to build; before it are the runtime's
 *   own start, module loading and the command line.
 * - `project`: the project's flows are discovered.
 * - `journal`: the control database is open and migrated, and its runtime built.
 * - `executor`: the engine database is open and the executor has registered its
 *   tools, container transport, MCP servers and flow catalog.
 * - `launch`: the executor is handed its first run to launch or resume.
 * - `seat`: the first seat is resolved into a model route.
 * - `request`: the first model request is handed to its transport.
 *
 * @category records
 * @since 1.0.0
 */
export type Stage = "boot" | "project" | "journal" | "executor" | "launch" | "seat" | "request";
/**
 * One process's start-up clock.
 *
 * @category records
 * @since 1.0.0
 */
export interface StartUpClock {
    /** Ends `stage` now. Only the first mark of a stage counts, and none after the record is written. */
    readonly mark: (stage: Stage) => Effect.Effect<void>;
    /**
     * Ends `request` and writes the {@link StartUp} record to the run this fiber
     * serves. A request outside a run writes nothing and leaves the clock open
     * for the next one.
     */
    readonly firstRequest: Effect.Effect<void>;
    /**
     * Writes the process's {@link Lifetime} to `journal`'s host stream. A host
     * calls it as it closes; a write the journal refuses does not fail the close.
     */
    readonly ended: (journal: Journal.Service, host: {
        readonly hostId: string;
        readonly pid: number;
    }) => Effect.Effect<void>;
}
/**
 * Builds the start-up clock of a process that started at `processStartedAtMs`.
 * Marks read the Effect clock.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const makeStartUp: (processStartedAtMs: number) => StartUpClock;
/**
 * This process's start-up clock, counted from the runtime's own time origin.
 *
 * @category records
 * @since 1.0.0
 */
export declare const startUp: StartUpClock;
/**
 * `spawner`, writing one {@link Command} record for each process it starts.
 *
 * The record is written when the process's scope closes, to the run the spawn
 * was asked for under, and its fields are set on a `Command.exec` span that
 * lasts as long as the process. The handle, its streams and every failure pass
 * through unchanged.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const timedSpawner: (spawner: ChildProcessSpawner["Service"]) => ChildProcessSpawner["Service"];
