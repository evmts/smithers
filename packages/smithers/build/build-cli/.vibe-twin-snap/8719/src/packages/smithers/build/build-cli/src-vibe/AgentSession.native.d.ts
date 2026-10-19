import * as NodeFs from "node:fs";
import type { CandidateOverlay } from "./AgentSession.vibe";
export declare const processEnvironment: () => NodeJS.ProcessEnv;
export declare const platform: () => NodeJS.Platform;
export declare const sha256Hex: (text: string) => string;
export declare const byteLength: (text: string) => number;
export declare const bufferFrom: (chunk: Uint8Array) => Buffer;
export declare const utf8Buffer: (text: string) => Buffer;
export declare const utf8Text: (chunk: Uint8Array) => string;
export declare const concatText: (chunks: ReadonlyArray<Buffer>) => string;
export declare const decodeUtf8Fatal: (bytes: Uint8Array) => string;
export declare const resolve: (...paths: Array<string>) => string;
/** Reasons one edit path cannot be a workspace-relative regular path. */
export declare const editPathFailure: (path: string) => string | undefined;
export declare const overlayOf: (workspaceRoot: string, files: ReadonlyMap<string, string | null>) => CandidateOverlay;
/** Publishes new bytes on a fresh inode, retaining only ordinary permission bits. */
export declare const publishFile: (path: string, contents: string, mode?: number) => Promise<void>;
/** Checks each component, including the root, without following symlinks. */
export declare const editPathState: (workspaceRoot: string, path: string) => Promise<ReadonlyMap<string, NodeFs.Stats | undefined>>;
/**
 * Reads one workspace file into a prompt through a descriptor that cannot
 * leave the workspace.
 *
 * Lexical containment is not enough here. `resolve` plus a `..` check judges
 * the text of a path, and `stat`/`readFile` then follow symlinks, so an
 * in-workspace link pointing at `~/.ssh/id_rsa` plus a declared path that
 * traverses it used to send a host file straight into a model prompt. The file
 * is opened without following a final-component link, the current pathname is
 * resolved and re-checked against the real workspace root, and that resolved
 * path must still name the same device and inode as the open descriptor. The
 * size and bytes then come from the descriptor, so a pathname replacement
 * cannot substitute a different file after validation.
 */
export declare const readWithinWorkspace: (workspaceRoot: string, absolute: string, label: string, limit: number) => Promise<{
    readonly kind: "read";
    readonly bytes: Buffer;
} | {
    readonly kind: "oversize";
    readonly size: number;
}>;
