/**
 * Syntax-only import resolution and transitive closure over workspace files.
 *
 * The resolver parses TypeScript and JavaScript modules with the installed
 * `typescript` API — no type checking, no emit — extracts their import,
 * export-from, require, and dynamic-import specifiers, and resolves each one
 * against the workspace: relative paths with extension probing (`.js` maps to
 * its TypeScript sibling), `tsconfig.json` `baseUrl`/`paths`, and node_modules
 * specifiers validated through `package.json` `exports`/`main` to a
 * package-level node, never into the package. Local package `#imports` targets
 * join the file closure together with their controlling manifest. Every row outcome is explicit:
 * `resolved-file`, `package`, `builtin`, `unresolved`, or `dynamic`.
 *
 * A closure is a breadth-first walk over rows from a set of entry files. Its
 * result is the sorted `(path, digest)` reachable file set, the sorted
 * imported package set, and the unresolved and dynamic rows carried
 * explicitly so consumers can fail closed on them.
 *
 * Per-file parse rows are cached in the existing {@link Cache.CacheStore},
 * keyed on file digest, resolver-config digest, and the resolver
 * implementation fingerprint. A cached row elides parsing only: specifier
 * resolution re-runs against the current tree on every closure, because
 * resolution depends on neighbouring files a content digest cannot see
 * (creating `b.ts` changes what `./b` means without touching the importer).
 * Directory listings are read once per closure, so revalidation stays cheap;
 * exact-name membership in the listing decides existence, so a
 * case-insensitive filesystem cannot resolve a specifier Linux would refuse.
 *
 * The two layers at the bottom implement the resolver actions declared in
 * `@smthrs/targets/Compose`: {@link ImportClosureLive} executes
 * `S.ImportClosure` and {@link CheckFilesDifferenceLive} executes
 * `S.Test({expect: S.Files.difference(..), toBe: "empty"})`.
 *
 * @since 0.1.0
 */
import * as Cache from "effect/Cache";
import * as Effect_1 from "effect/Effect";
import * as runtime from "vibelang-runtime";
import * as Compose from "@smthrs/targets/Compose";
import { failureMessage } from "@smthrs/targets/GeneratedFile";
import * as Input from "@smthrs/targets/Input";
import * as SafeFs from "@smthrs/targets/SafeFs";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
import * as NodeFs from "node:fs/promises";
import { version as typescriptVersion } from "typescript";
import * as ts from "typescript/unstable/ast";
import { jsExtensionSiblings } from "./internal/js-extension-siblings.js";
import { parseModule } from "./internal/ParseModule.js";
import * as Path from "./internal/Path.js";
import { posix, sha256Hex as sha256 } from "./internal/Text.js";
import * as Native from "./Resolver.native.js";
/**
 * Identity of this resolver implementation, combined with the compiler version into
 * every resolver-config digest. Bump the trailing number whenever extraction,
 * probing order, or row shape changes behaviour, so stale rows can never
 * answer for a different algorithm.
 *
 * @category constants
 * @since 0.1.0
 */
export const implementationFingerprint = "smthrs-resolver/3";
/**
 * Maximum files one closure may reach before it refuses loudly.
 *
 * @category constants
 * @since 0.1.0
 */
export const maximumClosureFiles = 200_000;
/**
 * Maximum bytes of one module admitted to the parser.
 *
 * @category constants
 * @since 0.1.0
 */
