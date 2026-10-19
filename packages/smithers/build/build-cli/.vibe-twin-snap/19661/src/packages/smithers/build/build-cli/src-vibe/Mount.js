/**
 * Mount materialization: run an overlay repository's automation against an
 * upstream repository it never forks.
 *
 * An overlay repository's `.smithers/config.ts` default-exports `S.Mounts`.
 * A command run from the overlay materializes the named mount before it
 * plans: it fetches the pinned upstream commit into `.mounts/<name>` at the
 * overlay root, applies the declared patches as commits on top of the pin,
 * and lays the overlay's `.smithers/` over the checkout. The command then
 * plans against the checkout, so every `//` label and every relative upstream
 * config resolves as if the overlay's `.smithers/` lived upstream.
 *
 * The checkout is derived state. Materialization never discards work: edits
 * to upstream files survive while the pin and patches hold still and block a
 * re-materialization that would replace them, and an edit to a laid
 * `.smithers/` file blocks the next lay. The upstream repository is only ever
 * read. See `docs/concepts/mounts.md` for the design and its alternatives.
 *
 * @since 1.0.0
 */
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { exit } from "effect/Effect";
import * as Effect_1 from "effect/Effect";
import * as runtime from "vibelang-runtime";
import * as MountDeclaration from "@smthrs/targets/Mount";
import * as Data from "effect/Data";
import * as Diagnostic from "./Diagnostic.js";
import { importDeclarationModule } from "./effect-resolution.js";
import * as Native from "./Mount.native.js";
import * as PackageDiscovery from "./PackageDiscovery.js";
/**
 * The overlay-relative directory every checkout lives under.
 *
 * @category constants
 * @since 1.0.0
 */
export const checkoutsDirectory = ".mounts";
/**
 * The receipt a checkout's `.git` directory holds, naming what was
 * materialized so the next command can tell whether anything moved.
 *
 * @category constants
 * @since 1.0.0
 */
export const receiptFile = "smithers-mount.json";
/**
 * Why a mount could not be materialized.
 *
 * - `mount_config_invalid`: `.smithers/config.ts` failed to evaluate, does
 *   not default-export `S.Mounts`, or names a missing patch file.
 * - `mount_ambiguous`: the overlay declares several mounts and the command
 *   did not name one.
 * - `mount_fetch_failed`: the pinned commit could not be fetched.
 * - `mount_drift`: the drift policy refused the tracked branch's state.
 * - `mount_patch_failed`: a declared patch does not apply to its base.
 * - `mount_dirty`: re-materializing would discard edits in the checkout.
 * - `mount_overlay_edited`: a laid `.smithers/` file was edited in the
 *   checkout, so laying the overlay again would discard the edit.
 * - `mount_overlay_collision`: an overlay file would replace a file the
 *   upstream repository tracks.
 *
 * @category errors
 * @since 1.0.0
 */
export class MountError extends Data.TaggedError("smithers-build/MountError") {
}
const posix = (path) => path.split(Native.sep()).join("/");
const short = (commit) => commit.slice(0, 12);
/** Whether `path` is `parent` or lies beneath it. */
const within = (parent, path) => {
    const relative = Native.relative(parent, path);
    return relative === "" || (!relative.startsWith("..") && !Native.isAbsolute(relative));
};
const tail = (text) => {
    const trimmed = text.trim();
    return trimmed.length <= 2048 ? trimmed : trimmed.slice(trimmed.length - 2048);
};
class GitFailure extends Error {
}
/** Runs one git command without a shell and never prompts for credentials. */
const git = Effect_1.fnUntraced(function* git(cwd, args, options) {
    const completion_1 = yield* runtime.$catch(Effect_1.fnUntraced(function* git$try() {
        return { kind: "return", value: yield* Native.executeFileText("git", args, {
                cwd,
                env: { ...options.environment, GIT_TERMINAL_PROMPT: "0" },
                maxBuffer: 64 * 1024 * 1024,
                signal: options.signal
            }) };
    })(), Effect_1.fnUntraced(function* git$catch(cause) {
        const failed = cause;
        return yield* Effect_1.fail(new GitFailure(`git ${args[0]} failed: ${tail(String(failed.stderr || failed.message || cause))}`));
    }));
    if (completion_1.kind === "return")
        return completion_1.value;
});
/** The nearest ancestor of `start` whose `.smithers/` holds `config.ts`. */
const overlayRootOf = Effect_1.fnUntraced(function* overlayRootOf(start) {
    let directory = start;
    while (true) {
        if (yield* Native.isFile(Native.join(directory, ".smithers", "config.ts")))
            return directory;
        const parent = Native.dirname(directory);
        if (parent === directory)
            return undefined;
        directory = parent;
    }
});
/**
 * Evaluates an overlay's `.smithers/config.ts` and returns its mounts.
 *
 * @category loading
 * @since 1.0.0
 */
