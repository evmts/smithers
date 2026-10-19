// E-4/E-5 and E-7: NixExec.ts's Promise-returning resolution (resolveEnvironment, assertToolVersion)
// that TypeScript callers and tests await, built on node:child_process, node:fs/promises,
// node:crypto and process, with the memo and in-flight maps they share. VibeLang keeps async
// functions and platform calls out of .vibe files, so these operations and their private helpers
// stay TypeScript, verbatim from NixExec.ts. NixExec.vibe holds the types, the error and the plain
// accessors, and rebinds these exports.
import * as Input from "@smthrs/targets/Input";
import * as Nix from "@smthrs/targets/Nix";
import * as NodeChildProcess from "node:child_process";
import { createHash } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
import * as Environment from "./Environment.js";
import { carriedVariables, hostSystem, NixEnvironmentError, satisfies } from "./NixExec.js";
import * as PackageTree from "./PackageTree.js";
/** `process.platform`, the default of NixExec.vibe's `hostSystem`. */
export const platform = () => process.platform;
/** `process.arch`, the default of NixExec.vibe's `hostSystem`. */
export const arch = () => process.arch;
/**
 * A store path: an absolute directory whose basename is a 32-character Nix
 * hash and a name. `/nix/store` is the default store; a relocated store root
 * (`nix --store`) produces the same shape elsewhere.
 */
const storePathShape = /^\/.*\/([0-9a-df-np-sv-z]{32})-[^/\s]+$/;
const maximumOutputBytes = 16 * 1024 * 1024;
const execFile = (executable, args, options) => new Promise((resolve, reject) => {
    NodeChildProcess.execFile(executable, [...args], {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: maximumOutputBytes,
        encoding: "utf8",
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs })
    }, (error, stdout, stderr) => {
        if (error !== null && !("code" in error && typeof error.code === "number")) {
            reject(error);
            return;
        }
        const exitCode = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolve({ stdout: String(stdout), stderr: String(stderr), exitCode });
    });
});
/** The last non-empty line of a tool's standard output. */
const lastLine = (text) => {
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line !== "");
    return lines[lines.length - 1] ?? "";
};
/** The tail of a tool's standard error, bounded for a diagnostic. */
const tail = (text, bytes = 4 * 1024) => {
    const trimmed = text.trim();
    return trimmed.length <= bytes ? trimmed : trimmed.slice(trimmed.length - bytes);
};
/** The store hash of one store path, or undefined for a path outside the store. */
const storeHash = (path) => storePathShape.exec(path)?.[1];
/** The `nix` invocation prefix: the experimental features every command below needs. */
const nixArguments = (args) => [
    "--extra-experimental-features",
    "nix-command flakes",
    ...args
];
/**
 * The installable arguments that name the declared environment for `nix
 * build` and `nix print-dev-env`, resolved against the workspace root.
 */
const installable = (root, declaration, system) => {
    if (declaration.file !== undefined) {
        return ["--file", NodePath.join(root, Input.resolvePath("", declaration.file.path))];
    }
    const directory = Nix.flakeDirectory(declaration);
    const attribute = Nix.outputAttribute(declaration, system) ?? `devShells.${system}.default`;
    return [`${directory === "" ? root : NodePath.join(root, directory)}#${attribute}`];
};
const digestInputs = async (root, declaration, signal) => {
    const inputs = [];
    for (const file of Nix.environmentInputs(declaration)) {
        const relative = Input.resolvePath("", file.path);
        const digest = await Input.digestFile(NodePath.join(root, relative), { workspaceRoot: root, signal });
        if (digest === undefined) {
            const hint = relative.endsWith("flake.lock")
                ? "; run `nix flake lock` and commit the lock so the environment is reproducible"
                : "";
            throw new NixEnvironmentError("nix_input_missing", `Nix environment input ${relative} does not exist${hint}`);
        }
        inputs.push({ path: relative, digest });
    }
    return inputs;
};
const memoKey = (inputs, declaration, system, nixVersion) => createHash("sha256")
    .update(JSON.stringify({
    inputs,
    attr: declaration.attr ?? null,
    file: declaration.file?.path ?? null,
    system,
    nixVersion
}))
    .digest("hex");