export const maximumModuleBytes = 8 * 1024 * 1024;
/** Bound kept of a dynamic import's expression text in a row. */
const dynamicTextLimit = 200;
/** Extensions whose files are parsed for specifiers. */
const scannableExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
/** Extension probe order for extensionless specifiers, the compiler's order. */
const probeExtensions = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs", ".json"];
/** Index files probed inside a directory specifier, in order. */
const indexNames = ["index.ts", "index.tsx", "index.d.ts", "index.js", "index.jsx"];
/** JSON with sorted object keys, so digests never depend on insertion order. */
const canonicalJson = (value) => JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
        return entry;
    const record = entry;
    const sorted = {};
    for (const key of Object.keys(record).sort()) {
        sorted[key] = record[key];
    }
    return sorted;
});
/**
 * A resolver-configuration error: the tsconfig chain could not be read or
 * used, or an anchored entry lies outside the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class ResolverConfigError extends Data.TaggedError("smithers-build/ResolverConfigError") {
    constructor(reason, message) {
        super({ reason, message });
    }
}
const workspaceRelative = (workspaceRoot, absolute, what) => {
    const relative = Path.containedRelative(workspaceRoot, absolute);
    if (relative === undefined) {
        throw new ResolverConfigError("outside_workspace", `${what} resolves outside the workspace: ${absolute}`);
    }
    return posix(relative);
};
/** Reads bounded text and hashes its exact bytes against the same admitted file identity. */
const readWorkspaceText = Effect_1.fnUntraced(function* readWorkspaceText(path, options) {
    const entry = yield* Effect_1.tryPromise({ try: (async (path, options) => SafeFs.resolveFile(path, options)).bind(undefined, path, options), catch: (cause) => cause });
    if (entry === undefined)
        return yield* Effect_1.fail(new Error(`${options.what} does not exist: ${path}`));
    const text = yield* Effect_1.tryPromise({ try: (async (path, options) => SafeFs.readText(path, options)).bind(undefined, entry.path, options), catch: (cause) => cause });
    if (text === undefined)
        return yield* Effect_1.fail(new Error(`${options.what} disappeared: ${path}`)
        // readText decodes UTF-8 and removes its BOM. Hash the original bytes, and
        // revalidate the original entry so changes between the two reads fail closed.
        );
    // readText decodes UTF-8 and removes its BOM. Hash the original bytes, and
    // revalidate the original entry so changes between the two reads fail closed.
    const digest = yield* Effect_1.tryPromise({ try: (async (entry, options) => SafeFs.digestEntry(entry, { ...options, maximumBytes: options.limit })).bind(undefined, entry, options), catch: (cause) => cause });
    if (digest === undefined)
        return yield* Effect_1.fail(new Error(`${options.what} disappeared: ${path}`));
    return { text, digest };
});
/** `SafeFs.canonicalRoot(root)`, awaited. */
const canonicalRoot = Effect_1.fnUntraced(function* canonicalRoot(root) { return yield* Effect_1.tryPromise({ try: (async (root) => SafeFs.canonicalRoot(root)).bind(undefined, root), catch: (cause) => cause }); });
const readTsconfigChain = Effect_1.fnUntraced({ *readTsconfigChain(workspaceRoot, relativePath, layers, sources, depth) {
        if (depth > 8) {
            return yield* Effect_1.fail(new ResolverConfigError("extends_too_deep", `tsconfig extends chain exceeds 8 files at ${relativePath}`));
        }
        const absolute = Native.join(workspaceRoot, relativePath);
        let text;
        let digest;
        yield* runtime.$catch(Effect_1.fnUntraced(function* readTsconfigChain$try() {
            const content = yield* readWorkspaceText(absolute, {
                root: yield* canonicalRoot(workspaceRoot),
                limit: SafeFs.defaultTextBytes,
                what: "tsconfig"
            });
            text = content.text;
            digest = content.digest;
        })(), Effect_1.fnUntraced(function* readTsconfigChain$catch(cause) {
            return yield* Effect_1.fail(new ResolverConfigError("unreadable", `tsconfig could not be read: ${relativePath}: ${failureMessage(cause)}`));
        }));
        sources.push({ path: posix(Native.normalize(relativePath)), digest });
        const errors = [];
        const parsed = yield* Effect_1.sync(((text, errors) => parseJsonc(text, errors, { allowTrailingComma: true, allowEmptyContent: true })).bind(undefined, text, errors));
        if (errors.length > 0) {
            return yield* Effect_1.fail(new ResolverConfigError("invalid", `tsconfig is not valid JSONC: ${relativePath}: ${yield* Effect_1.sync(((code) => printParseErrorCode(code)).bind(undefined, errors[0].error))}`));
        }
        if (parsed !== undefined && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
            return yield* Effect_1.fail(new ResolverConfigError("invalid", `tsconfig must be a JSONC object: ${relativePath}`));
        }
        const config = (parsed ?? {});
        const extendsValue = config["extends"];
        if (extendsValue !== undefined) {
            if (typeof extendsValue !== "string" || !(extendsValue.startsWith("./") || extendsValue.startsWith("../"))) {
                return yield* Effect_1.fail(new ResolverConfigError("unsupported", `tsconfig extends form is not supported by the resolver yet (only a single relative path): ${relativePath}`));
            }
            const parentAbsolute = Native.resolve(Native.dirname(absolute), extendsValue);
            const withExtension = Native.extname(parentAbsolute) === "" ? `${parentAbsolute}.json` : parentAbsolute;
            yield* readTsconfigChain(workspaceRoot, workspaceRelative(workspaceRoot, withExtension, "tsconfig extends target"), layers, sources, depth + 1);
        }
        const compilerOptions = config["compilerOptions"];
        layers.push({
            directory: Native.dirname(absolute),
            compilerOptions: typeof compilerOptions === "object" && compilerOptions !== null
                ? compilerOptions
                : {}
        });
    } }.readTsconfigChain);
/** The program behind {@link loadResolverConfig}. */
const loadResolverConfigProgram = Effect_1.fnUntraced(function* loadResolverConfigProgram(options) {
    const workspaceRoot = Native.resolve(options.workspaceRoot);
    let tsconfigPath = options.tsconfig;
    if (tsconfigPath === undefined) {
        yield* runtime.$catch(Effect_1.fnUntraced(function* loadResolverConfigProgram$try() {
            yield* Effect_1.tryPromise({ try: (async (path) => NodeFs.access(path)).bind(undefined, Native.join(workspaceRoot, "tsconfig.json")), catch: (cause) => cause });
            tsconfigPath = "tsconfig.json";
        })(), Effect_1.fnUntraced(function* loadResolverConfigProgram$catch() {
            tsconfigPath = undefined;
        }));
    }
    const layers = [];
    const sources = [];
    if (tsconfigPath !== undefined) {
        yield* readTsconfigChain(workspaceRoot, tsconfigPath, layers, sources, 0);
    }
    let baseUrl;
    let pathsMap;
    for (const layer of layers) {
        const declaredBaseUrl = layer.compilerOptions["baseUrl"];
        if (typeof declaredBaseUrl === "string") {
            baseUrl = workspaceRelative(workspaceRoot, Native.resolve(layer.directory, declaredBaseUrl), "tsconfig baseUrl");
        }
        const declaredPaths = layer.compilerOptions["paths"];
        if (typeof declaredPaths === "object" && declaredPaths !== null && !Array.isArray(declaredPaths)) {
            pathsMap = { directory: layer.directory, map: declaredPaths };
        }
    }
    const paths = [];
    if (pathsMap !== undefined) {
        const pathsBase = baseUrl === undefined
            ? workspaceRelative(workspaceRoot, pathsMap.directory, "tsconfig paths directory")
            : baseUrl;
        for (const pattern of Object.keys(pathsMap.map).sort()) {
            const targets = pathsMap.map[pattern];
            if (!Array.isArray(targets) || targets.some((entry) => typeof entry !== "string")) {
                return yield* Effect_1.fail(new ResolverConfigError("invalid", `tsconfig paths entry ${JSON.stringify(pattern)} must map to an array of strings`));
            }
            if ((pattern.match(/\*/g) ?? []).length > 1) {
                return yield* Effect_1.fail(new ResolverConfigError("invalid", `tsconfig paths pattern ${JSON.stringify(pattern)} has more than one *`));
            }
            paths.push({
                pattern,
                targets: targets.map((target) => {
                    if ((target.match(/\*/g) ?? []).length > 1) {
                        throw new ResolverConfigError("invalid", `tsconfig paths target ${JSON.stringify(target)} has more than one *`);
                    }
                    const joined = posix(Native.normalize(Native.join(pathsBase, target)));
                    if (joined === ".." || joined.startsWith("../")) {
                        throw new ResolverConfigError("outside_workspace", `tsconfig paths target ${JSON.stringify(target)} escapes the workspace`);
                    }
                    return joined === "." ? "" : joined;
                })
            });
        }
    }
    const configDigest = sha256(canonicalJson({
        fingerprint: implementationFingerprint,
        tsVersion: typescriptVersion,
        sources,
        baseUrl: baseUrl ?? null,
        paths,
        probeExtensions,
        indexNames
    }));
    const config = { workspaceRoot, configDigest, baseUrl, paths, sources };
    return config;
});
/**
 * Loads the resolver configuration for one workspace.
 *
 * `tsconfig` names the workspace-relative tsconfig to honour; when omitted,
 * a root `tsconfig.json` is used when present and no tsconfig otherwise.
 * The file is read as JSONC; a single relative
 * `extends` chain is followed, later files overriding `baseUrl` and
 * replacing `paths` whole; every other `extends` form refuses loudly.
 *
 * @category configuration
 * @since 0.1.0
 */
