import { Effect } from "effect";
import type * as NodeFsPromises from "node:fs/promises";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
/** `createHash("sha256").update(Buffer.from(key, "utf16le")).digest("hex")`. */
export declare const utf16Sha256: (key: string) => string;
/** `NodeUtil.isProxy`. */
export declare const isProxy: (value: unknown) => boolean;
/** `Buffer.byteLength`. */
export declare const byteLength: (value: string, encoding: "utf8") => number;
/** `NodePath.relative`. */
export declare const relative: (from: string, to: string) => string;
/** `NodePath.isAbsolute`. */
export declare const isAbsolute: (path: string) => boolean;
/** `NodePath.join`. */
export declare const join: (...paths: Array<string>) => string;
/** `NodePath.dirname`. */
export declare const dirname: (path: string) => string;
/** `NodePath.basename`. */
export declare const basename: (path: string) => string;
/** The default warning sink: one line on standard error. */
export declare const defaultWarn: (line: string) => boolean;
/** Cache.ts `openDirectoryLive`: no portable directory descriptor on Windows. */
export declare const openDirectoryLive: (directory: string) => Promise<NodeFsPromises.FileHandle | undefined>;
/** Cache.ts `removeTempLive`. */
export declare const removeTempLive: (temp: string) => Promise<void>;