const memoPath = (root, cacheDirectory, key) => NodePath.join(root, cacheDirectory, "nix", `${key}.json`);
const readMemo = async (path) => {
    let text;
    try {
        text = await Fs.readFile(path, "utf8");
    }
    catch {
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    if (typeof parsed !== "object" || parsed === null)
        return undefined;
    const value = parsed;
    if (typeof value.storePath !== "string" || storeHash(value.storePath) !== value.hash ||
        !Array.isArray(value.closure) || !Array.isArray(value.path) || typeof value.variables !== "object")
        return undefined;
    try {
        await Fs.access(value.storePath);
    }
    catch {
        return undefined;
    }
    return value;
};
const writeMemo = async (path, resolved) => {
    await Fs.mkdir(NodePath.dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await Fs.writeFile(temporary, JSON.stringify(resolved), "utf8");
    await Fs.rename(temporary, path);
};
const inFlight = new Map();
/**
 * Resolves one declared environment on this host.
 *
 * @category resolution
 * @since 0.1.0
 */
export const resolveEnvironment = async (options) => {
    const hostEnvironment = options.environment ?? Environment.ambientEnvironment();
    const nix = PackageTree.findOnPath("nix", hostEnvironment);
    if (nix === undefined) {
        throw new NixEnvironmentError("nix_absent", "the workspace declares a Nix environment but `nix` is not present on PATH; " +
            "install Nix (https://nixos.org/download) or remove the S.Nix.Environment declaration");
    }
    const inputs = await digestInputs(options.root, options.declaration, options.signal);
    const system = hostSystem();
    const version = await execFile(nix, ["--version"], {
        cwd: options.root,
        env: hostEnvironment,
        signal: options.signal,
        timeoutMs: 30_000
    });
    if (version.exitCode !== 0) {
        throw new NixEnvironmentError("nix_evaluation_failed", `nix --version failed: ${tail(version.stderr)}`);
    }
    const nixVersion = lastLine(version.stdout);
    const key = memoKey(inputs, options.declaration, system, nixVersion);
    const running = inFlight.get(key);
    if (running !== undefined)
        return running;
    const work = (async () => {
        const memo = options.cacheDirectory === undefined
            ? undefined
            : memoPath(options.root, options.cacheDirectory, key);
        if (memo !== undefined) {
            const known = await readMemo(memo);
            if (known !== undefined)
                return known;
        }
        const target = installable(options.root, options.declaration, system);
        options.log?.(`nix environment: evaluating ${target.join(" ")}`);
        const built = await execFile(nix, nixArguments(["build", "--no-link", "--print-out-paths", "--no-write-lock-file", ...target]), { cwd: options.root, env: hostEnvironment, signal: options.signal });
        if (built.exitCode !== 0) {
            throw new NixEnvironmentError("nix_evaluation_failed", `nix build failed for the declared environment (exit ${built.exitCode}): ${tail(built.stderr)}`);
        }
        const storePath = lastLine(built.stdout);
        const hash = storeHash(storePath);
        if (hash === undefined) {
            throw new NixEnvironmentError("nix_evaluation_failed", `nix build printed no store path for the declared environment: ${JSON.stringify(storePath)}`);
        }
        const printed = await execFile(nix, nixArguments(["print-dev-env", "--json", ...target]), { cwd: options.root, env: hostEnvironment, signal: options.signal });
        if (printed.exitCode !== 0) {
            throw new NixEnvironmentError("nix_evaluation_failed", `nix print-dev-env failed for the declared environment (exit ${printed.exitCode}): ${tail(printed.stderr)}`);
        }
        let variables = {};
        let path = [];
        try {
            const parsed = JSON.parse(printed.stdout);
            const exported = parsed.variables ?? {};
            const pathEntry = exported["PATH"];
            if (pathEntry !== undefined && typeof pathEntry.value === "string") {
                path = pathEntry.value.split(NodePath.delimiter).filter((entry) => entry !== "");
            }
            for (const name of carriedVariables) {
                const entry = exported[name];
                if (entry !== undefined && typeof entry.value === "string" && entry.value !== "") {
                    variables[name] = entry.value;
                }
            }
        }
        catch {
            throw new NixEnvironmentError("nix_environment_incomplete", "nix print-dev-env printed no readable JSON");
        }
        if (path.length === 0) {
            throw new NixEnvironmentError("nix_environment_incomplete", "the declared environment exports no PATH; a dev shell or buildEnv with at least one package is required");
        }
        const closureListing = await execFile(nix, nixArguments(["path-info", "--recursive", storePath]), { cwd: options.root, env: hostEnvironment, signal: options.signal });
        if (closureListing.exitCode !== 0) {
            throw new NixEnvironmentError("nix_evaluation_failed", `nix path-info failed for ${storePath}: ${tail(closureListing.stderr)}`);
        }
        const closure = closureListing.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "").sort();
        variables = Object.freeze(variables);
        const resolved = {
            storePath,
            hash,
            closure,
            path,
            variables,
            nix: { executable: nix, version: nixVersion },
            system,
            inputs
        };
        if (memo !== undefined) {
            try {
                await writeMemo(memo, resolved);
            }
            catch (cause) {
                options.log?.(`nix environment: could not memoize the resolution: ${String(cause)}`);
            }
        }
        return resolved;
    })();
    inFlight.set(key, work);
    try {
        return await work;
    }
    finally {
        inFlight.delete(key);
    }
};
/** Parses a version out of `--version` output: the first `x.y.z` it contains. */
const parseVersion = (text) => /(\d+)\.(\d+)\.(\d+)/.exec(text)?.[0];
const measured = new Map();
/**
 * Asserts that one tool the closure supplies satisfies the version the
 * workspace declared for it.
 *
 * The tool is looked up on the closure's `PATH` alone. An absent tool and a
 * version outside the requirement are both {@link NixEnvironmentError}s that
 * name the declaration and what the closure provides.
 *
 * @category resolution
 * @since 0.1.0
 */
export const assertToolVersion = async (resolved, tool, options) => {
    const executable = tool.executable ?? tool.name;
    const environment = { PATH: resolved.path.join(NodePath.delimiter) };
    const found = PackageTree.findOnPath(executable, environment);
    if (found === undefined) {
        throw new NixEnvironmentError("nix_tool_absent", `the declared Nix environment provides no ${JSON.stringify(executable)}; ` +
            `the workspace declares ${tool.name} ${tool.requirement}`);
    }
    const key = `${resolved.hash}\0${found}`;
    let probe = measured.get(key);
    if (probe === undefined) {
        probe = execFile(found, ["--version"], {
            cwd: options.root,
            env: { ...resolved.variables, PATH: environment.PATH },
            signal: options.signal,
            timeoutMs: 30_000
        }).then((output) => {
            const version = parseVersion(`${output.stdout}\n${output.stderr}`);
            if (output.exitCode !== 0 || version === undefined) {
                throw new NixEnvironmentError("nix_tool_absent", `${found} --version did not report a version (exit ${output.exitCode}): ${tail(output.stderr)}`);
            }
            return version;
        });
        measured.set(key, probe);
    }
    const version = await probe;
    if (!satisfies(version, tool.requirement)) {
        throw new NixEnvironmentError("nix_version_mismatch", `the workspace declares ${tool.name} ${tool.requirement} but the Nix environment provides ${tool.name} ${version} (${found})`);
    }
    return version;
};