export const loadResolverConfig = (options) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* loadResolverConfigProgram(options); }));
const boundedText = (node, source) => {
    const text = node.getText(source).replace(/\s+/g, " ");
    return text.length > dynamicTextLimit ? `${text.slice(0, dynamicTextLimit - 3)}...` : text;
};
/**
 * Extracts every import site from one module, without resolving anything.
 *
 * Covered syntax: `import ... from`, `export ... from`, `export * from`,
 * `import x = require(...)`, `require(...)`, `require.resolve(...)`, and
 * `import(...)`. A call whose argument is a string literal or an
 * untemplated template literal is a static site; any other argument is a
 * dynamic site carrying the bounded expression text. Type-only imports are
 * included: for reachability a type-only edge still makes a file live.
 *
 * The parse is syntax only. A file the parser cannot make sense of still
 * yields the sites the parser recovered, exactly as the compiler's own
 * error-tolerant parse does.
 *
 * @category extraction
 * @since 0.1.0
 */
export const extractSpecifiers = (path, text) => {
    const source = parseModule(path, text);
    const found = [];
    const literalText = (expression) => ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) ? expression.text : undefined;
    const visit = (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            const specifier = node.moduleSpecifier === undefined ? undefined : literalText(node.moduleSpecifier);
            if (specifier !== undefined)
                found.push({ specifier, dynamic: false });
        }
        else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
            const specifier = node.moduleReference.expression === undefined
                ? undefined
                : literalText(node.moduleReference.expression);
            if (specifier !== undefined)
                found.push({ specifier, dynamic: false, mode: "require" });
        }
        else if (ts.isCallExpression(node)) {
            const callee = node.expression;
            const isImportCall = callee.kind === ts.SyntaxKind.ImportKeyword;
            const isRequire = ts.isIdentifier(callee) && callee.text === "require";
            const isRequireResolve = ts.isPropertyAccessExpression(callee) &&
                ts.isIdentifier(callee.expression) && callee.expression.text === "require" &&
                callee.name.text === "resolve";
            if (isImportCall || isRequire || isRequireResolve) {
                const argument = node.arguments[0];
                const specifier = argument === undefined ? undefined : literalText(argument);
                if (specifier !== undefined) {
                    found.push(isImportCall ? { specifier, dynamic: false } : { specifier, dynamic: false, mode: "require" });
                }
                else {
                    found.push({
                        specifier: argument === undefined ? boundedText(node, source) : boundedText(argument, source),
                        dynamic: true
                    });
                }
            }
        }
        node.forEachChild(visit);
    };
    visit(source);
    return found;
};
/**
 * One closure's read-once view of the workspace tree.
 *
 * Every existence question is answered from a directory listing read at most
 * once per run, by exact-name membership. Symbolic link entries classify by
 * what they resolve to; a broken link is `other`.
 */
class TreeReader {
    directories = new Map();
    manifests = new Map();
    root;
    constructor(root) {
        this.root = root;
    }
    importsManifest(fromDirectory) {
        let manifest = this.manifests.get(fromDirectory);
        if (manifest === undefined) {
            manifest = Native.runAsync(Effect_1.fnUntraced(function* () { return yield* readImportsManifest(this, fromDirectory); }).bind(this));
            this.manifests.set(fromDirectory, manifest);
        }
        return manifest;
    }
    listing(relativeDirectory) {
        return Effect_1.gen({ self: this }, { *listing() {
                const cached = this.directories.get(relativeDirectory);
                if (cached !== undefined)
                    return cached;
                let entries;
                const completion_1 = yield* runtime.$catch(Effect_1.fnUntraced(function* listing$try() {
                    entries = yield* Effect_1.tryPromise({ try: (async (directory) => NodeFs.readdir(directory, { withFileTypes: true })).bind(undefined, Native.join(this.root, relativeDirectory)), catch: (cause) => cause });
                    return runtime.$normal;
                }).call(this), Effect_1.fnUntraced(function* listing$catch() {
                    this.directories.set(relativeDirectory, null);
                    return { kind: "return", value: null };
                }).bind(this));
                if (completion_1.kind === "return")
                    return completion_1.value;
                const listing = new Map();
                for (const entry of entries) {
                    if (entry.isSymbolicLink()) {
                        yield* runtime.$catch(Effect_1.fnUntraced(function* listing$try() {
                            const stat = yield* Effect_1.tryPromise({ try: (async (path) => NodeFs.stat(path)).bind(undefined, Native.join(this.root, relativeDirectory, entry.name)), catch: (cause) => cause });
                            listing.set(entry.name, stat.isFile() ? "file" : stat.isDirectory() ? "dir" : "other");
                        }).call(this), Effect_1.fnUntraced(function* listing$catch() {
                            listing.set(entry.name, "other");
                        }));
                        continue;
                    }
                    listing.set(entry.name, entry.isFile() ? "file" : entry.isDirectory() ? "dir" : "other");
                }
                this.directories.set(relativeDirectory, listing);
                return listing;
            } }.listing);
    }
    /** The kind of one workspace-relative path, or null when absent. */
    kind(relativePath) {
        return Native.runAsync(Effect_1.fnUntraced(function* () {
            if (relativePath === "")
                return "dir";
            const slash = relativePath.lastIndexOf("/");
            const directory = slash === -1 ? "" : relativePath.slice(0, slash);
            const name = slash === -1 ? relativePath : relativePath.slice(slash + 1);
            if (name === "")
                return null;
            const listing = yield* this.listing(directory);
            return listing?.get(name) ?? null;
        }).bind(this));
    }
}
/** Joins and normalizes to a workspace-relative posix path, or null on escape. */
const containedJoin = (...segments) => {
    const joined = posix(Native.normalize(Native.join(...segments)));
    if (joined === ".." || joined.startsWith("../") || Native.isAbsolute(joined))
        return null;
    return joined === "." ? "" : joined;
};
const extensionOf = (path) => {
    const slash = path.lastIndexOf("/");
    const name = slash === -1 ? path : path.slice(slash + 1);
    const dot = name.lastIndexOf(".");
    return dot <= 0 ? null : name.slice(dot);
};
/** `await reader.kind(path)`: any TreeView, whose answer is a Promise. */
const kindOf = Effect_1.fnUntraced(function* kindOf(reader, path) { return yield* Effect_1.tryPromise({ try: (async (reader, path) => reader.kind(path)).bind(undefined, reader, path), catch: (cause) => cause }); });
/**
 * Probes one workspace-relative module path the way the compiler would.
 *
 * A JavaScript-suffixed path probes its TypeScript siblings, then itself. A
 * path with any other extension probes itself, then extension variants, then
 * a directory index. An extensionless path probes extension variants, then
 * the literal file, then a directory index.
 */
