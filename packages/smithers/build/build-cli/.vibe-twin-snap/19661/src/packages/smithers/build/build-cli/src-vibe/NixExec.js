/**
 * Resolves a declared Nix environment to the closure its tools run from.
 *
 * A `S.Nix.Environment` names a flake and lock, or a Nix expression file. This
 * module turns that declaration into what the planner and the executor need:
 * the store path the environment evaluates to, the store hash that names it
 * in key material, the `PATH` a tool spawns with, the exported variables tools
 * need to run from the closure, and the transitive store closure a sandbox
 * may bind-mount as the toolchain read set.
 *
 * Resolution is fail-closed. A host without `nix`, a flake without its lock,
 * an evaluation that fails, or a closure that does not satisfy a declared
 * runtime version is a typed {@link NixEnvironmentError}, never a fallback to
 * whatever the host has on `PATH`.
 *
 * Evaluation runs once per declaration per process and its result is memoized
 * under the workspace cache directory, keyed on the declared inputs' digests,
 * the host system, and the `nix` version. A memoized entry is reused only
 * while its store path still exists on the host.
 *
 * @since 0.1.0
 */
import * as Nix from "@smthrs/targets/Nix";
import * as Data from "effect/Data";
import * as NodePath from "node:path";
import * as Native from "./NixExec.native.js";
/**
 * A declared Nix environment that cannot be resolved or does not satisfy the
 * workspace's declarations.
 *
 * @category errors
 * @since 0.1.0
 */
export class NixEnvironmentError extends Data.TaggedError("smithers-build/NixEnvironmentError") {
    constructor(code, message) {
        super({ code, message });
    }
}
/**
 * The exported variables carried from the closure into every tool spawn.
 *
 * `PATH` is handled on its own. The rest are the variables that tell a
 * closure's `curl`, `git`, and libc where the certificate bundle, the locale
 * archive, and the time zone database live; without them those programs
 * look in FHS paths the closure does not populate.
 *
 * @category constants
 * @since 0.1.0
 */
export const carriedVariables = Object.freeze([
    "SSL_CERT_FILE",
    "NIX_SSL_CERT_FILE",
    "GIT_SSL_CAINFO",
    "LOCALE_ARCHIVE",
    "TZDIR",
    "NIX_LD",
    "NIX_LD_LIBRARY_PATH"
]);
/**
 * Maps the host to the Nix system name a flake is evaluated for.
 *
 * @category accessors
 * @since 0.1.0
 */
export const hostSystem = (platform = Native.platform(), arch = Native.arch()) => {
    const cpu = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : arch;
    const os = platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : platform;
    return `${cpu}-${os}`;
};
/**
 * Resolves one declared environment on this host.
 *
 * @category resolution
 * @since 0.1.0
 */
export const resolveEnvironment = Native.resolveEnvironment;
/**
 * The exec-layer environment one resolved closure supplies.
 *
 * @category accessors
 * @since 0.1.0
 */
export const toolEnvironment = (resolved) => ({
    path: resolved.path.join(NodePath.delimiter),
    variables: resolved.variables
});
/**
 * A host environment copy whose `PATH` is the closure's, for executable
 * lookups that read a whole environment record.
 *
 * @category accessors
 * @since 0.1.0
 */
export const hostEnvironmentWith = (resolved, source) => Object.freeze({ ...source, ...resolved.variables, PATH: resolved.path.join(NodePath.delimiter) });
/**
 * The layer identity a resolved environment contributes to key material.
 *
 * @category accessors
 * @since 0.1.0
 */
export const layer = (resolved) => `nix:${resolved.hash}`;
const compareVersions = (left, right) => {
    const a = left.split(".").map(Number);
    const b = right.split(".").map(Number);
    for (let index = 0; index < 3; index += 1) {
        const difference = (a[index] ?? 0) - (b[index] ?? 0);
        if (difference !== 0)
            return difference;
    }
    return 0;
};
/**
 * Reports whether a measured version satisfies a declared requirement of the
 * two forms declarations use: `>=x.y.z`, or an exact `x.y.z`.
 *
 * @category accessors
 * @since 0.1.0
 */
export const satisfies = (measured, requirement) => {
    const trimmed = requirement.trim();
    if (trimmed === "" || trimmed === ">=0.0.0")
        return true;
    if (trimmed.startsWith(">="))
        return compareVersions(measured, trimmed.slice(2).trim()) >= 0;
    return compareVersions(measured, trimmed) === 0;
};
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
export const assertToolVersion = Native.assertToolVersion;