export const loadConfig = (overlayRoot) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* loadConfigProgram(overlayRoot); }));
/** The body of {@link loadConfig}. */
const loadConfigProgram = Effect_1.fnUntraced(function* loadConfigProgram(overlayRoot) {
    let namespace;
    yield* runtime.$catch(Effect_1.fnUntraced(function* loadConfigProgram$try() {
        namespace = yield* Native.awaited(() => importDeclarationModule(Native.fileUrl(Native.join(overlayRoot, ".smithers", "config.ts")), "file:///Users/williamcory/smithers-vibe-twins/packages/smithers/build/build-cli/src/Mount.ts"));
    })(), Effect_1.fnUntraced(function* loadConfigProgram$catch(cause) {
        return yield* Effect_1.fail(new MountError({
            code: "mount_config_invalid",
            message: `evaluating .smithers/config.ts failed: ${Diagnostic.describe(cause)}`
        }));
    }));
    const value = typeof namespace === "object" && namespace !== null
        ? namespace.default
        : undefined;
    if (!MountDeclaration.isMounts(value)) {
        return yield* Effect_1.fail(new MountError({
            code: "mount_config_invalid",
            message: ".smithers/config.ts must default-export S.Mounts({ <name>: S.Mount({ ... }) })"
        }));
    }
    return value;
});
/** Reads the tracked branch's tip, or undefined when it cannot be read. */
const tipOf = Effect_1.fnUntraced(function* tipOf(repository, track, cwd, options) {
    const completion_2 = yield* runtime.$catch(Effect_1.fnUntraced(function* tipOf$try() {
        const listing = yield* git(cwd, ["ls-remote", "--heads", repository, `refs/heads/${track}`], options);
        const line = listing.split("\n").find((entry) => entry.endsWith(`\trefs/heads/${track}`));
        return { kind: "return", value: line?.split("\t")[0] };
    })(), Effect_1.fnUntraced(function* tipOf$catch() {
        return { kind: "return", value: undefined };
    }));
    if (completion_2.kind === "return")
        return completion_2.value;
});
const hasCommit = Effect_1.fnUntraced(function* hasCommit(checkout, commit, options) {
    const completion_3 = yield* runtime.$catch(Effect_1.fnUntraced(function* hasCommit$try() {
        yield* git(checkout, ["cat-file", "-e", `${commit}^{commit}`], options);
        return { kind: "return", value: true };
    })(), Effect_1.fnUntraced(function* hasCommit$catch() {
        return { kind: "return", value: false };
    }));
    if (completion_3.kind === "return")
        return completion_3.value;
});
/** Fetches one commit: shallow by id first, then every branch for servers that refuse a bare id. */
const fetchCommit = Effect_1.fnUntraced(function* fetchCommit(checkout, commit, options) {
    if (yield* hasCommit(checkout, commit, options))
        return;
    yield* runtime.$catch(Effect_1.fnUntraced(function* fetchCommit$try() {
        yield* git(checkout, ["fetch", "--quiet", "--depth", "1", "--no-tags", "origin", commit], options);
    })(), Effect_1.fnUntraced(function* fetchCommit$catch() {
        yield* runtime.$catch(Effect_1.fnUntraced(function* fetchCommit$try() {
            yield* git(checkout, ["fetch", "--quiet", "--no-tags", "origin", "+refs/heads/*:refs/remotes/origin/*"], options);
        })(), Effect_1.fnUntraced(function* fetchCommit$catch(cause) {
            return yield* Effect_1.fail(new MountError({
                code: "mount_fetch_failed",
                message: `could not fetch ${short(commit)}: ${cause instanceof Error ? cause.message : String(cause)}`
            }));
        }));
    }));
    if (!(yield* hasCommit(checkout, commit, options))) {
        return yield* Effect_1.fail(new MountError({ code: "mount_fetch_failed", message: `the upstream repository has no commit ${commit}` }));
    }
});
const readReceipt = Effect_1.fnUntraced(function* readReceipt(checkout) {
    const outcome = yield* exit(Effect_1.gen(function* () {
        const parsed = yield* runtime.$trusted(((receiver_1, args_1) => () => receiver_1.parse(...args_1))(JSON, [yield* Native.readText(Native.join(checkout, ".git", receiptFile))]), [SyntaxError]);
        return parsed.version === 1 ? parsed : undefined;
    }));
    {
        if (Exit.isSuccess(outcome)) {
            let receipt = outcome.value;
            return receipt;
        }
    }
    return undefined;
});
/** Every regular file under `directory`, as posix paths relative to it, skipping `skip`. */
const filesUnder = Effect_1.fnUntraced({ *filesUnder(directory, skip, relative = "") {
        const entries = yield* Native.readdir(Native.join(directory, relative));
        const found = [];
        for (const entry of entries) {
            const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
            if (skip(path))
                continue;
            if (entry.isSymbolicLink()) {
                return yield* Effect_1.fail(new MountError({
                    code: "mount_config_invalid",
                    message: `overlay file .smithers/${path} is a symbolic link; an overlay holds regular files`
                }));
            }
            if (entry.isDirectory())
                found.push(...yield* filesUnder(directory, skip, path));
            else if (entry.isFile())
                found.push(path);
        }
        return found.sort();
    } }.filesUnder);