const probeModulePath = Effect_1.fnUntraced(function* probeModulePath(reader, raw) {
    const extension = extensionOf(raw);
    if (extension !== null && extension in jsExtensionSiblings) {
        const stem = raw.slice(0, raw.length - extension.length);
        for (const sibling of jsExtensionSiblings[extension]) {
            const candidate = `${stem}${sibling}`;
            if ((yield* kindOf(reader, candidate)) === "file")
                return candidate;
        }
        return (yield* kindOf(reader, raw)) === "file" ? raw : null;
    }
    if (extension !== null && (yield* kindOf(reader, raw)) === "file")
        return raw;
    for (const probe of probeExtensions) {
        const candidate = `${raw}${probe}`;
        if ((yield* kindOf(reader, candidate)) === "file")
            return candidate;
    }
    if (extension === null && (yield* kindOf(reader, raw)) === "file")
        return raw;
    if ((yield* kindOf(reader, raw)) === "dir") {
        for (const index of indexNames) {
            const candidate = `${raw}/${index}`;
            if ((yield* kindOf(reader, candidate)) === "file")
                return candidate;
        }
    }
    return null;
});
const parsePackageSpecifier = (specifier) => {
    const segments = specifier.split("/");
    if (specifier.startsWith("@")) {
        if (segments.length < 2 || segments[0] === "@" || segments[1] === "")
            return null;
        const name = `${segments[0]}/${segments[1]}`;
        return { name, subpath: segments.length === 2 ? "." : `./${segments.slice(2).join("/")}` };
    }
    if (segments[0] === "")
        return null;
    return { name: segments[0], subpath: segments.length === 1 ? "." : `./${segments.slice(1).join("/")}` };
};
const readManifest = Effect_1.fnUntraced(function* readManifest(root, relativePath) {
    let text;
    const completion_2 = yield* runtime.$catch(Effect_1.fnUntraced(function* readManifest$try() {
        text = yield* Effect_1.tryPromise({ try: (async (path) => NodeFs.readFile(path, "utf8")).bind(undefined, Native.join(root, relativePath)), catch: (cause) => cause });
        return runtime.$normal;
    })(), Effect_1.fnUntraced(function* readManifest$catch() {
        return { kind: "return", value: null };
    }));
    if (completion_2.kind === "return")
        return completion_2.value;
    if (text.length > 1024 * 1024)
        return null;
    const completion_3 = yield* runtime.$catch(Effect_1.fnUntraced(function* readManifest$try() {
        const parsed = yield* runtime.$trusted(() => JSON.parse(text), [SyntaxError]);
        return { kind: "return", value: typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
                ? parsed
                : null };
    })(), Effect_1.fnUntraced(function* readManifest$catch() {
        return { kind: "return", value: null };
    }));
    if (completion_3.kind === "return")
        return completion_3.value;
});
/** Whether a conditions object or target admits any resolvable leaf. */
const exportTargetUsable = (target, depth) => {
    if (depth > 8)
        return false;
    if (typeof target === "string")
        return true;
    if (Array.isArray(target))
        return target.some((entry) => exportTargetUsable(entry, depth + 1));
    if (typeof target === "object" && target !== null) {
        return Object.values(target).some((entry) => exportTargetUsable(entry, depth + 1));
    }
    return false;
};
/**
 * Whether a `package.json` `exports` value admits one subpath.
 *
 * The check is deliberately package-level: it answers whether the subpath is
 * exported at all, under any condition, without resolving into the package.
 * A subpath map matches an exact key first, then the most specific single-`*`
 * pattern, exactly as Node orders patterns; a matched `null` target means the
 * subpath is explicitly blocked.
 */
