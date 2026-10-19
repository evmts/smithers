// E-7 (EK4402): git rev-parse through node:child_process, and node:path, are platform calls
// that GitHooks.vibe does not make directly; each is the GitHooks.ts expression, unchanged.
// A-2/E-4 (D38): `check` and `install` hand Promises to TypeScript callers; runAsync is the
// runner boundary that runs their VibeLang bodies.
import * as Effect from "effect/Effect";
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
/** Runs one `git rev-parse` query in the root and returns its single line. */
export const revParse = (root, args) => new Promise((resolve, reject) => {
    NodeChildProcess.execFile("git", ["rev-parse", ...args], { cwd: root, timeout: 10_000, maxBuffer: 64 * 1024 }, (error, stdout) => {
        if (error !== null)
            reject(error);
        else
            resolve(stdout.replace(/\r?\n$/, ""));
    });
});
export const relative = (from, to) => NodePath.relative(from, to);
export const isAbsolute = (path) => NodePath.isAbsolute(path);
export const resolve = (...paths) => NodePath.resolve(...paths);
export const join = (...paths) => NodePath.join(...paths);
export const dirname = (path) => NodePath.dirname(path);
export const basename = (path) => NodePath.basename(path);
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(Effect.suspend(program));
