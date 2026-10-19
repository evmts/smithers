/**
 * Executes `Memory.Retain` against the Smithers Cloud memory backend.
 *
 * The backend is the `smithers` CLI. It is resolved, never assumed: when the
 * workspace declares no `S.Memory.SmithersCloud` backend, or the CLI is not
 * on PATH, the invocation fails with the typed
 * {@link MemoryBackendUnavailable} notice. That notice is deliberately not
 * green and not a crash: the caller reports it as the target's outcome, so a
 * host without the backend says so instead of pretending the memory was
 * retained.
 *
 * The CLI invocation goes through the {@link MemoryCli} service so the
 * integration can respell the documented `smithers memory` surface in one
 * place; the default implementation shells out to the resolved binary.
 *
 * @since 0.1.0
 */
import * as Effect_1 from "effect/Effect";
import * as runtime from "vibelang-runtime";
import * as Exec from "@smthrs/targets/Exec";
import * as MemoryTarget from "@smthrs/targets/MemoryTarget";
import * as Data from "effect/Data";
import * as Environment from "./Environment.js";
import * as ContainedProcess from "./internal/ContainedProcess.js";
import * as Native from "./MemoryBackend.native.js";
/**
 * The memory backend is not available on this host or in this workspace.
 *
 * `no_backend_declared`: the WORKSPACE.ts declares no
 * `S.Memory.SmithersCloud`. `cli_not_found`: the `smithers` binary is not on
 * PATH. Either way nothing ran, nothing is green, and the message says what
 * to configure.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemoryBackendUnavailable extends Data.TaggedError("smithers-build/MemoryBackendUnavailable") {
    constructor(code, message) {
        super({ code, message: `memory backend unavailable (${code}): ${message}` });
    }
}
/**
 * Checks whether a value is the unavailable-backend notice.
 *
 * @category guards
 * @since 0.1.0
 */
export const isMemoryBackendUnavailable = (value) => value instanceof MemoryBackendUnavailable;
/**
 * The subcommands `smithers memory` ships (`smithers memory --help`,
 * captured in `test/fixtures/smithers-memory-help.txt`). Every argv this
 * module builds names one of them; asking for anything else is a typed
 * {@link MemoryCapabilityMissing} refusal, never a blind spawn that exits 4
 * with no text.
 *
 * @category constants
 * @since 0.1.0
 */
export const memoryCliCommands = ["get", "list", "rm", "set"];
/**
 * Parses the `Commands:` section of `smithers memory --help` into the
 * subcommand names it lists. The captured-fixture test compares this
 * against {@link memoryCliCommands}, so a CLI surface drift fails a test
 * instead of a run.
 *
 * @category constructors
 * @since 0.1.0
 */
export const parseMemoryHelpCommands = (help) => {
    const commands = [];
    let inCommands = false;
    for (const line of help.split("\n")) {
        if (/^Commands:/.test(line)) {
            inCommands = true;
            continue;
        }
        if (inCommands) {
            const match = line.match(/^ {2}([a-z][a-z-]*)\s/);
            if (match === null)
                break;
            commands.push(match[1]);
        }
    }
    return commands;
};
/**
 * A required memory operation has no counterpart in the installed CLI.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemoryCapabilityMissing extends Data.TaggedError("smithers-build/MemoryCapabilityMissing") {
    constructor(capability) {
        super({
            capability,
            message: `the smithers CLI has no \`memory ${capability}\` subcommand ` +
                `(it ships: ${memoryCliCommands.join(", ")}); this capability cannot run on this host`
        });
    }
}
/**
 * Checks whether a value is the missing-capability refusal.
 *
 * @category guards
 * @since 0.1.0
 */
export const isMemoryCapabilityMissing = (value) => value instanceof MemoryCapabilityMissing;
/**
 * Asserts one subcommand is in the shipped `smithers memory` surface.
 *
 * @category constructors
 * @since 0.1.0
 */
export const assertMemoryCliCommand = (subcommand) => {
    if (!memoryCliCommands.includes(subcommand))
        throw new MemoryCapabilityMissing(subcommand);
};
/**
 * The resolved backend ran and refused the retain.
 *
 * The message always names the argv; the body is stderr when the backend
 * wrote any, else stdout (smithers answers an unknown subcommand with exit
 * 4 and nothing on stderr), else an explicit "(no output)".
 *
 * @category errors
 * @since 0.1.0
 */