const exportsAdmits = (exportsField, subpath) => {
    if (typeof exportsField === "string" || Array.isArray(exportsField))
        return subpath === ".";
    if (typeof exportsField !== "object" || exportsField === null)
        return false;
    const record = exportsField;
    const keys = Object.keys(record);
    if (!keys.some((key) => key.startsWith("."))) {
        return subpath === "." && exportTargetUsable(record, 0);
    }
    if (subpath in record)
        return exportTargetUsable(record[subpath], 0);
    let best;
    for (const key of keys) {
        const star = key.indexOf("*");
        if (star === -1 || key.indexOf("*", star + 1) !== -1)
            continue;
        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        if (subpath.length >= prefix.length + suffix.length &&
            subpath.startsWith(prefix) &&
            subpath.endsWith(suffix) &&
            (best === undefined || prefix.length > best.key.indexOf("*"))) {
            best = { key, target: record[key] };
        }
    }
    return best !== undefined && exportTargetUsable(best.target, 0);
};
const ancestorsOf = (relativeDirectory) => {
    const found = [];
    let current = relativeDirectory;
    for (;;) {
        found.push(current);
        if (current === "")
            return found;
        const slash = current.lastIndexOf("/");
        current = slash === -1 ? "" : current.slice(0, slash);
    }
};
/** The nearest package scope controls #imports, even without a usable map. */
const readImportsManifest = Effect_1.fnUntraced(function* readImportsManifest(reader, fromDirectory) {
    for (const directory of ancestorsOf(fromDirectory)) {
        const path = directory === "" ? "package.json" : `${directory}/package.json`;
        if ((yield* kindOf(reader, path)) !== "file")
            continue;
        let content;
        yield* runtime.$catch(Effect_1.fnUntraced(function* readImportsManifest$try() {
            content = yield* readWorkspaceText(Native.join(reader.root, path), {
                root: yield* canonicalRoot(reader.root),
                limit: SafeFs.defaultTextBytes,
                what: "package imports manifest"
            });
        })(), Effect_1.fnUntraced(function* readImportsManifest$catch(cause) {
            return yield* Effect_1.fail(new ClosureError("unreadable", `imports manifest could not be read: ${path}: ${failureMessage(cause)}`));
        }));
        let imports;
        yield* runtime.$catch(Effect_1.fnUntraced(function* readImportsManifest$try() {
            const value = yield* runtime.$trusted(() => JSON.parse(content.text), [SyntaxError]);
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                imports = value["imports"];
            }
        })(), Effect_1.fnUntraced(function* readImportsManifest$catch() {
        }));
        return { path, directory, digest: content.digest, imports };
    }
    return null;
});
/** Select conditions in declaration order; undefined permits a later condition. */
const importsTarget = (target, mode, depth = 0) => {
    if (depth > 8)
        return undefined;
    if (target === null || typeof target === "string")
        return target;
    if (Array.isArray(target)) {
        for (const entry of target) {
            const selected = importsTarget(entry, mode, depth + 1);
            if (typeof selected === "string")
                return selected;
        }
        return null;
    }
    if (typeof target === "object") {
        for (const [condition, entry] of Object.entries(target)) {
            if (condition !== "default" && condition !== "types" && condition !== "node" && condition !== mode)
                continue;
            const selected = importsTarget(entry, mode, depth + 1);
            if (selected !== undefined)
                return selected;
        }
    }
    return undefined;
};
const matchImportsTarget = (imports, specifier, mode) => {
    if (typeof imports !== "object" || imports === null || Array.isArray(imports))
        return null;
    const record = imports;
    if (Object.hasOwn(record, specifier))
        return importsTarget(record[specifier], mode) ?? null;
    let best;
    for (const key of Object.keys(record)) {
        if (!key.startsWith("#"))
            continue;
        const star = key.indexOf("*");
        if (star === -1 || key.indexOf("*", star + 1) !== -1)
            continue;
        const suffix = key.slice(star + 1);
        if (specifier.length > star + suffix.length && specifier.startsWith(key.slice(0, star)) &&
            specifier.endsWith(suffix) &&
            (best === undefined || star > best.star || (star === best.star && key.length > best.key.length))) {
            best = { key, star, matched: specifier.slice(star, specifier.length - suffix.length) };
        }
    }
    if (best === undefined)
        return null;
    const target = importsTarget(record[best.key], mode);
    return typeof target === "string" ? target.split("*").join(best.matched) : null;
};
const resolvePackageSpecifier = Effect_1.fnUntraced(function* resolvePackageSpecifier(reader, fromDirectory, specifier) {
    const parsed = parsePackageSpecifier(specifier);
    if (parsed === null)
        return { specifier, status: "unresolved" };
    for (const ancestor of ancestorsOf(fromDirectory)) {
        const packageRoot = containedJoin(ancestor, "node_modules", parsed.name);
        if (packageRoot === null || (yield* kindOf(reader, packageRoot)) !== "dir")
            continue;
        const manifest = yield* readManifest(reader.root, `${packageRoot}/package.json`);
        if (manifest !== null && manifest["exports"] !== undefined) {
            return exportsAdmits(manifest["exports"], parsed.subpath)
                ? { specifier, status: "package", packageName: parsed.name }
                : { specifier, status: "unresolved" };
        }
        return { specifier, status: "package", packageName: parsed.name };
    }
    return { specifier, status: "unresolved" };
});
/** Matches one bare specifier against tsconfig paths, most specific first. */
const pathsCandidates = (config, specifier) => {
    let exact;
    let best;
    for (const entry of config.paths) {
        const star = entry.pattern.indexOf("*");
        if (star === -1) {
            if (entry.pattern === specifier)
                exact = entry.targets;
            continue;
        }
        const prefix = entry.pattern.slice(0, star);
        const suffix = entry.pattern.slice(star + 1);
        if (specifier.length >= prefix.length + suffix.length &&
            specifier.startsWith(prefix) &&
            specifier.endsWith(suffix) &&
            (best === undefined || prefix.length > best.prefixLength)) {
            best = {
                prefixLength: prefix.length,
                matched: specifier.slice(prefix.length, specifier.length - suffix.length),
                targets: entry.targets
            };
        }
    }
    if (exact !== undefined)
        return exact;
    if (best === undefined)
        return [];
    const matched = best.matched;
    return best.targets.map((target) => target.includes("*") ? target.replace("*", matched) : target);
};
const stripQuery = (specifier) => {
    const query = specifier.indexOf("?");
    return query === -1 ? specifier : specifier.slice(0, query);
};
/** The program behind {@link resolveSpecifier}. */
const resolveSpecifierProgram = Effect_1.fnUntraced(function* resolveSpecifierProgram(config, reader, fromFile, site) {
    if (site.dynamic)
        return { specifier: site.specifier, status: "dynamic" };
    const specifier = stripQuery(site.specifier);
    if (specifier === "")
        return { specifier: site.specifier, status: "unresolved" };
    // Only a complete specifier the running Node can load is a builtin; an
    // unknown `node:` name or a bare subpath under a builtin name falls through
    // to the ordinary rules and stays unresolved unless a package provides it.
    if (Native.isBuiltin(specifier))
        return { specifier: site.specifier, status: "builtin" };
    const slash = fromFile.lastIndexOf("/");
    const fromDirectory = slash === -1 ? "" : fromFile.slice(0, slash);
    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..") {
        const raw = containedJoin(fromDirectory, specifier);
        if (raw === null)
            return { specifier: site.specifier, status: "unresolved" };
        const resolved = yield* probeModulePath(reader, raw === "" ? "." : raw);
        return resolved === null
            ? { specifier: site.specifier, status: "unresolved" }
            : { specifier: site.specifier, status: "resolved-file", resolved };
    }
    if (specifier.startsWith("/") || /^[A-Za-z]:/.test(specifier) || specifier.includes(":")) {
        return { specifier: site.specifier, status: "unresolved" };
    }
    if (specifier.startsWith("#")) {
        const unresolved = { specifier: site.specifier, status: "unresolved" };
        if (specifier === "#" || specifier.startsWith("#/"))
            return unresolved;
        const manifest = reader instanceof TreeReader
            ? yield* Effect_1.tryPromise({ try: (async (reader, fromDirectory) => reader.importsManifest(fromDirectory)).bind(undefined, reader, fromDirectory), catch: (cause) => cause }) : yield* readImportsManifest(reader, fromDirectory);
        if (manifest === null)
            return unresolved;
        const target = matchImportsTarget(manifest.imports, specifier, site.mode ?? "import");
        if (target === null)
            return unresolved;
        if (target.startsWith("./")) {
            const local = containedJoin(target);
            if (local === null || local === "")
                return unresolved;
            const raw = containedJoin(manifest.directory, local);
            if (raw === null)
                return unresolved;
            const resolved = yield* probeModulePath(reader, raw);
            if (resolved === null)
                return unresolved;
            const root = yield* canonicalRoot(reader.root);
            yield* Effect_1.tryPromise({ try: (async (path, root) => SafeFs.resolveFile(path, { root, what: "package imports target" })).bind(undefined, Native.join(reader.root, resolved), root), catch: (cause) => cause });
            return { specifier: site.specifier, status: "resolved-file", resolved };
        }
        if (Native.isBuiltin(target)) {
            return { specifier: site.specifier, status: "builtin" };
        }
        if (target === "" || target.startsWith(".") || target.startsWith("/") || target.startsWith("#") ||
            target.includes(":")) {
            return unresolved;
        }
        const edge = yield* resolvePackageSpecifier(reader, manifest.directory, target);
        return { ...edge, specifier: site.specifier };
    }
    for (const candidate of pathsCandidates(config, specifier)) {
        const resolved = yield* probeModulePath(reader, candidate === "" ? "." : candidate);
        if (resolved !== null)
            return { specifier: site.specifier, status: "resolved-file", resolved };
    }
    if (config.baseUrl !== undefined) {
        const raw = containedJoin(config.baseUrl, specifier);
        if (raw !== null) {
            const resolved = yield* probeModulePath(reader, raw === "" ? "." : raw);
            if (resolved !== null)
                return { specifier: site.specifier, status: "resolved-file", resolved };
        }
    }
    return yield* resolvePackageSpecifier(reader, fromDirectory, specifier);
});
/**
 * Resolves one extracted import from one file into an explicit row edge.
 *
 * @category resolution
 * @since 0.1.0
 */