const skippedNames = new Set(["node_modules", ".flows", ".git", ".jj", checkoutsDirectory]);
/**
 * The overlay files one mount lays, keyed by their path under the checkout's
 * `.smithers/`. `config.ts`, declared patches, and other mounts' overlay
 * directories stay in the overlay.
 */
const overlayFiles = Effect_1.fnUntraced(function* overlayFiles(overlayRoot, name, mounts) {
    const smithers = Native.join(overlayRoot, ".smithers");
    const mount = mounts.mounts[name];
    const base = mount.overlay === "." ? "" : mount.overlay;
    const excluded = new Set(["config.ts"]);
    for (const [other, declaration] of Object.entries(mounts.mounts)) {
        for (const patch of declaration.patches)
            excluded.add(patch);
        if (other !== name && declaration.overlay !== ".")
            excluded.add(declaration.overlay);
    }
    const directory = Native.join(smithers, ...base.split("/").filter(Boolean));
    const present = yield* Native.isDirectory(directory);
    if (!present) {
        return yield* Effect_1.fail(new MountError({
            code: "mount_config_invalid",
            message: `mount ${name} overlay directory .smithers/${base} does not exist`
        }));
    }
    const skip = (relative) => {
        const fromSmithers = base === "" ? relative : `${base}/${relative}`;
        return skippedNames.has(Native.posixBasename(relative)) || excluded.has(fromSmithers);
    };
    const files = yield* filesUnder(directory, skip);
    const laid = new Map(files.map((relative) => [relative, Native.join(directory, ...relative.split("/"))]));
    return laid;
});
/**
 * Lays the overlay over the checkout's `.smithers/`: copies new and changed
 * files, removes files an earlier lay placed that the overlay no longer has,
 * and refuses before writing anything when a destination holds an edit.
 */
