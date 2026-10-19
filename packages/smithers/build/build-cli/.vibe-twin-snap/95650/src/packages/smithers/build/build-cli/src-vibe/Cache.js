/**
 * Read-through result cache: a content-addressed local file store fronting an
 * optional HTTP remote.
 *
 * The local store answers reads first. A remote lookup runs only on a local
 * miss, and a remote hit hydrates the local file so the next read stays on
 * disk. A put writes both stores. Any remote failure prints one warning line
 * and degrades the store to local-only for the rest of the process. A `429`
 * is not a failure: it costs only the request it answered.
 *
 * Every read on both sides is an untrusted read. A local entry file may have
 * been replaced by a symbolic link, a FIFO, or four gigabytes of noise; a
 * remote body may never end. Both are bounded and type-checked before anything
 * is parsed, and both degrade to a miss rather than to a hazard.
 *
 * @since 0.1.0
 */
import { sleep } from "effect/Effect";
import { $awaitRace, $catchExpression } from "vibelang-runtime";
import * as Effect_1 from "effect/Effect";
import * as runtime from "vibelang-runtime";
import * as Config from "@smthrs/targets/Config";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as NodeFs from "node:fs";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
import { randomUUID } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Native from "./Cache.native.js";
import { errorCode, failureMessage, optionalOpenFlag } from "./internal/Fs.js";
/**
 * The largest entry either store will read.
 *
 * An entry is one action's success value. Sixteen mebibytes is far above any
 * legitimate one and far below a size that threatens the process, so a store
 * that has been filled with a huge file answers a miss instead of turning a
 * cache lookup into an out-of-memory failure.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export const entryLimit = 16 * 1024 * 1024;
/**
 * The action-cache publication ceiling shared by both remote backends.
 *
 * Local entries retain the larger {@link entryLimit}; a remote tier stores
 * entries in a database row and deliberately accepts no more than one MiB.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export const remoteEntryLimit = 1024 * 1024;
/**
 * Bounds CPU and bookkeeping for adversarial response streams of tiny chunks.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export const maximumRemoteBodyChunks = 16_384;
/**
 * The default deadline for one remote request, including its whole body.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export const remoteTimeouts = { get: 3_000, put: 8_000 };
/**
 * The stored entry shape both stores decode through.
 *
 * `key`, `target`, and `label` are required to be non-empty: an entry that
 * cannot name the action it came from cannot be trusted to answer for one.
 * `exitOk` must be a real boolean, so a truthy-looking value never admits a
 * failed run as a hit.
 */
const StoredResult = Schema.Struct({
    key: Schema.NonEmptyString,
    target: Schema.NonEmptyString,
    label: Schema.NonEmptyString,
    exitOk: Schema.Boolean,
    output: Schema.Unknown,
    storedAt: Schema.NonEmptyString
});
const decodeStored = Schema.decodeUnknownOption(StoredResult);
/**
 * Decodes one candidate entry and requires it to answer for `key`.
 *
 * Both stores share this boundary. A well-formed entry filed under the wrong
 * key is a corrupt store, not a hit: returning it would answer one action with
 * another action's result, which is the one failure mode a content-addressed
 * cache must never have. The executor checks the entry's target and label on top
 * of this, so a store that reuses one key for two actions is caught there too.
 */
const decodeFor = (key, candidate) => {
    const decoded = decodeStored(candidate);
    if (Option.isNone(decoded) || decoded.value.key !== key)
        return null;
    try {
        return normalizeCachedResult(key, decoded.value);
    }
    catch {
        return null;
    }
};
const wellFormedKey = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const maximumCacheKeyCodeUnits = 4_096;
/**
 * Maps a cache key onto a name that is safe as a single path segment.
 *
 * A key that starts with a letter or digit, uses only letters, digits, dots,
 * underscores, and dashes, and is at most 200 characters long passes through
 * unchanged. Every other key becomes the lowercase hex SHA-256 of its UTF-16
 * code units. UTF-16 is deliberate: UTF-8 encoding replaces an unpaired
 * surrogate, which let two distinct JavaScript strings map to one file name.
 * Hashing the code units is injective up to SHA-256 and keeps the file name
 * inside the cache directory.
 *
 * @category utilities
 * @since 0.1.0
 * @slop
 */
