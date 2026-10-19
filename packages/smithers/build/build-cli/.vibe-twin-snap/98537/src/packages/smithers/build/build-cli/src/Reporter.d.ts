/**
 * The seam between target execution and the terminal.
 *
 * Execution reports events, a run beginning, a target starting, a target
 * settling, a free-form note, a warning, the end summary, and a renderer
 * decides what they look like. Three renderers ship. `plain` prints exactly
 * the lines the executors always printed, one per settled target and one
 * summary, which is what pipes, CI logs, and the existing tests read.
 * `stream` adds colour, glyphs, and aligned columns but never moves the
 * cursor, so it is safe wherever colour is. `tty` draws in place: running
 * targets spin at the bottom of the screen and settled targets scroll above
 * them in completion order, the way Bazel's progress bar and Nx's dynamic
 * renderer work.
 *
 * Every renderer writes to standard error. Standard output stays the
 * property of the structured envelope incur prints, so `--format json` is
 * never mixed with progress.
 *
 * @since 0.1.0
 */
import * as Ansi from "./Ansi.ts";
import type * as Audience from "./Audience.ts";
import type { Summary, TargetReport } from "./Executor.ts";
/**
 * The `--ui` flag values. `auto` resolves to one of the other three from the
 * environment and the streams; see {@link resolveRenderer}.
 *
 * @category models
 * @since 0.1.0
 */
export declare const uiModes: readonly ["auto", "tty", "stream", "plain"];
/**
 * One of {@link uiModes}.
 *
 * @category models
 * @since 0.1.0
 */
export type UiMode = (typeof uiModes)[number];
/**
 * A concrete renderer: `auto` resolved.
 *
 * @category models
 * @since 0.1.0
 */
export type Renderer = Exclude<UiMode, "auto">;
/**
 * The stream a renderer writes to. `columns` is read on every paint so a
 * resize takes effect at the next frame.
 *
 * @category models
 * @since 0.1.0
 */
export interface Terminal {
    readonly write: (text: string) => void;
    readonly isTTY: boolean;
    readonly columns: number | undefined;
}
/**
 * Wraps a process stream as a {@link Terminal}.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const terminalOf: (stream: NodeJS.WriteStream) => Terminal;
/**
 * Which streams are terminals, as {@link resolveRenderer} reads them.
 *
 * @category models
 * @since 0.1.0
 */
export interface Streams {
    readonly stdout: boolean;
    readonly stderr: boolean;
}
/**
 * Picks the renderer one invocation draws with.
 *
 * An explicit mode wins, then `SMTHRS_UI` in the environment, in the manner
 * of Turborepo's `TURBO_UI` and Nx's `NX_TUI`. Under `auto`, an explicit
 * `--format` means a program is reading the output, so the renderer is
 * `plain`; `NO_COLOR` and `TERM=dumb` are `plain`; `CI` is `plain` unless
 * `FORCE_COLOR` asks for colour, in which case it is `stream`, the cursor
 * never moving in a log; two terminals get `tty`; a terminal on standard
 * error alone, or `FORCE_COLOR` under a pipe, gets `stream`; anything else is
 * `plain`.
 *
 * @category selection
 * @since 0.1.0
 */
export declare const resolveRenderer: (mode: UiMode, env: Ansi.Environment, streams: Streams, formatExplicit?: boolean) => Renderer;
/**
 * What a run is about to do, reported once before any target starts so the
 * renderers can size their columns.
 *
 * @category models
 * @since 0.1.0
 */
export interface RunStart {
    readonly verb: string;
    readonly pattern: string;
    readonly jobs: number;
    readonly targets: ReadonlyArray<{
        readonly label: string;
        readonly target: string;
    }>;
}
/**
 * The events execution reports.
 *
 * `note` carries free-form progress lines. `toolOutput` receives a bounded,
 * redacted observer view of child and service pipes; execution still captures
 * both streams independently and folds their tails into failure results.
 * `close` restores the terminal and must run even when execution throws.
 *
 * @category models
 * @since 0.1.0
 */
export interface Reporter {
    readonly renderer: Renderer;
    readonly begin: (run: RunStart) => void;
    readonly targetStarted: (label: string) => void;
    readonly targetFinished: (report: TargetReport) => void;
    readonly toolOutput: (label: string, stream: "stdout" | "stderr", chunk: string) => void;
    readonly note: (line: string) => void;
    readonly warn: (line: string) => void;
    readonly summary: (summary: Summary) => void;
    readonly close: () => void;
}
/**
 * Renders a duration for status lines: tenths of a second from one second
 * up, whole milliseconds below.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const formatDuration: (durationMs: number) => string;
/**
 * The status line the plain renderer prints for one settled target.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const plainLine: (report: TargetReport) => string;
/**
 * The end line the plain renderer prints for one run.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const plainSummary: (summary: Summary) => string;
/**
 * The renderer that prints the historical lines and nothing else.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const plain: (writeLine: (line: string) => void) => Reporter;
/**
 * What {@link make} needs beyond the renderer.
 *
 * `now` and `interval` exist for tests: a fake clock makes elapsed times
 * deterministic and `interval: false` stops the spinner timer so output is a
 * pure function of the events.
 *
 * @category models
 * @since 0.1.0
 */
export interface MakeOptions {
    readonly renderer: Renderer;
    readonly terminal: Terminal;
    readonly env?: Ansi.Environment | undefined;
    readonly now?: (() => number) | undefined;
    readonly interval?: number | false | undefined;
    readonly presentation?: Audience.Policy | undefined;
}
/**
 * Quiet progress retains bounded diagnostics, without flooding an agent's context.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const silent: (terminal: Terminal) => Reporter;
/**
 * Builds one audience-aware renderer; all progress is redacted independently of results.
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (options: MakeOptions) => Reporter;
/**
 * The reporter an executor runs under: the one it was given, else the plain
 * renderer over its `log` sink, else the plain renderer over standard error.
 * This is what keeps `log` callers, the tests among them, byte-for-byte where
 * they were.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const of: (options: {
    readonly reporter?: Reporter | undefined;
    readonly log?: ((line: string) => void) | undefined;
}) => Reporter;
