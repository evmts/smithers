import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { randomUUID as nodeRandomUUID } from "node:crypto";
import * as NodeFsModule from "node:fs";
import * as FsModule from "node:fs/promises";
import * as NodePathModule from "node:path";
import * as Diagnostic from "../Diagnostic.js";
import { executeEffect } from "./PackageRunner.js";
/** Promise-only I/O must settle its cleanup before its Effect releases ownership. */
export const joined = (run) => Effect.callback((resume, signal) => {
    const pending = run(signal);
    pending.then((value) => resume(Effect.succeed(value)), (cause) => resume(Effect.fail(cause)));
    return Effect.promise(() => pending.then(() => undefined, () => undefined));
});
/** The node:fs/promises calls, unchanged. */
export const Fs = {
    realpath: (path) => FsModule.realpath(path),
    mkdir: (path, options) => FsModule.mkdir(path, options),
    writeFile: (path, data, encoding) => FsModule.writeFile(path, data, encoding),
    readFile: (path, encoding) => FsModule.readFile(path, encoding),
    stat: (path) => FsModule.stat(path),
    lstat: (path) => FsModule.lstat(path),
    rm: (path, options) => FsModule.rm(path, options),
    chmod: (path, mode) => FsModule.chmod(path, mode),
    readdir: (path) => FsModule.readdir(path)
};
/** `JSON.parse(await Fs.readFile(path, "utf8"))`: a rejection or a parse error rejects. */
export const readJson = async (path) => JSON.parse(await FsModule.readFile(path, "utf8"));
/** The node:fs calls, unchanged. */
export const NodeFs = {
    realpathSync: (path) => NodeFsModule.realpathSync(path),
    existsSync: (path) => NodeFsModule.existsSync(path)
};
/** The node:path calls, unchanged. */
export const NodePath = {
    join: (...paths) => NodePathModule.join(...paths),
    normalize: (path) => NodePathModule.normalize(path),
    dirname: (path) => NodePathModule.dirname(path),
    basename: (path) => NodePathModule.basename(path),
    relative: (from, to) => NodePathModule.relative(from, to),
    isAbsolute: (path) => NodePathModule.isAbsolute(path),
    delimiter: NodePathModule.delimiter,
    sep: NodePathModule.sep,
    posix: {
        dirname: (path) => NodePathModule.posix.dirname(path),
        join: (...paths) => NodePathModule.posix.join(...paths)
    }
};
/** `randomUUID()` from node:crypto. */
export const randomUUID = () => nodeRandomUUID();
/** `process.env`. */
export const processEnv = () => process.env;
/** Writes to this process's own stdout or stderr pipe. */
export const writeProcess = (stream, text) => void (stream === "stdout" ? process.stdout : process.stderr).write(text);
/** `restore(Effect.suspend(() => body(scratch)))`, as PackageRunner.ts `inScratch` writes it. */
export const restoreSuspended = (restore, body, scratch) => restore(Effect.suspend(() => body(scratch)));
/** PackageRunner.ts `commitGateRunner`'s Promise boundary, unchanged. */
export const commitGateRunner = (label, signal, program) => ({
    run: async (gates, candidate) => {
        if (gates.length === 0)
            return [];
        const exit = await Effect.runPromiseExit(program(gates, candidate), { signal });
        if (Exit.isFailure(exit)) {
            throw new Error(`commit gates could not run: ${Diagnostic.describe(Cause.squash(exit.cause))}`);
        }
        const { outcome, escaped } = exit.value;
        if (escaped.length > 0) {
            return [
                ...outcome,
                {
                    target: label,
                    message: `a gate touched the real tree through a symlink (reverted): ${escaped.join(", ")}`
                }
            ];
        }
        return outcome;
    }
});
/** PackageRunner.ts `agentMessageComposer`'s Promise boundary, unchanged. */
export const agentMessageComposer = (signal, program) => ({
    compose: async ({ agent, stagedDiff }) => {
        const exit = await Effect.runPromiseExit(program(agent, stagedDiff), { signal });
        if (Exit.isFailure(exit)) {
            throw new Error(`agent message composition failed: ${Diagnostic.describe(Cause.squash(exit.cause))}`);
        }
        return exit.value;
    }
});
/** PackageRunner.ts `execute`, unchanged. */
export const execute = (planned, options) => Effect.runPromiseExit(executeEffect(planned, options), { signal: options.signal }).then((exit) => {
    if (Exit.isFailure(exit))
        throw Cause.squash(exit.cause);
    return exit.value;
});