export const sanitizeKey = (key) => {
    if (typeof key !== "string" || key.length === 0 || key.length > maximumCacheKeyCodeUnits) {
        throw new TypeError(`cache key must contain 1 to ${maximumCacheKeyCodeUnits} UTF-16 code units`);
    }
    return wellFormedKey.test(key) ? key : Native.utf16Sha256(key);
};
const combinedFailure = (primary, secondary, secondaryLabel) => {
    const combined = new Error(`${failureMessage(primary)}; ${secondaryLabel}: ${failureMessage(secondary)}`, { cause: new AggregateError([primary, secondary]) });
    const code = errorCode(primary);
    if (code !== undefined)
        combined.code = code;
    return combined;
};
const plainDataRecord = (value, what) => {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Native.isProxy(value)) {
        throw new TypeError(`${what} must be a plain object`);
    }
    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        throw new TypeError(`${what} could not be inspected safely`);
    }
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${what} must be a plain object`);
    }
    return value;
};
const exactDataKeys = (value, allowed, what) => {
    let keys;
    try {
        keys = Reflect.ownKeys(value);
    }
    catch {
        throw new TypeError(`${what} could not be inspected safely`);
    }
    for (const key of keys) {
        if (typeof key !== "string" || !allowed.has(key)) {
            throw new TypeError(`${what} contains an unknown property: ${String(key)}`);
        }
    }
};
const dataMember = (value, name, what) => {
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(value, name);
    }
    catch {
        throw new TypeError(`${what}.${name} could not be inspected safely`);
    }
    if (descriptor === undefined)
        return undefined;
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
        throw new TypeError(`${what}.${name} must be an enumerable data property`);
    }
    return descriptor.value;
};
const jsonStringBytes = (value) => {
    let bytes = 2;
    for (let index = 0; index < value.length; index += 1) {
        const unit = value.charCodeAt(index);
        if (unit === 0x22 || unit === 0x5c || unit === 0x08 || unit === 0x09 || unit === 0x0a || unit === 0x0c ||
            unit === 0x0d) {
            bytes += 2;
        }
        else if (unit < 0x20 || (unit >= 0xd800 && unit <= 0xdfff)) {
            if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < value.length) {
                const next = value.charCodeAt(index + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    bytes += 4;
                    index += 1;
                    continue;
                }
            }
            bytes += 6;
        }
        else if (unit < 0x80) {
            bytes += 1;
        }
        else if (unit < 0x800) {
            bytes += 2;
        }
        else {
            bytes += 3;
        }
        if (!Number.isSafeInteger(bytes) || bytes > entryLimit)
            return bytes;
    }
    return bytes;
};
const snapshotJson = (value) => {
    const ancestors = new Set();
    let members = 0;
    let bytes = 0;
    const addBytes = (count) => {
        bytes += count;
        if (!Number.isSafeInteger(bytes) || bytes > entryLimit) {
            throw new RangeError(`cached JSON exceeds its ${entryLimit}-byte limit`);
        }
    };
    const visit = (current, depth) => {
        if (depth > 64)
            throw new TypeError("cached JSON is nested too deeply");
        if (current === null) {
            addBytes(4);
            return null;
        }
        if (typeof current === "string") {
            addBytes(jsonStringBytes(current));
            return current;
        }
        if (typeof current === "boolean") {
            addBytes(current ? 4 : 5);
            return current;
        }
        if (typeof current === "number") {
            if (!Number.isFinite(current) || Object.is(current, -0)) {
                throw new TypeError("cached JSON contains a lossy number");
            }
            addBytes(String(current).length);
            return current;
        }
        if (typeof current !== "object" || current === null) {
            throw new TypeError("cached output must be an inert JSON value");
        }
        if (ancestors.has(current))
            throw new TypeError("cached JSON contains a cycle");
        ancestors.add(current);
        try {
            if (Array.isArray(current)) {
                const lengthDescriptor = Object.getOwnPropertyDescriptor(current, "length");
                if (lengthDescriptor === undefined ||
                    !("value" in lengthDescriptor) ||
                    !Number.isSafeInteger(lengthDescriptor.value) ||
                    lengthDescriptor.value < 0)
                    throw new TypeError("cached output contains an invalid array");
                const length = lengthDescriptor.value;
                if (length > 100_000 - members)
                    throw new TypeError("cached JSON has too many members");
                const keys = Reflect.ownKeys(current).filter((key) => key !== "length");
                if (keys.length !== length)
                    throw new TypeError("cached output contains a sparse or extended array");
                members += length;
                addBytes(2 + Math.max(0, length - 1));
                const output = [];
                for (let index = 0; index < length; index += 1) {
                    const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
                    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
                        throw new TypeError("cached output arrays must contain only data entries");
                    }
                    output.push(visit(descriptor.value, depth + 1));
                }
                return Object.freeze(output);
            }
            const record = plainDataRecord(current, "cached output object");
            const keys = Reflect.ownKeys(record);
            if (!keys.every((key) => typeof key === "string")) {
                throw new TypeError("cached output objects must not contain symbol properties");
            }
            if (keys.length > 100_000 - members)
                throw new TypeError("cached JSON has too many members");
            members += keys.length;
            addBytes(2 + Math.max(0, keys.length - 1) + keys.length);
            const entries = [];
            for (const key of keys.sort()) {
                const descriptor = Object.getOwnPropertyDescriptor(record, key);
                if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
                    throw new TypeError("cached output objects must contain only data properties");
                }
                addBytes(jsonStringBytes(key));
                entries.push([key, visit(descriptor.value, depth + 1)]);
            }
            return Object.freeze(Object.fromEntries(entries));
        }
        finally {
            ancestors.delete(current);
        }
    };
    return visit(value, 0);
};
const isWellFormedText = (value) => {
    for (let index = 0; index < value.length; index += 1) {
        const unit = value.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            if (index + 1 >= value.length)
                return false;
            const next = value.charCodeAt(index + 1);
            if (next < 0xdc00 || next > 0xdfff)
                return false;
            index += 1;
        }
        else if (unit >= 0xdc00 && unit <= 0xdfff)
            return false;
    }
    return true;
};
const remoteKeySupported = (key) => isWellFormedText(key) &&
    Native.byteLength(key, "utf8") <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(key);
const normalizeCachedResult = (key, value) => {
    const record = plainDataRecord(value, "cached result");
    exactDataKeys(record, new Set(["key", "target", "label", "exitOk", "output", "storedAt"]), "cached result");
    const storedKey = dataMember(record, "key", "cached result");
    const target = dataMember(record, "target", "cached result");
    const label = dataMember(record, "label", "cached result");
    const exitOk = dataMember(record, "exitOk", "cached result");
    const output = dataMember(record, "output", "cached result");
    const storedAt = dataMember(record, "storedAt", "cached result");
    if (!Object.hasOwn(record, "output"))
        throw new TypeError("cached result output is required");
    if (typeof storedKey !== "string" || storedKey.length === 0 || storedKey !== key) {
        throw new TypeError("cached result key does not match");
    }
    for (const [name, member] of [["target", target], ["label", label], ["storedAt", storedAt]]) {
        if (typeof member !== "string" ||
            member.length === 0 ||
            member.length > 8 * 1024 ||
            !isWellFormedText(member) ||
            Native.byteLength(member, "utf8") > 8 * 1024)
            throw new TypeError(`cached result ${name} must be bounded non-empty usable text`);
    }
    if (typeof exitOk !== "boolean")
        throw new TypeError("cached result exitOk must be a boolean");
    const storedAtMs = typeof storedAt === "string" ? Date.parse(storedAt) : Number.NaN;
    if (typeof storedAt !== "string" ||
        !Number.isFinite(storedAtMs) ||
        new Date(storedAtMs).toISOString() !== storedAt) {
        throw new TypeError("cached result storedAt must be a canonical ISO timestamp");
    }
    return Object.freeze({
        key: storedKey,
        target: target,
        label: label,
        exitOk,
        output: snapshotJson(output === undefined ? null : output),
        storedAt
    });
};
/** Reports whether `candidate` is `root` or below it, lexically. */
const inside = (root, candidate) => {
    const relative = Native.relative(root, candidate);
    return relative === "" ||
        (relative !== ".." && !relative.startsWith(`..${NodePath.sep}`) && !Native.isAbsolute(relative));
};
/**
 * Resolves a directory that must stay inside the workspace once symbolic links
 * are followed, or throws.
 *
 * `Config.normalizeCacheDirectory` already refuses an absolute path and any
 * `..` segment, which settles the lexical question. It cannot settle the
 * filesystem question: `.flows` may itself be a symbolic link to somewhere
 * else entirely, and every entry the cache published would then land outside
 * the workspace, writing files wherever the link points. A missing directory
 * is fine — it is created and validated again — but an existing one that
 * resolves out of the workspace fails the command.
 *
 * ## Boundary
 *
 * Validation resolves the path that exists at the moment it runs. Node has no
 * portable descriptor-relative open (`openat` with `RESOLVE_BENEATH`), so an
 * ancestor directory replaced by an outside-pointing symbolic link between
 * this check and a later write is not detected. Closing that window needs
 * platform-specific syscalls Node does not expose; what is closed here is the
 * durable case, a workspace whose cache directory is a link.
 */
const confineDirectory = Effect_1.fnUntraced(function* confineDirectory(boundary, directory, what = "cache directory") {
    let resolved;
    yield* runtime.$catch(Effect_1.fnUntraced(function* confineDirectory$try() {
        resolved = yield* Effect_1.tryPromise({ try: (async (directory) => Fs.realpath(directory)).bind(undefined, directory), catch: (cause) => cause });
    })(), Effect_1.fnUntraced(function* confineDirectory$catch(cause) {
        if (errorCode(cause) !== "ENOENT")
            return yield* Effect_1.fail(cause);
        resolved = undefined;
    }));
    if (resolved !== undefined && !inside(boundary, resolved)) {
        return yield* Effect_1.fail(new Error(what === "cache directory"
            ? `cache directory leaves the workspace: ${directory} resolves to ${resolved}`
            : `${what} leaves its allowed root: ${directory} resolves to ${resolved}`));
    }
});
/** The program behind {@link ensureCacheDirectory}. */
const ensureCacheDirectoryProgram = Effect_1.fnUntraced(function* ensureCacheDirectoryProgram(workspaceRoot, cacheDirectory) {
    const root = yield* Effect_1.tryPromise({ try: (async (workspaceRoot) => Fs.realpath(workspaceRoot)).bind(undefined, workspaceRoot), catch: (cause) => cause });
    const segments = [...Config.normalizeCacheDirectory(cacheDirectory).split("/"), "cache"];
    // Every ancestor is checked, and checked before anything is created: a
    // `.flows` that already points outside must fail the command rather than
    // have a `cache` directory created out there first.
    let directory = root;
    for (const segment of segments) {
        directory = Native.join(directory, segment);
        yield* confineDirectory(root, directory);
    }
    yield* Effect_1.tryPromise({ try: (async (directory) => Fs.mkdir(directory, { recursive: true })).bind(undefined, directory), catch: (cause) => cause });
    yield* confineDirectory(root, directory);
    return yield* Effect_1.tryPromise({ try: (async (directory) => Fs.realpath(directory)).bind(undefined, directory), catch: (cause) => cause });
});
/**
 * Creates the cache directory and refuses one that escapes the workspace.
 *
 * The check runs before the directory is created, so an existing link is
 * caught, and again afterwards, so a link created concurrently with the
 * `mkdir` is caught too.
 *
 * @category validation
 * @since 0.1.0
 * @slop
 */
export const ensureCacheDirectory = (workspaceRoot, cacheDirectory) => Native.runAsync(Effect_1.fnUntraced(function* () { return yield* ensureCacheDirectoryProgram(workspaceRoot, cacheDirectory); }));
const localPath = (cacheRoot, key) => {
    const safe = sanitizeKey(key);
    return Native.join(cacheRoot, safe.slice(0, 2), `${safe}.json`);
};
/**
 * Reads one entry file as JSON, or null when it is absent, not a plain file,
 * too large, or not JSON.
 *
 * The whole read is defensive, because the file is untrusted input even in a
 * private workspace: a shared cache directory, a restored backup, or a hand
 * edit can put anything at the path.
 *
 * - `lstat` refuses a symbolic link, a FIFO, a device, a socket, and a
 *   directory before anything is opened, so a link planted at an entry path
 *   cannot make the cache read a file elsewhere.
 * - The open adds `O_NOFOLLOW` (never follow a link swapped in after the
 *   `lstat`) and `O_NONBLOCK` (a FIFO cannot block the open) where the platform
 *   provides them, so a hostile entry cannot stall the run.
 * - The descriptor is `fstat`-checked to be the same regular file the `lstat`
 *   saw, comparing device and inode, before a byte is read.
 * - The size is checked against {@link entryLimit} on the descriptor, so the
 *   bytes are never materialized before the limit is applied.
 *
 * Every failure is a miss. A cache is an optimization; it never gets to fail a
 * run, and it never gets to consume unbounded memory.
 */
const readEntryFile = Effect_1.fnUntraced(function* readEntryFile(path) {
    let text;
    // A concurrent writer publishes by renaming a new file onto this path, which
    // loses the identity check against a file that no longer exists. That is a
    // race, not a refusal, and retrying reads the newly published entry. Every
    // writer of one key writes the same bytes, so a retry cannot widen what is
    // accepted. A genuine refusal — a link, a FIFO, a directory, an oversize
    // file — returns immediately without retrying.
    for (let attempt = 0; attempt < 3 && text === undefined; attempt += 1) {
        let expected;
        const completion_1 = yield* runtime.$catch(Effect_1.fnUntraced(function* readEntryFile$try() {
            expected = yield* Effect_1.tryPromise({ try: (async (path) => Fs.lstat(path, { bigint: true })).bind(undefined, path), catch: (cause) => cause });
            return runtime.$normal;
        })(), Effect_1.fnUntraced(function* readEntryFile$catch() {
            return { kind: "return", value: null };
        }));
        if (completion_1.kind === "return")
            return completion_1.value;
        if (!expected.isFile() || expected.size > BigInt(entryLimit) || expected.nlink !== 1n)
            return null;
        let handle;
        const completion_2 = yield* runtime.$catch(Effect_1.fnUntraced(function* readEntryFile$try() {
            handle = yield* Effect_1.tryPromise({ try: (async (path) => Fs.open(path, NodeFs.constants.O_RDONLY | optionalOpenFlag("O_NOFOLLOW") | optionalOpenFlag("O_NONBLOCK"))).bind(undefined, path), catch: (cause) => cause });
            return runtime.$normal;
        })(), Effect_1.fnUntraced(function* readEntryFile$catch() {
            return { kind: "return", value: null };
        }));
        if (completion_2.kind === "return")
            return completion_2.value;
        let candidate;
        yield* runtime.$catch(Effect_1.fnUntraced(function* readEntryFile$try() {
            const opened = yield* Effect_1.tryPromise({ try: (async (handle) => handle.stat({ bigint: true })).bind(undefined, handle), catch: (cause) => cause });
            if (opened.isFile() &&
                opened.dev === expected.dev &&
                opened.ino === expected.ino &&
                opened.nlink === 1n &&
                opened.size === expected.size &&
                opened.size <= BigInt(entryLimit) &&
                opened.mtimeNs === expected.mtimeNs &&
                opened.ctimeNs === expected.ctimeNs) {
                // One byte of slack detects growth after the descriptor stat without
                // ever allocating more than the advertised entry ceiling.
                const buffer = yield* Effect_1.sync(((size) => Buffer.allocUnsafe(size)).bind(undefined, Number(opened.size) + 1));
                let total = 0;
                while (total < buffer.length) {
                    const { bytesRead } = yield* Effect_1.tryPromise({ try: (async (handle, buffer, total) => handle.read(buffer, total, buffer.length - total, total)).bind(undefined, handle, buffer, total), catch: (cause) => cause });
                    if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length - total) {
                        return yield* Effect_1.fail(new Error(`cache entry returned an invalid read length: ${typeof bytesRead === "number" ? String(bytesRead) : typeof bytesRead}`));
                    }
                    if (bytesRead === 0)
                        break;
                    total += bytesRead;
                }
                const after = yield* Effect_1.tryPromise({ try: (async (handle) => handle.stat({ bigint: true })).bind(undefined, handle), catch: (cause) => cause });
                if (after.isFile() &&
                    after.dev === opened.dev &&
                    after.ino === opened.ino &&
                    after.nlink === opened.nlink &&
                    after.size === opened.size &&
                    after.mtimeNs === opened.mtimeNs &&
                    after.ctimeNs === opened.ctimeNs &&
                    BigInt(total) === opened.size) {
                    candidate = decodeStrictUtf8(buffer.subarray(0, total));
                }
            }
        })(), Effect_1.fnUntraced(function* readEntryFile$catch() {
            candidate = undefined;
        }));
        yield* runtime.$catch(Effect_1.fnUntraced(function* readEntryFile$try() {
            yield* Effect_1.tryPromise({ try: (async (handle) => handle.close()).bind(undefined, handle), catch: (cause) => cause });
        })(), Effect_1.fnUntraced(function* readEntryFile$catch() {
            candidate = undefined;
        }));
        text = candidate;
    }
    if (text === undefined)
        return null;
    const completion_3 = yield* runtime.$catch(Effect_1.fnUntraced(function* readEntryFile$try() {
        return { kind: "return", value: yield* runtime.$trusted(() => JSON.parse(text), [SyntaxError]) };
    })(), Effect_1.fnUntraced(function* readEntryFile$catch() {
        return { kind: "return", value: null };
    }));
    if (completion_3.kind === "return")
        return completion_3.value;
});
const readLocal = Effect_1.fnUntraced(function* readLocal(cacheRoot, key) {
    const path = localPath(cacheRoot, key);
    yield* confineDirectory(cacheRoot, Native.dirname(path), "cache shard directory");
    return decodeFor(key, yield* readEntryFile(path));
});
const writeContentsLive = (handle, contents) => handle.writeFile(contents, "utf8");
const openDirectoryLive = Native.openDirectoryLive;
const syncHandleLive = (handle) => handle.sync();
const closeHandleLive = (handle) => handle.close();
const removeTempLive = Native.removeTempLive;
/**
 * Creates a sibling temporary file nobody else can be holding.
 *
 * The name is unique by construction and the handle is opened with exclusive
 * create, so two writers of the same entry can never share a temp file and a
 * stale temp left by a crashed process is never adopted. Bazel's
 * `DiskCacheClient.saveFile` takes the same position with a per-write UUID.
 *
 * The mode is left to the default so the published entry keeps the permissions
 * the umask asks for. A cache directory shared between accounts stays readable.
 */
const createTemp = Effect_1.fnUntraced(function* createTemp(directory, base) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const temp = yield* Effect_1.sync(((directory, base) => NodePath.join(directory, `.${base}.${process.pid.toString(36)}.${randomUUID()}.tmp`)).bind(undefined, directory, base));
        const completion_4 = yield* runtime.$catch(Effect_1.fnUntraced(function* createTemp$try() {
            return { kind: "return", value: { handle: yield* Effect_1.tryPromise({ try: (async (temp) => Fs.open(temp, "wx")).bind(undefined, temp), catch: (cause) => cause }), temp } };
        })(), Effect_1.fnUntraced(function* createTemp$catch(error) {
            if (errorCode(error) !== "EEXIST")
                return yield* Effect_1.fail(error);
            return runtime.$normal;
        }));
        if (completion_4.kind === "return")
            return completion_4.value;
    }
    return yield* Effect_1.fail(new Error(`could not create a unique temporary file in ${directory}`));
});
/**
 * Error codes that mean the filesystem refuses fsync on a directory descriptor
 * it did hand out. Permission errors, bad descriptors, and anything unknown are
 * real I/O failures and propagate.
 */
const directorySyncUnsupported = new Set(["ENOTSUP", "EOPNOTSUPP", "EINVAL", "ENOSYS"]);
/**
 * Flushes the directory entry created by the rename.
 *
 * POSIX needs this for the rename itself to survive a machine crash. Windows
 * exposes no portable directory descriptor through Node, so the barrier is
 * skipped there deliberately rather than attempted and swallowed.
 *
 * Everything else is real I/O. Opening the directory is an ordinary open and
 * its failures propagate; only the narrow fsync codes that mean "this
 * filesystem does not implement directory sync" are tolerated. The handle is
 * closed exactly once and a close failure propagates unless a sync failure is
 * already propagating, in which case the sync failure is the one reported.
 */
const syncDirectory = Effect_1.fnUntraced(function* syncDirectory(directory, openDirectory, syncHandle, closeHandle) {
    const handle = yield* Effect_1.tryPromise({ try: (async (openDirectory, directory) => openDirectory(directory)).bind(undefined, openDirectory, directory), catch: (cause) => cause });
    if (handle === undefined)
        return;
    let primary;
    yield* runtime.$catch(Effect_1.fnUntraced(function* syncDirectory$try() {
        yield* Effect_1.tryPromise({ try: (async (syncHandle, handle) => syncHandle(handle)).bind(undefined, syncHandle, handle), catch: (cause) => cause });
    })(), Effect_1.fnUntraced(function* syncDirectory$catch(cause) {
        if (!directorySyncUnsupported.has(errorCode(cause) ?? ""))
            primary = { cause };
    }));
    yield* runtime.$catch(Effect_1.fnUntraced(function* syncDirectory$try() {
        yield* Effect_1.tryPromise({ try: (async (closeHandle, handle) => closeHandle(handle)).bind(undefined, closeHandle, handle), catch: (cause) => cause });
    })(), Effect_1.fnUntraced(function* syncDirectory$catch(cause) {
        primary ??= { cause };
    }));
    if (primary !== undefined)
        return yield* Effect_1.fail(primary.cause);
});
/**
 * Renames the finished temp onto the entry path, tolerating a concurrent
 * writer that already published the same entry.
 *
 * POSIX rename is atomic and replaces the destination, so a concurrent
 * complete writer is invisible. Windows refuses a rename onto a destination
 * another process has open; entries are content addressed and every writer of
 * one key writes the same bytes, so an existing destination that decodes for
 * the key is an acceptable outcome rather than a failure. This mirrors Bazel's
 * `renameToleratingConcurrentCreation` and the Windows branch of
 * `VirtualActionInput.atomicallyWriteTo`.
 *
 * Returns true when the rename consumed the temp file.
 */
const renameTolerantly = Effect_1.fnUntraced(function* renameTolerantly(temp, path, key, rename) {
    const completion_5 = yield* runtime.$catch(Effect_1.fnUntraced(function* renameTolerantly$try() {
        yield* Effect_1.tryPromise({ try: (async (rename, temp, path) => rename(temp, path)).bind(undefined, rename, temp, path), catch: (cause) => cause });
        return { kind: "return", value: true };
    })(), Effect_1.fnUntraced(function* renameTolerantly$catch(error) {
        const code = errorCode(error);
        if ((yield* Effect_1.sync(() => process.platform)) === "win32" &&
            (code === "EPERM" || code === "EACCES" || code === "EBUSY") &&
            decodeFor(key, yield* readEntryFile(path)) !== null)
            return { kind: "return", value: false };
        return yield* Effect_1.fail(error);
    }));
    if (completion_5.kind === "return")
        return completion_5.value;
});
/**
 * Publishes one entry atomically.
 *
 * The bytes go to an exclusively created sibling temp file that is written,
 * fsynced, and closed before it is renamed onto the entry path, so a reader
 * observes either no entry or the whole entry. Failure discipline mirrors the
 * generated-file writer:
 *
 * - A close failure never publishes as success. When an earlier failure exists
 *   the diagnostic reports both while retaining the earlier error code.
 * - Temp removal is attempted on every path that did not consume the temp, and
 *   never masks a primary failure. Every removal failure is reported as a
 *   secondary cause, because the alternative is silently leaking one file per
 *   failed or concurrent writer.
 * - The containing directory is fsynced last, and its failures are real.
 */
const writeLocal = Effect_1.fnUntraced(function* writeLocal(cacheRoot, key, result, io) {
    if (result.key !== key) {
        return yield* Effect_1.fail(new TypeError(`refusing to store an entry keyed ${result.key} under ${key}`));
    }
    const rename = io.rename ?? Fs.rename;
    const writeContents = io.writeContents ?? writeContentsLive;
    const openDirectory = io.openDirectory ?? openDirectoryLive;
    const syncHandle = io.syncHandle ?? syncHandleLive;
    const closeHandle = io.closeHandle ?? closeHandleLive;
    const removeTemp = io.removeTemp ?? removeTempLive;
    const path = localPath(cacheRoot, key);
    const directory = Native.dirname(path);
    const text = JSON.stringify(result);
    const bytes = Native.byteLength(text, "utf8");
    if (bytes > entryLimit) {
        return yield* Effect_1.fail(new RangeError(`cache entry is ${bytes} bytes, exceeding its limit of ${entryLimit}`));
    }
    yield* Effect_1.tryPromise({ try: (async (directory) => Fs.mkdir(directory, { recursive: true })).bind(undefined, directory), catch: (cause) => cause });
    // The shard directory is created here, so it is validated here: a cache
    // directory swapped for an outside link between open and put must not
    // publish outside the workspace.
    yield* confineDirectory(cacheRoot, directory, "cache shard directory");
    const { handle, temp } = yield* createTemp(directory, Native.basename(path));
    let tempConsumed = false;
    let primary;
    yield* runtime.$catch(Effect_1.fnUntraced(function* writeLocal$try() {
        yield* Effect_1.tryPromise({ try: (async (writeContents, handle, text) => writeContents(handle, text)).bind(undefined, writeContents, handle, text), catch: (cause) => cause });
        yield* Effect_1.tryPromise({ try: (async (syncHandle, handle) => syncHandle(handle)).bind(undefined, syncHandle, handle), catch: (cause) => cause });
    })(), Effect_1.fnUntraced(function* writeLocal$catch(cause) {
        primary = { cause };
    }));
    yield* runtime.$catch(Effect_1.fnUntraced(function* writeLocal$try() {
        yield* Effect_1.tryPromise({ try: (async (closeHandle, handle) => closeHandle(handle)).bind(undefined, closeHandle, handle), catch: (cause) => cause });
    })(), Effect_1.fnUntraced(function* writeLocal$catch(cause) {
        primary = primary === undefined
            ? { cause }
            : { cause: combinedFailure(primary.cause, cause, "temporary file close also failed") };
    }));
    if (primary === undefined) {
        yield* runtime.$catch(Effect_1.fnUntraced(function* writeLocal$try() {
            tempConsumed = yield* renameTolerantly(temp, path, key, rename);
        })(), Effect_1.fnUntraced(function* writeLocal$catch(cause) {
            primary = { cause };
        }));
    }
    if (!tempConsumed) {
        yield* runtime.$catch(Effect_1.fnUntraced(function* writeLocal$try() {
            yield* Effect_1.tryPromise({ try: (async (removeTemp, temp) => removeTemp(temp)).bind(undefined, removeTemp, temp), catch: (cause) => cause });
        })(), Effect_1.fnUntraced(function* writeLocal$catch(cause) {
            primary = primary === undefined
                ? {
                    cause: new Error(`the entry was published but the temporary file ${temp} could not be removed: ${failureMessage(cause)}`)
                }
                : {
                    cause: combinedFailure(primary.cause, cause, `temporary file ${temp} cleanup also failed`)
                };
        }));
    }
    if (primary !== undefined)
        return yield* Effect_1.fail(primary.cause);
    yield* syncDirectory(directory, openDirectory, syncHandle, closeHandle);
});
/**
 * Bounds one asynchronous operation with a real deadline.
 *
 * Aborting the signal is a request, not a guarantee: a custom `fetch`, a
 * polyfill, or a body that never ends is free to ignore it, and the previous
 * implementation then waited forever with a timer that had already fired. The
 * deadline is therefore a race the timer can win on its own. The signal is
 * still aborted so a cooperating implementation releases its socket, and the
 * losing promise's rejection is absorbed so an abort that arrives after the
 * race never surfaces as an unhandled rejection.
 */
const withDeadline = Effect_1.fnUntraced(function* withDeadline(operation, milliseconds, run) {
    const controller = new AbortController();
    return yield* $awaitRace([
        Effect_1.gen(function* () { return yield* run(controller.signal); }),
        Effect_1.gen(function* () { return yield* (Effect_1.fnUntraced(function* () {
            yield* sleep(milliseconds);
            const cause = new Error(`remote cache ${operation} timed out after ${milliseconds}ms`);
            controller.abort(cause);
            return yield* Effect_1.fail(cause);
        }))(); })
    ]);
});
const cancelBody = (body) => {
    if (body === null)
        return;
    try {
        void body.cancel().catch(() => undefined);
    }
    catch {
        // Cancellation is best effort and must not replace the cache outcome.
    }
};
/** Cancels a refused body's reader; the refusal remains a refusal when cancellation itself fails. */
const cancelReader = (reader) => {
    try {
        void reader.cancel().catch(() => undefined);
    }
    catch {
        // The refusal remains a refusal when cancellation itself fails.
    }
};
/** Releases a reader's lock, reporting whether the release succeeded. */
const releaseReader = (reader) => {
    try {
        reader.releaseLock();
        return true;
    }
    catch {
        return false;
    }
};
/** Strict UTF-8 decoding: undefined where a lossy decoder would substitute replacement characters. */
const decodeStrictUtf8 = (bytes) => {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch {
        return undefined;
    }
};
/**
 * Reads a response body with a hard byte ceiling.
 *
 * `Content-Length` is checked first when the server declares one, so an
 * oversize body is refused before a byte is transferred. It is only a hint,
 * and a chunked or streaming body declares nothing at all, so the stream is
 * also read incrementally and abandoned the moment the accumulated length
 * passes the limit. `response.text()` and `response.json()` have neither
 * property: both buffer whatever arrives.
 */
const readBoundedBody = Effect_1.fnUntraced(function* readBoundedBody(response, limit) {
    const declared = response.headers.get("content-length");
    let declaredLength;
    if (declared !== null) {
        const length = Number(declared);
        if (!/^\d+$/.test(declared) || !Number.isSafeInteger(length) || length > limit) {
            cancelBody(response.body);
            return undefined;
        }
        declaredLength = length;
    }
    const body = response.body;
    if (body === null)
        return declaredLength === undefined || declaredLength === 0 ? "" : undefined;
    const reader = body.getReader();
    let bytes = yield* Effect_1.sync(((size) => Buffer.allocUnsafe(size)).bind(undefined, Math.min(limit, Math.max(1024, declaredLength ?? 64 * 1024))));
    let total = 0;
    let chunks = 0;
    let releaseFailed = false;
    const completion_6 = yield* runtime.$finally(Effect_1.fnUntraced(function* readBoundedBody$try() {
        while (true) {
            const { done, value } = yield* Effect_1.tryPromise({ try: (async (reader) => reader.read()).bind(undefined, reader), catch: (cause) => cause });
            if (done)
                break;
            chunks += 1;
            if (chunks > maximumRemoteBodyChunks || !(value instanceof Uint8Array)) {
                cancelReader(reader);
                return { kind: "return", value: undefined };
            }
            if (value.byteLength === 0)
                continue;
            total += value.byteLength;
            if (total > limit) {
                cancelReader(reader);
                return { kind: "return", value: undefined };
            }
            if (total > bytes.byteLength) {
                let capacity = bytes.byteLength;
                while (capacity < total)
                    capacity = Math.min(limit, Math.max(capacity * 2, total));
                const grown = yield* Effect_1.sync(((size) => Buffer.allocUnsafe(size)).bind(undefined, capacity));
                bytes.copy(grown, 0, 0, total - value.byteLength);
                bytes = grown;
            }
            yield* Effect_1.sync(((value, bytes, offset) => Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(bytes, offset)).bind(undefined, value, bytes, total - value.byteLength));
        }
        return runtime.$normal;
    })(), Effect_1.fnUntraced(function* readBoundedBody$finally() {
        releaseFailed = !releaseReader(reader);
    })());
    if (completion_6.kind === "return")
        return completion_6.value;
    if (releaseFailed)
        return undefined;
    if (declaredLength !== undefined && total !== declaredLength)
        return undefined;
    return decodeStrictUtf8(bytes.subarray(0, total));
});
const maximumRemoteTimeoutMs = 5 * 60 * 1000;
/** Validates programmatic deadline overrides before a timer or filesystem mutation. */
const validateTimeouts = (value) => {
    if (value === undefined)
        return remoteTimeouts;
    const record = plainDataRecord(value, "remote cache timeouts");
    exactDataKeys(record, new Set(["get", "put"]), "remote cache timeouts");
    const timeouts = {
        get: dataMember(record, "get", "remote cache timeouts"),
        put: dataMember(record, "put", "remote cache timeouts")
    };
    for (const operation of ["get", "put"]) {
        const milliseconds = timeouts[operation];
        if (typeof milliseconds !== "number" ||
            !Number.isSafeInteger(milliseconds) ||
            milliseconds < 1 ||
            milliseconds > maximumRemoteTimeoutMs) {
            throw new TypeError(`remote cache ${operation} timeout must be an integer from 1 to ${maximumRemoteTimeoutMs}, ` +
                `received ${typeof milliseconds === "number" ? String(milliseconds) : typeof milliseconds}`);
        }
    }
    return { get: timeouts.get, put: timeouts.put };
};
const normalizeEndpoint = (value) => {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string")
        throw new TypeError("remote cache endpoint must be a string");
    if (value.length > 8 * 1024)
        throw new TypeError("remote cache endpoint must be bounded well-formed text");
    const trimmed = value.trim();
    if (trimmed === "")
        return undefined;
    if (trimmed.length > 8 * 1024 || !isWellFormedText(trimmed)) {
        throw new TypeError("remote cache endpoint must be bounded well-formed text");
    }
    let endpoint;
    try {
        endpoint = new URL(trimmed);
    }
    catch {
        throw new TypeError("remote cache endpoint must be an absolute URL");
    }
    const loopback = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" ||
        endpoint.hostname === "[::1]";
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) {
        throw new TypeError("remote cache endpoint must use HTTPS (HTTP is allowed only on loopback)");
    }
    if (endpoint.username !== "" || endpoint.password !== "") {
        throw new TypeError("remote cache endpoint must not contain credentials");
    }
    if (endpoint.search !== "" || endpoint.hash !== "") {
        throw new TypeError("remote cache endpoint must not contain a query or fragment");
    }
    return endpoint.href.replace(/\/+$/, "");
};
const normalizeCacheIo = (value) => {
    if (value === undefined)
        return Object.freeze({});
    const record = plainDataRecord(value, "cache I/O overrides");
    const names = [
        "rename",
        "writeContents",
        "openDirectory",
        "syncHandle",
        "closeHandle",
        "removeTemp"
    ];
    exactDataKeys(record, new Set(names), "cache I/O overrides");
    const methods = Object.fromEntries(names.map((name) => [name, dataMember(record, name, "cache I/O overrides")]));
    for (const name of names) {
        const method = methods[name];
        if (method !== undefined && typeof method !== "function") {
            throw new TypeError(`cache I/O override ${name} must be a function`);
        }
    }
    return Object.freeze({
        ...(methods["rename"] === undefined ? {} : { rename: methods["rename"] }),
        ...(methods["writeContents"] === undefined
            ? {}
            : { writeContents: methods["writeContents"] }),
        ...(methods["openDirectory"] === undefined
            ? {}
            : { openDirectory: methods["openDirectory"] }),
        ...(methods["syncHandle"] === undefined
            ? {}
            : { syncHandle: methods["syncHandle"] }),
        ...(methods["closeHandle"] === undefined
            ? {}
            : { closeHandle: methods["closeHandle"] }),
        ...(methods["removeTemp"] === undefined
            ? {}
            : { removeTemp: methods["removeTemp"] })
    });
};
const namespaceName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/**
 * Validates the trust domain a process publishes into.
 *
 * The published key is `<namespace>/<key>` and a content key is bare hex, so a
 * namespace that cannot contain a separator cannot name a key any trusted
 * build computes. An unusable value fails the command: a job that meant to
 * publish somewhere untrusted must not silently publish to trunk instead.
 *
 * @category validation
 * @since 0.1.0
 * @slop
 */
export const normalizePublishNamespace = (value, what = "remote cache publishNamespace") => {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !namespaceName.test(value)) {
        throw new TypeError(`${what} must be 1 to 64 characters of letters, digits, dots, underscores, and dashes, ` +
            "starting with a letter or digit");
    }
    return value;
};
/**
 * The trust domain a `SMITHERS_CACHE_NAMESPACE` value names.
 *
 * Unset or blank is the trusted keyspace: a post-merge publisher leaves the
 * variable out, and a CI job on `main` renders it empty, so both publish and
 * read the bare content key. Any other value must be a usable namespace.
 *
 * @category validation
 * @since 0.1.0
 */
export const publishNamespaceFromEnvironment = (value) => {
    const declared = value?.trim();
    return declared === undefined || declared === ""
        ? undefined
        : normalizePublishNamespace(declared, "SMITHERS_CACHE_NAMESPACE");
};
const normalizeOpenCacheOptions = (value) => {
    const record = plainDataRecord(value, "cache options");
    exactDataKeys(record, new Set([
        "workspaceRoot",
        "cacheDirectory",
        "endpoint",
        "readToken",
        "writeToken",
        "publishNamespace",
        "fetch",
        "warn",
        "timeouts",
        "io"
    ]), "cache options");
    const workspaceRoot = dataMember(record, "workspaceRoot", "cache options");
    const cacheDirectory = dataMember(record, "cacheDirectory", "cache options");
    const readToken = dataMember(record, "readToken", "cache options") ?? (() => undefined);
    // One declared credential keeps serving both directions, so a deployment
    // that has not split its secrets behaves exactly as it did before.
    const writeToken = dataMember(record, "writeToken", "cache options") ?? readToken;
    const fetch = dataMember(record, "fetch", "cache options") ?? globalThis.fetch;
    const warn = dataMember(record, "warn", "cache options") ?? Native.defaultWarn;
    if (typeof workspaceRoot !== "string" ||
        workspaceRoot.length === 0 ||
        workspaceRoot.length > 32 * 1024 ||
        !isWellFormedText(workspaceRoot) ||
        workspaceRoot.includes("\0") ||
        Native.byteLength(workspaceRoot, "utf8") > 32 * 1024)
        throw new TypeError("cache workspaceRoot must be bounded non-empty usable text");
    if (cacheDirectory !== undefined && typeof cacheDirectory !== "string") {
        throw new TypeError("cache cacheDirectory must be a string");
    }
    if (typeof cacheDirectory === "string" &&
        (cacheDirectory.length > 32 * 1024 || !isWellFormedText(cacheDirectory) || cacheDirectory.includes("\0")))
        throw new TypeError("cache cacheDirectory must be bounded usable text");
    if (typeof readToken !== "function")
        throw new TypeError("remote cache readToken must be a function");
    if (typeof writeToken !== "function")
        throw new TypeError("remote cache writeToken must be a function");
    if (typeof fetch !== "function")
        throw new TypeError("remote cache fetch must be a function");
    if (typeof warn !== "function")
        throw new TypeError("remote cache warn must be a function");
    return Object.freeze({
        workspaceRoot,
        cacheDirectory: Config.normalizeCacheDirectory(cacheDirectory ?? Config.defaultCacheDirectory),
        endpoint: normalizeEndpoint(dataMember(record, "endpoint", "cache options")),
        readToken: readToken,
        writeToken: writeToken,
        publishNamespace: normalizePublishNamespace(dataMember(record, "publishNamespace", "cache options")),
        fetch: fetch,
        warn: warn,
        timeouts: validateTimeouts(dataMember(record, "timeouts", "cache options")),
        io: normalizeCacheIo(dataMember(record, "io", "cache options"))
    });
};
class RemoteStore {
    endpoint;
    readToken;
    writeToken;
    publishNamespace;
    fetch;
    warn;
    timeouts;
    degraded = false;
    publishDenied = false;
    conflictWarned = false;
    busyWarned = false;
    constructor(options) {
        this.endpoint = options.endpoint.replace(/\/+$/, "");
        this.readToken = options.readToken;
        this.writeToken = options.writeToken;
        this.publishNamespace = options.publishNamespace;
        this.fetch = options.fetch;
        this.warn = options.warn;
        this.timeouts = options.timeouts;
    }
    /**
     * The key one result is published under.
     *
     * Reads always use the bare content key, so an untrusted job still gets
     * every trusted hit. Only publication is namespaced, because publication is
     * the direction that can put a wrong answer where a trusted build will read
     * it. A job that names an untrusted domain therefore publishes into a
     * keyspace nothing trusted ever looks in, which holds even where the
     * credential split does not: a shared credential, or one that leaked.
     */
    publishedKey(key) {
        return this.publishNamespace === undefined ? key : `${this.publishNamespace}/${key}`;
    }
    /**
     * Disables the remote for the rest of the process, naming why.
     *
     * The reason is the HTTP status, or a bounded description of the thrown
     * failure (a timeout, `ENOTFOUND host`, an invalid token) with every
     * credential value redacted, so an operator can tell a misconfigured token
     * from a network outage.
     */
    degrade(operation, failure) {
        if (this.degraded)
            return;
        this.degraded = true;
        this.warn(`smthrs: remote cache disabled after a failure: ${operation}` +
            (failure === undefined
                ? " request failed"
                : "status" in failure
                    ? ` returned HTTP ${failure.status}`
                    : ` request failed: ${this.describe(failure.cause)}`));
    }
    /** A bounded, credential-free description of one thrown remote failure. */
    describe(cause) {
        const text = (value) => typeof value === "string" && value !== "" ? value : undefined;
        let message = cause instanceof Error ? cause.message : String(cause);
        const inner = cause instanceof Error ? cause.cause : undefined;
        if (typeof inner === "object" && inner !== null) {
            const code = text(inner.code);
            const host = text(inner.hostname);
            if (code !== undefined)
                message += ` (${code}${host === undefined ? "" : ` ${host}`})`;
        }
        for (const read of [this.readToken, this.writeToken]) {
            let token;
            try {
                token = read();
            }
            catch {
                token = undefined;
            }
            if (typeof token === "string" && token.length >= 4)
                message = message.split(token).join("[redacted]");
        }
        message = message.replace(/[\u0000-\u001f\u007f]+/g, " ");
        return message.length > 300 ? `${message.slice(0, 300)}...` : message;
    }
    /**
     * Records that this credential may read but not publish.
     *
     * A refused publication is the read-only posture working, not a broken
     * remote: an untrusted job is meant to pull everything and publish nothing.
     * Degrading the whole store on it would cost that job every later cache hit
     * in the run, so only publication stops.
     */
    denyPublication() {
        if (this.publishDenied)
            return;
        this.publishDenied = true;
        this.warn("smthrs: remote cache publication refused; this credential may only read");
    }
    /**
     * Records that the remote refused one request because it was busy.
     *
     * A `429` is the server's admission control or a credential budget doing
     * its job, not a broken remote. Only the request it answered is lost: a GET
     * becomes a miss and a PUT drops that one publication. Degrading the store
     * instead would let one busy isolate switch the cache off for the whole run.
     */
    skipBusy() {
        if (this.busyWarned)
            return;
        this.busyWarned = true;
        this.warn("smthrs: remote cache busy (HTTP 429); skipped one request");
    }
    url(key) {
        return `${this.endpoint}/ac/${encodeURIComponent(key)}`;
    }
    headers(direction) {
        const headers = new Headers({ "content-type": "application/json" });
        const token = direction === "write" ? this.writeToken() : this.readToken();
        if (token !== undefined &&
            (typeof token !== "string" || token.length > 4_096 || !isWellFormedText(token) ||
                /[\u0000-\u001f\u007f]/.test(token) || Native.byteLength(token, "utf8") > 4_096)) {
            throw new TypeError("remote cache token must be bounded control-free text");
        }
        if (token !== undefined && token !== "") {
            headers.set("authorization", `Bearer ${token}`);
        }
        return headers;
    }
    get(key) {
        return Effect_1.gen({ self: this }, { *"get"() {
                if (this.degraded || !remoteKeySupported(key))
                    return null;
                let fetched;
                const completion_7 = yield* runtime.$catch(Effect_1.fnUntraced(function* get$try() {
                    // The whole exchange runs inside one deadline: the request, the body,
                    // and the parse. Reading the body outside it left a hung response able
                    // to stall the run after the request itself had already come back.
                    fetched = yield* withDeadline("get", this.timeouts.get, Effect_1.fnUntraced(function* (signal) {
                        const response = yield* Effect_1.tryPromise({ try: (async (store, key, signal) => store.fetch(store.url(key), {
                                method: "GET",
                                headers: store.headers("read"),
                                redirect: "error",
                                signal
                            })).bind(undefined, this, key, signal), catch: (cause) => cause });
                        if (response.status === 404) {
                            cancelBody(response.body);
                            return { _tag: "miss" };
                        }
                        if (response.status === 429) {
                            cancelBody(response.body);
                            return { _tag: "busy" };
                        }
                        if (response.status !== 200) {
                            cancelBody(response.body);
                            return { _tag: "degrade", status: response.status };
                        }
                        const text = yield* readBoundedBody(response, remoteEntryLimit);
                        if (text === undefined)
                            return { _tag: "degrade" };
                        let value;
                        const completion_8 = yield* runtime.$catch(Effect_1.fnUntraced(function* () {
                            value = yield* runtime.$trusted(() => JSON.parse(text), [SyntaxError]);
                            return runtime.$normal;
                        })(), Effect_1.fnUntraced(function* () {
                            return { kind: "return", value: { _tag: "degrade" } };
                        }));
                        if (completion_8.kind === "return")
                            return completion_8.value;
                        const envelope = typeof value === "object" && value !== null && !Array.isArray(value) &&
                            Object.hasOwn(value, "keyDigest") && Object.hasOwn(value, "result");
                        if (envelope && value["keyDigest"] !== key) {
                            return { _tag: "degrade" };
                        }
                        const candidate = envelope ? value["result"] : value;
                        const decoded = decodeFor(key, candidate);
                        return decoded === null ? { _tag: "degrade" } : { _tag: "entry", result: decoded };
                    }).bind(this));
                    return runtime.$normal;
                }).call(this), Effect_1.fnUntraced(function* get$catch(cause) {
                    this.degrade("GET", { cause });
                    return { kind: "return", value: null };
                }).bind(this));
                if (completion_7.kind === "return")
                    return completion_7.value;
                if (fetched._tag === "entry")
                    return fetched.result;
                if (fetched._tag === "busy")
                    this.skipBusy();
                if (fetched._tag === "degrade") {
                    this.degrade("GET", fetched.status === undefined ? undefined : { status: fetched.status });
                }
                return null;
            } }["get"]);
    }
    put(key, result) {
        return Effect_1.gen({ self: this }, function* put() {
            const published = this.publishedKey(key);
            if (this.degraded || this.publishDenied || !remoteKeySupported(published))
                return;
            const completion_9 = yield* runtime.$catch(Effect_1.fnUntraced(function* put$try() {
                // The envelope names the key it is filed under, which is the namespaced
                // one. The result inside keeps the content key it was produced for, so
                // the entry a trusted build reads is byte-identical whoever publishes it.
                // The TypeScript's try caught every throw of this block, a user `warn` callback's
                // included: those plain calls are try hatches, so this catch sees them too.
                const body = yield* Effect_1.try({ try: ((published, result) => JSON.stringify({
                        keyDigest: published,
                        result,
                        meta: { target: result.target, label: result.label, exitOk: result.exitOk },
                        createdAtMs: Date.parse(result.storedAt)
                    })).bind(undefined, published, result), catch: (cause) => cause });
                if (Native.byteLength(body, "utf8") > remoteEntryLimit) {
                    return yield* Effect_1.fail(new RangeError(`remote cache request exceeds its ${remoteEntryLimit}-byte limit`));
                }
                const status = yield* withDeadline("put", this.timeouts.put, Effect_1.fnUntraced(function* (signal) {
                    const response = yield* Effect_1.tryPromise({ try: (async (store, published, body, signal) => store.fetch(store.url(published), {
                            method: "PUT",
                            headers: store.headers("write"),
                            body,
                            redirect: "error",
                            signal
                        })).bind(undefined, this, published, body, signal), catch: (cause) => cause });
                    // Draining inside the deadline keeps a server that answers and then
                    // holds the connection open from stalling the run.
                    cancelBody(response.body);
                    return response.status;
                }).bind(this));
                if (status === 200 || status === 201)
                    return { kind: "return" };
                if (status === 401 || status === 403)
                    return { kind: "return", value: yield* Effect_1.try({ try: ((store) => store.denyPublication()).bind(undefined, this), catch: (cause) => cause }) };
                if (status === 429)
                    return { kind: "return", value: yield* Effect_1.try({ try: ((store) => store.skipBusy()).bind(undefined, this), catch: (cause) => cause }) };
                if (status === 409) {
                    if (!this.conflictWarned) {
                        this.conflictWarned = true;
                        yield* Effect_1.try({ try: ((store) => store.warn("smthrs: remote cache conflict; keeping the first published result")).bind(undefined, this), catch: (cause) => cause });
                    }
                    return { kind: "return" };
                }
                yield* Effect_1.try({ try: ((store, status) => store.degrade("PUT", { status })).bind(undefined, this, status), catch: (cause) => cause });
                return runtime.$normal;
            }).call(this), Effect_1.fnUntraced(function* put$catch(cause) {
                this.degrade("PUT", { cause });
                return runtime.$normal;
            }).bind(this));
            if (completion_9.kind === "return")
                return completion_9.value;
        });
    }
    close() { }
}
/**
 * Opens the workspace cache.
 *
 * Local entries live under `<workspaceRoot>/<cacheDirectory>/cache` as JSON
 * files addressed by sanitized key and published atomically: an exclusively
 * created sibling temporary file is written, synced, and closed before it is
 * renamed onto the entry path, so a reader sees either no entry or the whole
 * entry. The cache directory must stay inside the workspace once symbolic
 * links resolve, checked when it is opened and again when an entry is written.
 * Every entry read from either store is bounded, type-checked, and must name
 * the requested key, so a truncated, oversize, forged, or misfiled entry is a
 * miss rather than another action's result. `cacheDirectory` is the
 * workspace-relative directory the CLI resolved and defaults to `.flows`. When
 * `endpoint` names an HTTP cache, the store also reads through its `/ac`
 * route: a local hit never touches the remote, a remote hit hydrates the local
 * file, and a put writes both sides.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export const openCache = (opts) => Native.runAsync(Effect_1.fnUntraced(function* () {
    const options = normalizeOpenCacheOptions(opts);
    const workspaceRoot = yield* Effect_1.tryPromise({ try: (async (workspaceRoot) => Fs.realpath(NodePath.resolve(workspaceRoot))).bind(undefined, options.workspaceRoot), catch: (cause) => cause });
    const cacheRoot = yield* ensureCacheDirectoryProgram(workspaceRoot, options.cacheDirectory);
    const remote = options.endpoint === undefined
        ? null
        : new RemoteStore({
            endpoint: options.endpoint,
            readToken: options.readToken,
            writeToken: options.writeToken,
            publishNamespace: options.publishNamespace,
            fetch: options.fetch,
            warn: options.warn,
            timeouts: options.timeouts
        });
    const store = {
        get(key) {
            return Native.runAsync(Effect_1.fnUntraced(function* () {
                const local = yield* readLocal(cacheRoot, key);
                if (local !== null)
                    return local;
                if (remote === null)
                    return null;
                const fetched = yield* remote.get(key);
                if (fetched === null)
                    return null;
                yield* $catchExpression(Effect_1.fnUntraced(function* () { return yield* writeLocal(cacheRoot, key, fetched, options.io); }), Effect_1.fnUntraced(function* () { return undefined; }));
                return fetched;
            }));
        },
        put(key, r, putOptions) {
            return Native.runAsync(Effect_1.fnUntraced(function* () {
                sanitizeKey(key);
                const result = normalizeCachedResult(key, r);
                yield* writeLocal(cacheRoot, key, result, options.io);
                if (remote !== null && putOptions?.shared !== false)
                    yield* remote.put(key, result);
            }));
        },
        close() {
            if (remote !== null)
                remote.close();
            return Promise.resolve();
        }
    };
    return store;
}));
