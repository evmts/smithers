// A-2/E-4 (D38) and E-7: the child-repository queries and executions are Promise
// boundaries over node:child_process, so `runProcess`, `query`, `effectiveKinds`, `gitState`
// and `execute` stay TypeScript, unchanged from RepoResolution.ts. RepoResolution.vibe keeps
// the declarations, the memo, and the plain helpers, which arrive as `Helpers`.
import * as Redaction from "@smthrs/journal/Redaction";
import * as RepoTarget from "@smthrs/targets/RepoTarget";
import * as Target from "@smthrs/targets/Target";
import { spawn } from "node:child_process";
import * as NodePath from "node:path";
import { StringDecoder } from "node:string_decoder";
import { buildCliPath, ExecutionError, resolve } from "./RepoResolution.js";
const maximumOutputBytes = 1024 * 1024;
/** Runs one bounded child process without a shell. */
const runProcess = (cwd, argv, env, signal) => new Promise((resolve, reject) => {
    const [command, ...args] = argv;
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let settled = false;
    const finish = (operation) => {
        if (settled)
            return;
        settled = true;
        signal?.removeEventListener("abort", abort);
        operation();
    };
    const abort = () => {
        child.kill("SIGKILL");
        finish(() => reject(signal?.reason ?? new Error("child process aborted")));
    };
    const append = (target) => (chunk) => {
        if (settled)
            return;
        bytes += chunk.length;
        if (bytes > maximumOutputBytes) {
            child.kill("SIGKILL");
            finish(() => reject(new Error(`child CLI output exceeds ${maximumOutputBytes} bytes`)));
            return;
        }
        target.push(chunk);
    };
    child.stdout.on("data", append(stdout));
    child.stderr.on("data", append(stderr));
    child.on("error", (cause) => finish(() => reject(cause)));
    child.on("close", (code) => finish(() => resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
    })));
    if (signal?.aborted === true)
        abort();
    else
        signal?.addEventListener("abort", abort, { once: true });
});
/** `query`, unchanged. */
export const query = async (resolver, target, signal, { kindNames, refused, repositoryOf, tail }) => {
    const index = resolver.index;
    const attrs = RepoTarget.attrsOf(target);
    const repository = repositoryOf(index, attrs.repo);
    if (repository === undefined) {
        return refused(index, attrs, `Repo.Target repository ${typeof attrs.repo === "string" ? JSON.stringify(attrs.repo) : JSON.stringify(attrs.repo.path)} is not declared in Workspace repos`);
    }
    const absolutePath = NodePath.join(index.root, ...repository.path.split("/"));
    const base = {
        repoName: repository.name,
        repoPath: repository.path,
        absolutePath,
        label: attrs.label,
        args: attrs.args ?? [],
        externalLabel: `@${repository.name}${attrs.label}`
    };
    try {
        const result = await runProcess(absolutePath, [process.execPath, buildCliPath, "query", attrs.label, "--workspace", absolutePath, "--format", "json"], resolver.environment, signal);
        if (result.exitCode !== 0) {
            const detail = tail((result.stderr.trim() || result.stdout.trim()) || `exit ${result.exitCode}`);
            return { ...base, kinds: [], refusal: `child repository @${repository.name} refused ${attrs.label}: ${detail}` };
        }
        const decoded = JSON.parse(result.stdout);
        const targets = typeof decoded === "object" && decoded !== null && "targets" in decoded
            ? decoded.targets
            : undefined;
        const row = Array.isArray(targets)
            ? targets.find((entry) => typeof entry === "object" && entry !== null &&
                entry.label === attrs.label)
            : undefined;
        const rawKinds = typeof row === "object" && row !== null && "kinds" in row
            ? row.kinds
            : undefined;
        if (!Array.isArray(rawKinds) || !rawKinds.every((kind) => typeof kind === "string" && kindNames.has(kind))) {
            return {
                ...base,
                kinds: [],
                refusal: `child repository @${repository.name} query returned no valid target row for ${attrs.label}`
            };
        }
        return { ...base, kinds: rawKinds, refusal: undefined };
    }
    catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return {
            ...base,
            kinds: [],
            refusal: `child repository @${repository.name} could not query ${attrs.label}: ${tail(message)}`
        };
    }
};
/** `effectiveKinds`, unchanged. */
export const effectiveKinds = async (resolver, target, signal) => {
    const metadata = Target.metadata(target);
    if (metadata.target === "Repo.Target")
        return (await resolve(resolver, target, signal)).kinds;
    if (metadata.target === "Alias" && metadata.dependencies[0] !== undefined) {
        return effectiveKinds(resolver, metadata.dependencies[0], signal);
    }
    return metadata.kinds;
};
/** `gitState`, unchanged. */
export const gitState = async (resolver, resolution, signal, { tail }) => {
    const head = await runProcess(resolution.absolutePath, ["git", "-C", resolution.absolutePath, "rev-parse", "HEAD"], resolver.environment, signal);
    if (head.exitCode !== 0)
        throw new Error(`could not read child repository HEAD: ${tail(head.stderr || head.stdout)}`);
    const status = await runProcess(resolution.absolutePath, ["git", "-C", resolution.absolutePath, "status", "--porcelain"], resolver.environment, signal);
    if (status.exitCode !== 0) {
        throw new Error(`could not read child repository status: ${tail(status.stderr || status.stdout)}`);
    }
    return { head: head.stdout.trim(), dirty: status.stdout !== "", status: status.stdout };
};
/** `execute`, unchanged. */
export const execute = (resolver, resolution, options, { tail }) => new Promise((resolve, reject) => {
    const args = [
        buildCliPath,
        resolution.label,
        "--workspace",
        resolution.absolutePath,
        ...(options.write === true ? ["--write"] : []),
        ...(options.plan === true ? ["--plan"] : []),
        ...resolution.args
    ];
    const child = spawn(process.execPath, args, {
        cwd: resolution.absolutePath,
        detached: true,
        env: { ...resolver.environment, ...options.environment, SMTHRS_REPO_CHILD: "1" },
        stdio: ["ignore", "pipe", "pipe"]
    });
    let stderrTail = "";
    let settled = false;
    const finish = (operation) => {
        if (settled)
            return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        operation();
    };
    const kill = () => {
        if (child.pid !== undefined) {
            try {
                process.kill(-child.pid, "SIGKILL");
                return;
            }
            catch {
                // Fall through on hosts without process-group signals.
            }
        }
        child.kill("SIGKILL");
    };
    const abort = () => {
        kill();
        finish(() => reject(options.signal?.reason ?? new Error("child target aborted")));
    };
    const output = options.output ??
        ((stream, chunk) => void (stream === "stdout" ? process.stdout : process.stderr).write(chunk));
    // Child output is redacted a complete line at a time with the diagnostic
    // rules, holding a value that spans lines until it closes; the failure's
    // stderr tail is cut from the redacted text, never from the raw bytes.
    const redacted = (stream) => {
        const decoder = new StringDecoder("utf8");
        // The redactor owns the line still arriving and bounds an overlong one.
        const redactor = Redaction.lineRedactor(Redaction.diagnosticRules);
        const emit = (lines) => {
            if (lines.length === 0)
                return;
            const text = `${lines.join("\n")}\n`;
            output(stream, text);
            if (stream === "stderr")
                stderrTail = tail(stderrTail + text);
        };
        const consume = (text) => {
            const segments = text.split("\n");
            const last = segments.pop();
            emit(segments.flatMap((segment) => redactor.line(segment)));
            if (last !== "")
                redactor.part(last);
        };
        return {
            write: (chunk) => consume(decoder.write(chunk)),
            end: () => {
                consume(decoder.end());
                emit(redactor.flush());
            }
        };
    };
    const stdout = redacted("stdout");
    const stderr = redacted("stderr");
    child.stdout.on("data", stdout.write);
    child.stderr.on("data", stderr.write);
    child.on("error", (cause) => finish(() => reject(cause)));
    child.on("close", (code) => finish(() => {
        stdout.end();
        stderr.end();
        const exitCode = code ?? -1;
        if (exitCode === 0)
            resolve();
        else
            reject(new ExecutionError(resolution, exitCode, stderrTail.trim()));
    }));
    if (options.signal?.aborted === true)
        abort();
    else
        options.signal?.addEventListener("abort", abort, { once: true });
});