const lay = Effect_1.fnUntraced(function* lay(checkout, display, files, previous, options) {
    const tracked = new Set((yield* git(checkout, ["ls-files", "-z", "--", ".smithers"], options)).split("\0").filter(Boolean));
    const laid = {};
    const sources = new Map();
    for (const [relative, source] of files) {
        const destination = `.smithers/${relative}`;
        if (tracked.has(destination)) {
            return yield* Effect_1.fail(new MountError({
                code: "mount_overlay_collision",
                message: `overlay file ${destination} would replace a file upstream tracks; change it with a patch instead`
            }));
        }
        const bytes = yield* Native.readFile(source);
        sources.set(relative, bytes);
        laid[relative] = Native.digest(bytes);
    }
    const destinations = new Set([...Object.keys(previous), ...sources.keys()]);
    for (const relative of destinations) {
        const current = yield* Native.readDigest(Native.join(checkout, ".smithers", ...relative.split("/")));
        if (current === undefined || current === laid[relative] || current === previous[relative])
            continue;
        return yield* Effect_1.fail(new MountError({
            code: "mount_overlay_edited",
            message: `.smithers/${relative} in ${display} was edited after it was laid; ` +
                "move the edit into the overlay, or delete the file to discard it"
        }));
    }
    for (const relative of Object.keys(previous)) {
        if (!sources.has(relative)) {
            yield* Native.remove(Native.join(checkout, ".smithers", ...relative.split("/")));
        }
    }
    for (const [relative, bytes] of sources) {
        const destination = Native.join(checkout, ".smithers", ...relative.split("/"));
        if ((yield* Native.readDigest(destination)) === laid[relative])
            continue;
        yield* Native.mkdirp(Native.dirname(destination));
        yield* Native.writeFile(destination, bytes);
    }
    return laid;
});
/** The patch files a mount declares, with their digests, in order. */
const patchesOf = Effect_1.fnUntraced(function* patchesOf(overlayRoot, name, mount) { return yield* Effect.forEach(mount.patches, Effect_1.fnUntraced(function* (path) {
    const value = yield* Native.readDigest(Native.join(overlayRoot, ".smithers", ...path.split("/")));
    if (value === undefined) {
        return yield* Effect_1.fail(new MountError({
            code: "mount_config_invalid",
            message: `mount ${name} patch .smithers/${path} is missing`
        }));
    }
    return { path, digest: value };
}), { concurrency: "unbounded" }); });
const identity = ["-c", "user.name=Smithers", "-c", "user.email=mount@smithers.invalid", "-c", "commit.gpgsign=false"];
/** Checks out `base` and commits each patch on top of it; returns the new head. */
const checkout = Effect_1.fnUntraced(function* checkout(root, repository, base, overlayRoot, patches, options) {
    if (!(yield* Native.isFile(Native.join(root, ".git", "HEAD")))) {
        yield* Native.mkdirp(root);
        yield* git(root, ["init", "--quiet"], options);
        yield* git(root, ["remote", "add", "origin", repository], options);
    }
    else {
        yield* git(root, ["remote", "set-url", "origin", repository], options);
        const status = yield* git(root, ["status", "--porcelain", "--untracked-files=all"], options);
        const edited = status.split("\n").filter(Boolean).map((line) => line.slice(3));
        if (edited.length > 0) {
            return yield* Effect_1.fail(new MountError({
                code: "mount_dirty",
                message: `re-materializing would discard edits in ${posix(Native.relative(overlayRoot, root))}: ${edited.slice(0, 10).join(", ")}${edited.length > 10 ? `, and ${edited.length - 10} more` : ""}; save them as a patch or discard them`
            }));
        }
    }
    yield* Native.mkdirp(Native.join(root, ".git", "info"));
    yield* Native.writeFile(Native.join(root, ".git", "info", "exclude"), "/.smithers/\n/.flows/\n");
    yield* fetchCommit(root, base, options);
    yield* git(root, ["checkout", "--quiet", "--force", "--detach", base], options);
    for (const patch of patches) {
        const file = Native.join(overlayRoot, ".smithers", ...patch.path.split("/"));
        yield* runtime.$catch(Effect_1.fnUntraced(function* checkout$try() {
            yield* git(root, ["apply", "--index", "--whitespace=nowarn", file], options);
        })(), Effect_1.fnUntraced(function* checkout$catch(cause) {
            return yield* Effect_1.fail(new MountError({
                code: "mount_patch_failed",
                message: `patch .smithers/${patch.path} does not apply to ${short(base)}: ${cause instanceof Error ? cause.message : String(cause)}`
            }));
        }));
        yield* git(root, [...identity, "commit", "--quiet", "--no-verify", "-m", `smithers mount: apply ${patch.path}`], options);
    }
    return (yield* git(root, ["rev-parse", "HEAD"], options)).trim();
});
/** The checkout's current head, or undefined when git cannot read it. */
const headOf = Effect_1.fnUntraced(function* headOf(root, options) {
    const completion_4 = yield* runtime.$catch(Effect_1.fnUntraced(function* headOf$try() {
        return { kind: "return", value: (yield* git(root, ["rev-parse", "HEAD"], options)).trim() };
    })(), Effect_1.fnUntraced(function* headOf$catch() {
        return { kind: "return", value: undefined };
    }));
    if (completion_4.kind === "return")
        return completion_4.value;
});
/**
 * Materializes one named mount of an overlay and returns what was checked
 * out. The call is idempotent: with the pin, patches, and overlay unchanged
 * it fetches nothing and rewrites nothing.
 *
 * @category materialization
 * @since 1.0.0
 */
