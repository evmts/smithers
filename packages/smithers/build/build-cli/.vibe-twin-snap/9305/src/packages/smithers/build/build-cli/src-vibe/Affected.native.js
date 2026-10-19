// A-2/E-4 (D38): `changedPaths` is an async boundary that runs git through
// ContainedProcess.run, so its body stays TypeScript, unchanged from Affected.ts.
// E-7: the node:path calls `select` and `globalPath` make (EK4402), one each.
import * as Path from "node:path";
import { AffectedGitError } from "./Affected.js";
import * as ContainedProcess from "./internal/ContainedProcess.js";
/** `Path.posix.basename(path)`. */
export const posixBasename = (path) => Path.posix.basename(path);
/** `Path.posix.isAbsolute(path)`. */
export const posixIsAbsolute = (path) => Path.posix.isAbsolute(path);
/** `Path.relative(from, to)`. */
export const relative = (from, to) => Path.relative(from, to);
/** `Path.isAbsolute(path)`. */
export const isAbsolute = (path) => Path.isAbsolute(path);
/** `changedPaths`, unchanged. */
export const changedPaths = async (root, options) => {
    if (options.signal?.aborted) {
        throw new AffectedGitError("cancelled", [], "affected discovery cancelled", options.signal.reason);
    }
    if (options.files !== undefined)
        return [...new Set(options.files)].sort();
    const timeoutMs = options.timeoutMs ?? 60_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 86_400_000) {
        throw new AffectedGitError("invalid_timeout", [], "git timeout must be an integer from 1 to 86400000ms");
    }
    const git = async (args) => {
        let stdout = "";
        let stderr = "";
        let code;
        try {
            code = await ContainedProcess.run({
                command: "git",
                args,
                cwd: root,
                signal: options.signal,
                environment: options.environment,
                timeoutMs,
                maxOutputBytes: 16 * 1024 * 1024,
                fatalUtf8: true,
                stdout: (text) => {
                    stdout += text;
                },
                stderr: (text) => {
                    stderr += text;
                }
            });
        }
        catch (cause) {
            throw new AffectedGitError(cause instanceof ContainedProcess.ProcessError ? cause.code : "process_failed", args, `git ${args[0]} failed: ${cause instanceof Error ? cause.message : String(cause)}`, cause);
        }
        if (code !== 0) {
            throw new AffectedGitError("nonzero_exit", args, `git ${args[0]} exited ${code}: ${stderr.trim()}`, {
                exitCode: code,
                stderr
            });
        }
        return stdout;
    };
    const gitPaths = async (args) => (await git(args)).split("\0").filter(Boolean);
    // Resolve user revisions before passing them to diff; a leading dash cannot become an option.
    const revision = async (ref) => (await git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).trim();
    const base = await revision(options.base);
    const paths = options.head === undefined
        ? [
            ...await gitPaths(["diff", "--name-only", "--no-renames", "-z", base, "--"]),
            ...await gitPaths(["ls-files", "--others", "--exclude-standard", "-z"])
        ]
        : await gitPaths(["diff", "--name-only", "--no-renames", "-z", base, await revision(options.head), "--"]);
    return [...new Set(paths)].sort();
};
