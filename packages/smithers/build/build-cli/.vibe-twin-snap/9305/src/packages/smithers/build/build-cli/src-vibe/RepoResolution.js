/**
 * Plan-time resolution of opaque local-repository target edges.
 *
 * Child declarations never enter the parent module graph. Resolution invokes
 * this same CLI in the child directory, parses its JSON query result, and
 * reduces every failure to data carried by the parent target.
 *
 * @since 0.1.0
 */
import * as RepoTarget from "@smthrs/targets/RepoTarget";
import * as Target from "@smthrs/targets/Target";
import * as Data from "effect/Data";
import * as Host from "./native-hatch.js";
import * as Native from "./RepoResolution.native.js";
import * as Workspace from "./Workspace.js";
/**
 * The source entry point every child invocation executes.
 *
 * @category constants
 * @since 0.1.0
 */
export const buildCliPath = Host.join("/Users/williamcory/smithers-vibe-twins/packages/smithers/build/build-cli/src", "main.js");
/**
 * A child CLI execution failed after streaming its output.
 *
 * @category errors
 * @since 0.1.0
 */
export class ExecutionError extends Data.TaggedError("smithers-build/ExecutionError") {
    constructor(resolution, exitCode, stderrTail) {
        super({
            code: "repo_target_failed",
            exitCode,
            stderrTail,
            message: `child target ${resolution.externalLabel} failed with exit ${exitCode}${stderrTail === "" ? "" : `\n${stderrTail}`}`
        });
    }
}
/**
 * One operation's view of the workspace's child repositories: the index, the
 * environment every child spawn inherits, and the memoized resolutions keyed
 * by target identity.
 *
 * The environment is scrubbed on construction, so no child repository ever
 * inherits the parent's remote-cache credentials. Only `resolver` builds one.
 *
 * @category models
 * @since 0.1.0
 */
export class Resolver {
    index;
    environment;
    cache = new Map();
    constructor(index, environment) {
        this.index = index;
        this.environment = environment;
    }
    /** @internal */
    static make(index, environment) {
        return new Resolver(index, environment);
    }
}
/**
 * Builds the resolver one operation shares. `ambient` is the caller's host
 * environment; the default cache names and every credential name the
 * workspace declares are withheld from it before any child sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolver = (index, ambient) => Resolver.make(index, Workspace.withheldEnvironment(ambient, Workspace.remoteCacheOf(index.workspace.cache.remote)?.credentials));
const diagnosticTail = 8 * 1024;
const tail = (value) => value.length <= diagnosticTail ? value : value.slice(value.length - diagnosticTail);
const kindNames = new Set(["build", "test", "lint", "run", "docs", "review"]);
const repositoryOf = (index, value) => {
    const repositories = Object.entries(index.workspace.repos ?? {});
    if (typeof value === "string") {
        const declaration = index.workspace.repos?.[value];
        return declaration === undefined ? undefined : { name: value, path: declaration.path };
    }
    const found = repositories.find(([, declaration]) => declaration.path === value.path);
    return found === undefined ? undefined : { name: found[0], path: found[1].path };
};
const refused = (index, attrs, message) => ({
    repoName: typeof attrs.repo === "string" ? attrs.repo : "unknown",
    repoPath: typeof attrs.repo === "string" ? attrs.repo : attrs.repo.path,
    absolutePath: index.root,
    label: attrs.label,
    args: attrs.args ?? [],
    kinds: [],
    refusal: message,
    externalLabel: `@${typeof attrs.repo === "string" ? attrs.repo : "unknown"}${attrs.label}`
});
/** The plain helpers the child-process boundary in RepoResolution.native.ts uses. */
const helpers = { tail, kindNames, repositoryOf, refused };
/**
 * Resolves one repository target, memoized within the caller's operation.
 *
 * @category resolution
 * @since 0.1.0
 */
export const resolve = (resolver, target, signal) => {
    const existing = resolver.cache.get(target);
    if (existing !== undefined)
        return existing;
    const pending = Native.query(resolver, target, signal, helpers);
    resolver.cache.set(target, pending);
    return pending;
};
/**
 * Returns a target's effective kinds, mirroring a repository target through
 * Alias while leaving every ordinary target unchanged.
 *
 * @category resolution
 * @since 0.1.0
 */
export const effectiveKinds = (resolver, target, signal) => Native.effectiveKinds(resolver, target, signal);
/**
 * Reads the commit and dirty status used by one child execution key.
 *
 * @category resolution
 * @since 0.1.0
 */
export const gitState = (resolver, resolution, signal) => Native.gitState(resolver, resolution, signal, helpers);
/**
 * Executes one repository target through this CLI, under the resolver's
 * scrubbed environment, and streams both output
 * pipes to `output` while retaining a bounded diagnostic tail. `output`
 * defaults to the parent process streams; a run passes its reporter so an
 * injected terminal receives the child's output.
 *
 * @category execution
 * @since 0.1.0
 */
export const execute = (resolver, resolution, options = {}) => Native.execute(resolver, resolution, options, helpers);
