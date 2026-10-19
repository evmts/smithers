/** Dependency-aware execution in fresh processes, with cancellation on file changes.
 * @since 0.1.0
 */
import * as Effect_1 from "effect/Effect";
import { Cause, Effect, Exit, Queue, Stream } from "effect";
import { watch } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ContainedProcess from "./internal/ContainedProcess.js";
import { PackageError } from "./PackageError.js";
import * as Native from "./Watch.native.js";
/** Runs fresh CLI processes until interrupted, cancelling stale work when an input changes.
 * @category execution
 * @since 0.1.0
 */
export const run = (options) => Native.run(options, watching);
/** The watch loop: one fresh CLI process per cycle, replaced when the tree changes. */
const watching = Effect_1.fnUntraced(function* watching(options, state) {
    // The package bootstrap installs declaration identity hooks before importing
    // any command modules, both in a checkout and in a compiled distribution.
    const entry = yield* Effect_1.sync(() => {
        const manifest = createRequire("file:///Users/williamcory/smithers-vibe-twins/packages/smithers/build/build-cli/src/Watch.ts").resolve("@smthrs/build-cli/package.json");
        return fileURLToPath(new URL("./src/main.js", pathToFileURL(manifest)));
    });
    const ignored = [".git", "node_modules", ...options.ignored].map((path) => path.replaceAll("\\", "/").replace(/\/$/, ""));
    const relevant = (path) => !path.split("/").includes("node_modules") &&
        !ignored.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    // The notifier coalesces and drops events under load (FSEvents discards its
    // must-scan notifications, and a busy fseventsd can hold or lose an edit),
    // so each cycle records a digest of the watched tree and a periodic rescan
    // starts a replacement when the tree no longer matches it. `state` holds
    // that digest, the cycle count and exit code, the retained containment
    // failure (switchMap discards a replaced stream's error, so a replacement
    // cannot start after containment failed), and the observed and covered
    // change counters (a replacement starts after its stale cycle's cleanup, so
    // it already sees every change observed until then).
    const recordBaseline = Effect_1.fnUntraced(function* recordBaseline() {
        const since = state.observed;
        const tree = yield* Effect_1.tryPromise({ try: (async (root, relevant) => Native.digest(root, relevant)).bind(undefined, options.root, relevant), catch: (cause) => cause instanceof Error ? cause : new PackageError("watch_refresh_failed", "workspace rescan failed", { cause }) });
        state.baseline = tree;
        state.baselineObserved = since;
    });
    const launch = Effect_1.fnUntraced(function* launch() {
        const number = ++state.cycles;
        let output = "";
        const command = yield* Effect_1.sync(() => process.execPath);
        return yield* Effect.onExit(Effect_1.gen(function* () { return yield* ContainedProcess.runEffect({
            command,
            args: [entry, ...options.args, "--workspace", options.root],
            cwd: options.root,
            environment: options.environment,
            stdout: (text) => {
                if (options.cycleCompleted !== undefined)
                    output = `${output}${text}`.slice(-16 * 1024);
                options.stdout(text);
            },
            stderr: options.stderr
        }); }), Effect_1.fnUntraced(function* (exit) {
            state.exitCode = Exit.isSuccess(exit) ? exit.value : 1;
            if (Exit.isFailure(exit)) {
                if (Cause.hasInterruptsOnly(exit.cause))
                    state.covered = state.observed;
                else
                    state.failure = Cause.squash(exit.cause);
            }
            options.cycleCompleted?.({ number, exitCode: state.exitCode, output });
        }));
    });
    const cycle = Effect_1.fnUntraced(function* cycle() {
        if (state.failure !== undefined)
            return yield* Effect_1.fail(state.failure);
        if (!options.once)
            yield* recordBaseline();
        return yield* launch();
    });
    const changes = Stream.prepend(Stream.filter(Stream.debounce(Stream.callback(Effect_1.fnUntraced(function* (queue) {
        yield* Effect.acquireRelease(Effect_1.gen(function* () { return yield* Effect_1.try({ try: ((queue, state, root, relevant, rescanMs) => {
                let closed = false;
                let scanning = false;
                let again = false;
                // Offers a change only when no event arrived since the running
                // cycle's digest; an observed event already has a replacement coming.
                const rescan = () => {
                    if (closed || state.baseline === undefined)
                        return;
                    if (scanning) {
                        again = true;
                        return;
                    }
                    scanning = true;
                    const expected = state.baseline;
                    Native.digest(root, relevant).then((tree) => {
                        if (!closed && tree !== expected && state.baseline === expected && state.observed === state.baselineObserved) {
                            Queue.offerUnsafe(queue, ++state.observed);
                        }
                    }, (error) => {
                        if (!closed)
                            Queue.failCauseUnsafe(queue, Cause.fail(error));
                    }).finally(() => {
                        scanning = false;
                        if (again) {
                            again = false;
                            rescan();
                        }
                    });
                };
                const timer = setInterval(rescan, rescanMs ?? 1000);
                const watcher = watch(root, { recursive: true }, (_event, filename) => {
                    // A notification without a name says only that something changed.
                    if (filename === null)
                        return rescan();
                    const path = filename.toString().replaceAll("\\", "/");
                    if (relevant(path))
                        Queue.offerUnsafe(queue, ++state.observed);
                }).on("error", (error) => {
                    Queue.failCauseUnsafe(queue, Cause.fail(error));
                });
                return () => {
                    closed = true;
                    clearInterval(timer);
                    watcher.close();
                };
            }).bind(undefined, queue, state, options.root, relevant, options.rescanMs), catch: (cause) => cause instanceof Error ? cause : new Error("filesystem watch failed", { cause }) }); }), Effect_1.fnUntraced(function* (close) { return yield* Effect_1.sync(((close) => close()).bind(undefined, close)); }));
    }), { bufferSize: 1, strategy: "sliding" }), options.debounceMs), (change) => change > state.covered), [0]);
    return yield* Effect.scoped(Effect_1.gen(function* () { return yield* Stream.runDrain(Stream.switchMap((options.once ? Stream.make(0) : changes), () => Stream.fromEffect(Effect_1.gen(function* () { return yield* cycle(); })), { bufferSize: 1 })); }));
});