export class MemoryCommandFailed extends Data.TaggedError("smithers-build/MemoryCommandFailed") {
    constructor(exitCode, output) {
        const body = output.stderr.trim() !== ""
            ? output.stderr.trim()
            : output.stdout.trim() !== ""
                ? output.stdout.trim()
                : "(no output)";
        super({
            exitCode,
            stderr: output.stderr,
            stdout: output.stdout,
            args: output.args,
            message: `smithers ${output.args.join(" ")} exited ${exitCode}: ${body}`
        });
    }
}
/**
 * Checks whether a value is a backend command failure.
 *
 * @category guards
 * @since 0.1.0
 */
export const isMemoryCommandFailed = (value) => value instanceof MemoryCommandFailed;
const executableCandidates = (name) => Native.platform() === "win32" ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name];
/**
 * The default locator: scans PATH for an executable `smithers`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const pathLocator = (environment) => ({
    find: () => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* findOnPath(environment); }))
});
/** Scans PATH for an executable `smithers`. */
const findOnPath = Effect_1.fnUntraced(function* findOnPath(environment) {
    const path = environment["PATH"] ?? "";
    for (const directory of path.split(Native.delimiter())) {
        if (directory === "")
            continue;
        for (const candidate of executableCandidates("smithers")) {
            const absolute = Native.join(directory, candidate);
            const completion_1 = yield* runtime.$catch(Effect_1.fnUntraced(function* findOnPath$try() {
                if (yield* Native.executableFile(absolute))
                    return { kind: "return", value: absolute };
                return runtime.$normal;
            })(), Effect_1.fnUntraced(function* findOnPath$catch() {
                return runtime.$normal;
            }));
            if (completion_1.kind === "return")
                return completion_1.value;
        }
    }
    return undefined;
});
const subprocessEnvironment = (options) => Exec.toolEnvironment(Object.fromEntries(Object.entries(options.environment ?? Environment.ambientEnvironment()).filter((entry) => entry[1] !== undefined)), options.sensitiveNames ?? []);
const subprocessTimeout = (options) => {
    const timeout = options.timeoutMs ?? 60_000;
    if (!Number.isFinite(timeout) || timeout <= 0)
        throw new RangeError("Memory timeoutMs must be positive and finite");
    return timeout;
};
/**
 * The default runner: spawns the resolved binary with no shell.
 *
 * @category constructors
 * @since 0.1.0
 */