export const resolveSpecifier = (config, reader, fromFile, site) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* resolveSpecifierProgram(config, reader, fromFile, site); }));
/**
 * The stored shape of one cached resolver row: the file digest it answers
 * for and the extracted import sites. Resolution is never stored — it
 * depends on the surrounding tree, which the key cannot see — so a hit
 * elides the parse and re-resolves against the current tree.
 */
const StoredRow = Schema.Struct({
    digest: Schema.String,
    specifiers: Schema.Array(Schema.Struct({
        specifier: Schema.String,
        dynamic: Schema.Boolean,
        mode: Schema.optional(Schema.Literal("require"))
    }))
});
const decodeStoredRow = Schema.decodeUnknownOption(StoredRow);
/**
 * The cache target name resolver rows are stored under.
 *
 * @category constants
 * @since 0.1.0
 */
export const rowCacheTarget = "ImportClosureRow";
/**
 * The cache key of one resolver row: file digest, resolver-config digest
 * (which already covers the implementation fingerprint and TypeScript
 * version), bound under a row-namespace prefix.
 *
 * @category caching
 * @since 0.1.0
 */
export const rowCacheKey = (fileDigest, configDigest) => sha256(`smthrs-resolver-row\u0000${fileDigest}\u0000${configDigest}`);
/**
 * A closure computation failed: an entry does not exist, a file vanished
 * between probe and read, a module exceeds the parse bound, or the closure
 * exceeded {@link maximumClosureFiles}.
 *
 * @category errors
 * @since 0.1.0
 */
