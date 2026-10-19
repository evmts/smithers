/** Scoped process execution for build-cli discovery and watch cycles.
 * @since 1.0.0-rc.0
 */
import { exit } from "effect/Effect";
import { $awaitAll } from "vibelang-runtime";
import * as Effect_1 from "effect/Effect";
import * as runtime from "vibelang-runtime";
import * as ScopedProcess from "@smthrs/platform-node/ScopedProcess";
import { Cause, Data, Effect, Exit, Stream } from "effect";
import * as Fs from "node:fs";
import * as NodePath from "node:path";
import * as Native from "./ContainedProcess.native.js";
/** A bounded process operation failed, with its original cause retained.
 * @category errors
 * @since 1.0.0-rc.0
 */
export class ProcessError extends Data.TaggedError("smithers-build/ProcessError") {
    constructor(code, message, cause) {
        super({ code, message, ...(cause === undefined ? {} : { cause }) });
    }
}
const graceMs = 5000;
const processError = (cause) => cause instanceof ProcessError ? cause : new ProcessError("process_failed", "process execution failed", cause);
/** Executes a command and joins its owned process tree before releasing its scope.
 * @category execution
 * @since 1.0.0-rc.0
 */
export const runEffect = Effect_1.fnUntraced(function* runEffect(options) {
    let cleanupFailure;
    const spawn = Effect_1.fnUntraced(function* spawn() {
        const completion_1 = yield* runtime.uninterruptible(Effect_1.fnUntraced(function* spawn$uninterruptible() {
            const nodeModule = yield* Effect_1.try(((command) => process.platform === "win32" && NodePath.isAbsolute(command) &&
                /\.(?:mjs|cjs|js)$/.test(command) &&
                Fs.statSync(command, { throwIfNoEntry: false })?.isFile() === true).bind(undefined, options.command));
            const handle = yield* ScopedProcess.spawn({
                command: nodeModule ? yield* Effect_1.sync(() => process.execPath) : options.command,
                args: nodeModule ? [options.command, ...options.args] : options.args,
                cwd: options.cwd,
                env: options.environment,
                stdin: options.stdin === undefined ? "ignore" : "pipe",
                killSignal: "SIGTERM",
                forceKillAfter: graceMs
            });
            // Registered after spawn: this runs BEFORE the service releases its handle.
            // Leader exit is insufficient: descendants may have closed all inherited pipes.
            yield* Effect.addFinalizer(Effect_1.fnUntraced(function* () { return yield* Effect.orDie(Effect_1.gen(function* () { return yield* Effect.tapCause(Effect_1.gen(function* () { return yield* handle.kill({ killSignal: "SIGTERM", forceKillAfter: graceMs }); }), Effect_1.fnUntraced(function* (cause) {
                cleanupFailure = Cause.squash(cause);
            })); })); }));
            return { kind: "return", value: handle };
        })());
        if (completion_1.kind === "return")
            return completion_1.value;
    });
    const program = Effect_1.fnUntraced(function* program() {
        const handle = yield* spawn();
        const consume = Effect_1.fnUntraced(function* consume(stream, write) {
            let size = 0;
            const decoder = yield* Effect_1.sync(((fatal) => new TextDecoder("utf-8", { fatal })).bind(undefined, options.fatalUtf8 ?? false));
            yield* Stream.runForEach(stream, Effect_1.fnUntraced(function* (chunk) {
                size += chunk.byteLength;
                if (options.maxOutputBytes !== undefined && size > options.maxOutputBytes) {
                    return yield* Effect_1.fail(new ProcessError("output_limit", `process output exceeds ${options.maxOutputBytes} bytes`));
                }
                yield* Effect_1.try({ try: ((chunk, decoder, write) => write(decoder.decode(chunk, { stream: true }))).bind(undefined, chunk, decoder, write), catch: (cause) => cause });
            }));
            yield* Effect_1.try({ try: ((decoder, write) => {
                    const tail = decoder.decode();
                    if (tail !== "")
                        write(tail);
                }).bind(undefined, decoder, write), catch: (cause) => cause });
        });
        // A command may exit without reading its input; its exit status, not the broken pipe, is the result.
        const feed = Effect_1.fnUntraced(function* feed(input) {
            yield* runtime.$catch(Effect_1.fnUntraced(function* feed$try() {
                yield* Stream.run(Stream.make(yield* Effect_1.sync(((input) => new TextEncoder().encode(input)).bind(undefined, input))), handle.stdin);
            })(), Effect_1.fnUntraced(function* feed$catch(error) {
                const code = error.cause?.code;
                if (!(code === "EPIPE" || code === "EOF"))
                    return yield* Effect_1.fail(error);
            }));
        });
        const [code] = yield* $awaitAll([
            Effect_1.gen(function* () { return (yield* ScopedProcess.status(handle)).code ?? 1; }),
            Effect_1.gen(function* () { return yield* consume(handle.stdout, options.stdout); }),
            Effect_1.gen(function* () { return yield* consume(handle.stderr, options.stderr); }),
            Effect_1.gen(function* () { return options.stdin === undefined ? undefined : yield* feed(options.stdin); })
        ]);
        return code;
    });
    const bounded = Effect_1.fnUntraced(function* bounded() {
        if (options.timeoutMs === undefined)
            return yield* program();
        return yield* Effect.timeoutOrElse(Effect_1.gen(function* () { return yield* program(); }), {
            duration: options.timeoutMs,
            orElse: Effect_1.fnUntraced(function* orElse() {
                return yield* Effect_1.fail(new ProcessError("timed_out", `process timed out after ${options.timeoutMs}ms`));
            })
        });
    });
    return yield* Effect.uninterruptibleMask(Effect_1.fnUntraced(function* (restore) {
        // S3-1: restore wraps the scoped program in TypeScript, with no by-name frame inside it.
        const result = yield* exit(Effect_1.gen(function* () { return yield* Native.restoreScoped(restore, bounded); }));
        if (cleanupFailure !== undefined) {
            return yield* Effect_1.fail(new ProcessError("cleanup_failed", "process cleanup failed", cleanupFailure));
        }
        if (Exit.isSuccess(result))
            return result.value;
        if (Cause.hasInterrupts(result.cause))
            return yield* runtime.$failCause(Cause.map(result.cause, processError));
        return yield* Effect_1.fail(processError(Cause.squash(result.cause)));
    }));
});
/** Promise boundary for command APIs that accept an AbortSignal.
 * @category execution
 * @since 1.0.0-rc.0
 */
export const run = Native.run;