export const spawnCli = (options = {}) => ({
    run: (binary, args, cwd) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* runCli(options, binary, args, cwd); }))
});
/** One backend invocation of {@link spawnCli}. */
const runCli = Effect_1.fnUntraced(function* runCli(options, binary, args, cwd) {
    const timeout = subprocessTimeout(options);
    let stdout = "";
    let stderr = "";
    const completion_2 = yield* runtime.$catch(Effect_1.fnUntraced(function* runCli$try() {
        const exitCode = yield* Native.awaited(() => ContainedProcess.run({
            command: binary,
            args,
            cwd,
            maxOutputBytes: 8 * 1024 * 1024,
            signal: options.signal,
            timeoutMs: timeout,
            environment: subprocessEnvironment(options),
            stdout: (text) => {
                stdout += text;
            },
            stderr: (text) => {
                stderr += text;
            }
        }));
        return { kind: "return", value: { exitCode, stdout, stderr } };
    })(), Effect_1.fnUntraced(function* runCli$catch(cause) {
        if (!(cause instanceof ContainedProcess.ProcessError) || cause.code === "cleanup_failed")
            return yield* Effect_1.fail(cause);
        if (cause.code === "cancelled") {
            return yield* Effect_1.fail(Object.assign(new Error("memory subprocess aborted", { cause }), { code: "ABORT_ERR" }));
        }
        return { kind: "return", value: {
                exitCode: 1,
                stdout,
                stderr: cause.code === "timed_out"
                    ? `${stderr}\nsmithers memory timed out after ${timeout}ms`.trim()
                    : stderr || cause.message
            } };
    }));
    if (completion_2.kind === "return")
        return completion_2.value;
});
/** Resolves one git ref to its commit sha, readably failing otherwise. */
const gitResolveSource = Effect_1.fnUntraced(function* gitResolveSource(root, ref, options) {
    let stdout = "";
    let stderr = "";
    const completion_3 = yield* runtime.$catch(Effect_1.fnUntraced(function* gitResolveSource$try() {
        const exitCode = yield* Native.awaited(() => ContainedProcess.run({
            command: "git",
            args: ["rev-parse", "--verify", `${ref}^{commit}`],
            cwd: root,
            maxOutputBytes: 1024 * 1024,
            signal: options.signal,
            timeoutMs: subprocessTimeout(options),
            environment: { ...subprocessEnvironment(options), GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true" },
            stdout: (text) => {
                stdout += text;
            },
            stderr: (text) => {
                stderr += text;
            }
        }));
        if (exitCode !== 0)
            return yield* Effect_1.fail(new Error(stderr.trim() || `git exited ${exitCode}`));
        return { kind: "return", value: stdout.trim() };
    })(), Effect_1.fnUntraced(function* gitResolveSource$catch(cause) {
        const detail = cause instanceof ContainedProcess.ProcessError && cause.code === "cancelled"
            ? "git subprocess aborted" :
            cause instanceof Error
                ? cause.message
                : stderr.trim();
        return yield* Effect_1.fail(new Error(`cannot resolve ${ref} to a commit in ${root}: ${detail}`, { cause }));
    }));
    if (completion_3.kind === "return")
        return completion_3.value;
});
/**
 * Retains the referenced commit in the declared Smithers Cloud banks.
 *
 * The backend surface is the installed CLI's real command family
 * (`smithers memory get|list|rm|set`): a retained fact is one
 * `memory set <bank> commit:<sha> <record>` per declared bank, where the
 * sha comes from resolving the declared source ref in the workspace root
 * and the record is the structured JSON the declaration implies
 * (`{ source, commit, tags }`). Reading it back is
 * `smithers memory list <bank>`. The declaration's `init` and `autoInject`
 * options configure the bank's initialization script and agent-context
 * injection; neither gates a retain, so they are inert here. Any memory
 * operation the shipped CLI lacks is a typed
 * {@link MemoryCapabilityMissing} refusal naming the capability.
 *
 * @category execution
 * @since 0.1.0
 */
export const retain = (options) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* retainProgram(options); }));
/** The body of {@link retain}. */
const retainProgram = Effect_1.fnUntraced(function* retainProgram(options) {
    const attrs = MemoryTarget.retainAttrsOf(options.target);
    if (options.memory === undefined) {
        return yield* Effect_1.fail(new MemoryBackendUnavailable("no_backend_declared", "the WORKSPACE.ts declares no S.Memory.SmithersCloud backend"));
    }
    if (options.memory.bank.length === 0) {
        return yield* Effect_1.fail(new MemoryBackendUnavailable("no_backend_declared", "the S.Memory.SmithersCloud declaration names no bank to retain into"));
    }
    const locator = options.locator ?? pathLocator(options.environment ?? Environment.ambientEnvironment());
    const binary = yield* Native.awaited(() => locator.find());
    if (binary === undefined) {
        return yield* Effect_1.fail(new MemoryBackendUnavailable("cli_not_found", "the smithers CLI is not on PATH; install it or remove the memory declaration"));
    }
    const resolveSource = options.resolveSource ??
        ((root, ref) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* gitResolveSource(root, ref, options); })));
    const sha = yield* Native.awaited(() => resolveSource(options.root, attrs.source.ref));
    const key = `commit:${sha}`;
    const record = JSON.stringify({ source: attrs.source.ref, commit: sha, tags: attrs.tags });
    const cli = options.cli ?? spawnCli(options);
    assertMemoryCliCommand("set");
    const facts = [];
    for (const bank of options.memory.bank) {
        const args = ["memory", "set", bank, key, record];
        const output = yield* Native.awaited(() => cli.run(binary, args, options.root));
        if (output.exitCode !== 0) {
            return yield* Effect_1.fail(new MemoryCommandFailed(output.exitCode, { args, stdout: output.stdout, stderr: output.stderr }));
        }
        facts.push({ namespace: bank, key, args, stdout: output.stdout });
    }
    return { binary, facts };
});