export class ClosureError extends Data.TaggedError("smithers-build/ClosureError") {
    constructor(reason, message) {
        super({ reason, message });
    }
}
const compareIssues = (left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : left.specifier < right.specifier
    ? -1
    : left.specifier > right.specifier
        ? 1
        : 0;
/** The program behind {@link computeClosure}. */
const computeClosureProgram = Effect_1.fnUntraced(function* computeClosureProgram(options) {
    const { cache, config } = options;
    const maximumFiles = options.maximumFiles ?? maximumClosureFiles;
    const root = yield* canonicalRoot(config.workspaceRoot);
    const reader = new TreeReader(config.workspaceRoot);
    const files = new Map();
    const packages = new Set();
    const unresolved = new Map();
    const dynamic = new Map();
    let parsed = 0;
    let cached = 0;
    const entrySet = new Set(options.entries);
    const queue = [...options.entries];
    const queued = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const path = queue[cursor];
        if (files.has(path))
            continue;
        if (files.size >= maximumFiles) {
            return yield* Effect_1.fail(new ClosureError("too_many_files", `import closure exceeds ${maximumFiles} files`));
        }
        if (containedJoin(path) !== path || path === "") {
            return yield* Effect_1.fail(new ClosureError("invalid_entry", `closure entry is not a normalized workspace-relative path: ${JSON.stringify(path)}`));
        }
        const extension = extensionOf(path);
        const scannable = extension !== null && scannableExtensions.has(extension);
        let text;
        let digest;
        yield* runtime.$catch(Effect_1.fnUntraced(function* computeClosureProgram$try() {
            const absolute = Native.join(config.workspaceRoot, path);
            if (scannable) {
                const content = yield* readWorkspaceText(absolute, {
                    root,
                    limit: maximumModuleBytes,
                    what: "module (parse bound)"
                });
                text = content.text;
                digest = content.digest;
            }
            else {
                digest = yield* Effect_1.tryPromise({ try: (async (absolute, root) => SafeFs.digestFile(absolute, { root, what: "closure file" })).bind(undefined, absolute, root), catch: (cause) => cause });
            }
            if (digest === undefined)
                return yield* Effect_1.fail(new Error(`file does not exist: ${path}`));
        })(), Effect_1.fnUntraced(function* computeClosureProgram$catch(cause) {
            return yield* Effect_1.fail(new ClosureError(entrySet.has(path) ? "missing_entry" : "unreadable", entrySet.has(path)
                ? `closure entry does not exist: ${path}: ${failureMessage(cause)}`
                : `closure file could not be read: ${path}: ${failureMessage(cause)}`));
        }));
        files.set(path, digest);
        if (text === undefined)
            continue;
        const slash = path.lastIndexOf("/");
        const manifest = yield* Effect_1.tryPromise({ try: (async (reader, directory) => reader.importsManifest(directory)).bind(undefined, reader, slash === -1 ? "" : path.slice(0, slash)), catch: (cause) => cause });
        const configDigest = manifest === null ? config.configDigest : sha256(canonicalJson({
            config: config.configDigest,
            importsManifest: { path: manifest.path, digest: manifest.digest }
        }));
        const key = rowCacheKey(digest, configDigest);
        let specifiers;
        if (cache !== undefined) {
            const stored = yield* Effect_1.tryPromise({ try: (async (cache, key) => cache.get(key)).bind(undefined, cache, key), catch: (cause) => cause });
            if (stored !== null && stored.exitOk && stored.target === rowCacheTarget) {
                const decoded = decodeStoredRow(stored.output);
                if (Option.isSome(decoded) && decoded.value.digest === digest) {
                    specifiers = decoded.value.specifiers;
                    cached += 1;
                }
            }
        }
        if (specifiers === undefined) {
            specifiers = extractSpecifiers(path, text);
            parsed += 1;
            if (cache !== undefined) {
                const row = {
                    key,
                    target: rowCacheTarget,
                    label: path,
                    exitOk: true,
                    output: { digest, specifiers },
                    storedAt: new Date().toISOString()
                };
                yield* Effect_1.tryPromise({ try: (async (cache, key, row) => cache.put(key, row)).bind(undefined, cache, key, row), catch: (cause) => cause });
            }
        }
        if (manifest !== null && specifiers.some((site) => !site.dynamic && site.specifier.startsWith("#"))) {
            if (!files.has(manifest.path) && files.size >= maximumFiles) {
                return yield* Effect_1.fail(new ClosureError("too_many_files", `import closure exceeds ${maximumFiles} files`));
            }
            files.set(manifest.path, manifest.digest);
        }
        for (const site of specifiers) {
            const edge = yield* resolveSpecifierProgram(config, reader, path, site);
            switch (edge.status) {
                case "resolved-file": {
                    if (!queued.has(edge.resolved)) {
                        queued.add(edge.resolved);
                        queue.push(edge.resolved);
                    }
                    break;
                }
                case "package": {
                    packages.add(edge.packageName);
                    break;
                }
                case "builtin": {
                    break;
                }
                case "unresolved": {
                    unresolved.set(`${path}\u0000${edge.specifier}`, { file: path, specifier: edge.specifier });
                    break;
                }
                case "dynamic": {
                    dynamic.set(`${path}\u0000${edge.specifier}`, { file: path, specifier: edge.specifier });
                    break;
                }
            }
        }
    }
    const outcome = {
        result: {
            files: [...files.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([path, digest]) => ({ path, digest })),
            packages: [...packages].sort(),
            unresolved: [...unresolved.values()].sort(compareIssues),
            dynamic: [...dynamic.values()].sort(compareIssues)
        },
        stats: { parsed, cached }
    };
    return outcome;
});
/**
 * Computes the transitive import closure of `entries` under one
 * configuration.
 *
 * Entries are workspace-relative files and must exist. Every reachable file
 * joins the result with its content digest; files whose extension is not a
 * module extension join as leaves without parsing. Unresolved and dynamic
 * rows are carried explicitly. The result is fully sorted, so two runs over
 * one tree are byte-identical regardless of traversal order or cache state.
 *
 * @category closure
 * @since 0.1.0
 */
export const computeClosure = (options) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* computeClosureProgram(options); }));
/**
 * Maps one anchored base onto its workspace-relative package path.
 *
 * @category expansion
 * @since 0.1.0
 */