export const materialize = (overlayRoot, name, options) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* materializeProgram(overlayRoot, name, options); }));
/** The body of {@link materialize}. */
const materializeProgram = Effect_1.fnUntraced(function* materializeProgram(overlayRoot, name, options) {
    const mounts = yield* loadConfigProgram(overlayRoot);
    const mount = mounts.mounts[name];
    if (mount === undefined) {
        return yield* Effect_1.fail(new MountError({
            code: "mount_ambiguous",
            message: `.smithers/config.ts declares no mount ${JSON.stringify(name)}; it declares ${Object.keys(mounts.mounts).join(", ")}`
        }));
    }
    const directory = Native.join(overlayRoot, checkoutsDirectory);
    const root = Native.join(directory, name);
    yield* Native.mkdirp(directory);
    yield* Native.writeFile(Native.join(directory, ".gitignore"), "*\n");
    let drift = { state: "untracked" };
    let base = mount.ref;
    if (mount.track !== undefined) {
        const tip = yield* tipOf(mount.repository, mount.track, directory, options);
        if (tip === undefined && mount.drift !== "warn") {
            return yield* Effect_1.fail(new MountError({
                code: "mount_drift",
                message: `mount ${name} could not read ${mount.track} from ${mount.repository}; drift ${mount.drift} needs it`
            }));
        }
        if (mount.drift === "refuse" && tip !== undefined && tip !== mount.ref) {
            return yield* Effect_1.fail(new MountError({
                code: "mount_drift",
                message: `mount ${name} pins ${mount.ref}, but ${mount.track} is at ${tip}; move the pin to ${tip}`
            }));
        }
        if (mount.drift === "follow" && tip !== undefined)
            base = tip;
        drift = { state: tip === undefined ? "unknown" : tip === base ? "current" : "behind", track: mount.track, tip };
    }
    const patches = yield* patchesOf(overlayRoot, name, mount);
    const files = yield* overlayFiles(overlayRoot, name, mounts);
    const receipt = yield* readReceipt(root);
    const current = receipt !== undefined &&
        receipt.repository === mount.repository &&
        receipt.base === base &&
        JSON.stringify(receipt.patches) === JSON.stringify(patches) &&
        (yield* headOf(root, options)) === receipt.head;
    let head;
    yield* runtime.$catch(Effect_1.fnUntraced(function* materializeProgram$try() {
        head = current ? receipt.head : yield* checkout(root, mount.repository, base, overlayRoot, patches, options);
    })(), Effect_1.fnUntraced(function* materializeProgram$catch(cause) {
        if (cause instanceof GitFailure)
            return yield* Effect_1.fail(new MountError({ code: "mount_fetch_failed", message: cause.message }));
        return yield* Effect_1.fail(cause);
    }));
    const laid = yield* lay(root, `${checkoutsDirectory}/${name}`, files, receipt?.laid ?? {}, options);
    const next = { version: 1, repository: mount.repository, base, head, patches, laid };
    yield* Native.writeFile(Native.join(root, ".git", receiptFile), `${JSON.stringify(next, null, 2)}\n`);
    return {
        name,
        root,
        overlayRoot,
        repository: mount.repository,
        pin: mount.ref,
        base,
        head,
        patches: patches.map((patch) => patch.path),
        drift
    };
});
/**
 * The one-line report a command prints after materializing a mount.
 *
 * @category presentation
 * @since 1.0.0
 */
export const summary = (mount) => {
    const patches = mount.patches.length === 1 ? "1 patch" : `${mount.patches.length} patches`;
    const location = posix(Native.relative(mount.overlayRoot, mount.root));
    const head = `mount ${mount.name}: ${short(mount.base)} + ${patches} from ${mount.repository} at ${location}`;
    const { state, track, tip } = mount.drift;
    switch (state) {
        case "untracked":
            return head;
        case "unknown":
            return `${head}; ${track} could not be read`;
        case "current":
            return mount.base === mount.pin
                ? `${head}; ${track} is current`
                : `${head}; following ${track} past the pin ${short(mount.pin)}`;
        case "behind":
            return `${head}; ${track} moved to ${short(tip)}, past the pin`;
    }
};
/**
 * Decides where a command plans. From inside an overlay repository, the
 * selected mount is materialized and the command plans in its checkout, at
 * the same relative directory when the checkout has it. An overlay with one
 * mount selects it; an overlay with several selects the mount whose overlay
 * directory holds the starting directory. Anywhere else, including inside a
 * materialized checkout, the directory is returned as is.
 *
 * @category materialization
 * @since 1.0.0
 */
export const resolveWorkspace = (start, options) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* resolveWorkspaceProgram(start, options); }));
/** The body of {@link resolveWorkspace}. */
const resolveWorkspaceProgram = Effect_1.fnUntraced(function* resolveWorkspaceProgram(start, options) {
    const directory = Native.resolve(start);
    const overlayRoot = yield* overlayRootOf(directory);
    if (overlayRoot === undefined)
        return { workspace: directory, mount: undefined };
    // A workspace nested in the overlay, such as a materialized checkout, is
    // ordinary; the overlay's own `.smithers/` never is one.
    const workspaceRoot = yield* Native.awaited(() => PackageDiscovery.findWorkspaceRoot(directory));
    if (workspaceRoot !== undefined && workspaceRoot !== overlayRoot && within(overlayRoot, workspaceRoot) &&
        !within(Native.join(overlayRoot, ".smithers"), workspaceRoot)) {
        return { workspace: directory, mount: undefined };
    }
    const declared = Object.entries((yield* loadConfigProgram(overlayRoot)).mounts);
    const selected = declared.length === 1
        ? declared[0][0]
        : declared.find(([, mount]) => mount.overlay !== "." && within(Native.join(overlayRoot, ".smithers", ...mount.overlay.split("/")), directory))?.[0];
    if (selected === undefined) {
        return yield* Effect_1.fail(new MountError({
            code: "mount_ambiguous",
            message: `.smithers/config.ts declares mounts ${declared.map(([name]) => name).join(", ")}; run from one mount's overlay directory, such as .smithers/${declared[0][1].overlay}`
        }));
    }
    const mount = yield* materializeProgram(overlayRoot, selected, options);
    options.report(summary(mount));
    const relative = Native.relative(overlayRoot, directory);
    const mapped = Native.join(mount.root, relative);
    const present = relative !== "" && (yield* Native.isDirectory(mapped));
    return { workspace: present ? mapped : mount.root, mount };
});