export const packageDirectoryOf = (workspaceRoot, base) => {
    if (base === "")
        return "";
    const relative = Path.containedRelative(Native.resolve(workspaceRoot), base);
    if (relative === undefined) {
        throw new ResolverConfigError("outside_workspace", `anchored source is declared outside the workspace: ${base}`);
    }
    if (relative === "")
        return "";
    return posix(relative);
};
/** The program behind {@link expandAnchoredSources}. */
const expandAnchoredSourcesProgram = Effect_1.fnUntraced(function* expandAnchoredSourcesProgram(options) {
    const found = new Set();
    for (const { base, source } of options.sources) {
        const packageDirectory = packageDirectoryOf(options.workspaceRoot, base);
        if (source._tag === "File") {
            const path = Input.resolvePath(packageDirectory, source.path);
            yield* runtime.$catch(Effect_1.fnUntraced(function* expandAnchoredSourcesProgram$try() {
                yield* Effect_1.tryPromise({ try: (async (absolute) => NodeFs.access(absolute)).bind(undefined, Native.join(options.workspaceRoot, path)), catch: (cause) => cause });
                found.add(path);
            })(), Effect_1.fnUntraced(function* expandAnchoredSourcesProgram$catch() {
                if (options.requireFiles) {
                    return yield* Effect_1.fail(new ClosureError("missing_entry", `declared entry file does not exist: ${path}`));
                }
            }));
            continue;
        }
        const matches = yield* Effect_1.tryPromise({ try: (async (workspaceRoot, packageDirectory, source, cacheDirectory) => Input.expandGlob(workspaceRoot, packageDirectory, source, { cacheDirectory })).bind(undefined, options.workspaceRoot, packageDirectory, source, options.cacheDirectory), catch: (cause) => cause });
        for (const match of matches) {
            const basename = Native.posixBasename(match);
            // PACKAGE/WORKSPACE modules are build declarations, not members of a
            // source glob. They remain available when named explicitly as S.file.
            if (basename !== "PACKAGE.ts" && basename !== "WORKSPACE.ts")
                found.add(match);
        }
    }
    const sorted = [...found].sort();
    return sorted;
});
/**
 * Expands anchored sources to a sorted set of workspace-relative files.
 *
 * Globs expand through `Input.expandGlob`, so package scope, `.gitignore`,
 * and host-state exclusion apply exactly as they do to declared inputs.
 * Declared files that do not exist are dropped when `requireFiles` is false
 * and refused loudly when it is true.
 *
 * @category expansion
 * @since 0.1.0
 */
export const expandAnchoredSources = (options) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* expandAnchoredSourcesProgram(options); }));
/** The program behind {@link closureOfEntries}. */
const closureOfEntriesProgram = Effect_1.fnUntraced(function* closureOfEntriesProgram(options, entries) {
    const config = yield* loadResolverConfigProgram({
        workspaceRoot: options.workspaceRoot,
        tsconfig: options.tsconfig
    });
    const files = yield* expandAnchoredSourcesProgram({
        workspaceRoot: options.workspaceRoot,
        cacheDirectory: options.cacheDirectory,
        sources: entries,
        requireFiles: true
    });
    const outcome = yield* computeClosureProgram({ config, entries: files, cache: options.cache });
    return outcome.result;
});
/**
 * Loads the resolver configuration, expands anchored entry sources, and
 * computes the closure — the one-call surface the package executor binds.
 *
 * @category closure
 * @since 0.1.0
 */
export const closureOfEntries = (options, entries) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* closureOfEntriesProgram(options, entries); }));
/**
 * Implements the `smithers-build/import-closure` action with the resolver.
 *
 * @category layers
 * @since 0.1.0
 */
export const ImportClosureLive = (options) => Compose.ResolveImportClosure.toLayer(Effect_1.fnUntraced(function* (payload) { return yield* Effect_1.tryPromise({ try: (async (closureOfEntries, options, entries) => closureOfEntries(options, entries)).bind(undefined, closureOfEntries, options, payload.entries), catch: (cause) => cause instanceof Compose.ImportClosureError
        ? cause
        : new Compose.ImportClosureError({ message: failureMessage(cause) }) }); }));
const issueLimit = 200;
const cappedIssues = (issues) => issues.slice(0, issueLimit);
/** The program behind {@link operandPaths}. */
const operandPathsProgram = Effect_1.fnUntraced(function* operandPathsProgram(options, operand, side) {
    if (operand._tag === "SourceSet") {
        return yield* expandAnchoredSourcesProgram({
            workspaceRoot: options.workspaceRoot,
            cacheDirectory: options.cacheDirectory,
            sources: operand.sources,
            requireFiles: false
        });
    }
    const closure = yield* closureOfEntriesProgram(options, operand.entries);
    if (closure.unresolved.length > 0 || closure.dynamic.length > 0) {
        return yield* Effect_1.fail(new Compose.FilesTestError({
            message: `the ${side} closure is incomplete (${closure.unresolved.length} unresolved, ` +
                `${closure.dynamic.length} dynamic import(s)); the check fails closed rather than ` +
                `reasoning from an incomplete file set`,
            leftover: [],
            unresolved: cappedIssues(closure.unresolved),
            dynamic: cappedIssues(closure.dynamic)
        }));
    }
    return closure.files.map((file) => file.path);
});
/**
 * Reduces one file-algebra operand to its path set. A closure operand with
 * unresolved or dynamic rows fails closed with a typed `FilesTestError`.
 *
 * @category expansion
 * @since 0.1.0
 */
export const operandPaths = (options, operand, side) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* operandPathsProgram(options, operand, side); }));
/**
 * Implements the `smithers-build/files-difference` action: expands both
 * operands, subtracts right from left by path, and requires emptiness.
 *
 * @category layers
 * @since 0.1.0
 */
export const CheckFilesDifferenceLive = (options) => Compose.CheckFilesDifference.toLayer(Effect_1.fnUntraced(function* (payload) {
    const completion_4 = yield* runtime.$catch(Effect_1.fnUntraced(function* () {
        const left = yield* Effect_1.tryPromise({ try: (async (operandPaths, options, operand) => operandPaths(options, operand, "left")).bind(undefined, operandPaths, options, payload.left), catch: (cause) => cause });
        const right = new Set(yield* Effect_1.tryPromise({ try: (async (operandPaths, options, operand) => operandPaths(options, operand, "right")).bind(undefined, operandPaths, options, payload.right), catch: (cause) => cause }));
        const leftover = left.filter((path) => !right.has(path));
        if (leftover.length > 0) {
            return yield* Effect_1.fail(new Compose.FilesTestError({
                message: `expected the file-set difference to be empty, but ${leftover.length} file(s) ` +
                    `in the left set are missing from the right set`,
                leftover: leftover.slice(0, issueLimit),
                unresolved: [],
                dynamic: []
            }));
        }
        return { kind: "return", value: undefined };
    })(), Effect_1.fnUntraced(function* (cause) {
        return yield* Effect_1.fail(cause instanceof Compose.FilesTestError
            ? cause
            : new Compose.FilesTestError({
                message: failureMessage(cause),
                leftover: [],
                unresolved: [],
                dynamic: []
            }));
    }));
    if (completion_4.kind === "return")
        return completion_4.value;
}));
