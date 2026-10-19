import * as DependencyDocs from "@smthrs/targets/DependencyDocs";
import { Effect, FileSystem, Path, Schema } from "effect";
/** Where imported pages live, relative to the repository root. */
export declare const directory = ".flows/wiki/deps";
/** The largest document one source may import. */
export declare const maxDocBytes: number;
/** How long one URL may take to answer in full. */
export declare const fetchTimeoutMs = 30000;
declare const DocsImportError_base: Schema.Class<DocsImportError, Schema.TaggedStruct<"DocsImportError", {
    readonly code: Schema.Literals<readonly ["workspace", "invalid", "missing", "digest", "fetch", "too_large"]>;
    readonly source: Schema.String;
    readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
export declare class DocsImportError extends DocsImportError_base {
}
/** What one import wrote. */
export interface Imported {
    readonly name: string;
    readonly files: ReadonlyArray<string>;
    readonly pin: string;
}
/** A response larger than {@link maxDocBytes}, refused before or while it streamed. */
export declare class TooLarge extends Error {
}
/**
 * The `docs` record of the workspace declaration, or `{}` when the
 * repository declares no workspace. The one workspace loader evaluates it
 * afresh on every call and validates the module as every `smthrs` verb does.
 */
export declare const declared: (root: string) => Effect.Effect<Readonly<Record<string, DependencyDocs.Declaration>>, DocsImportError, never>;
/**
 * Fetches one document: no redirect, at most `timeoutMs` in full, and never
 * more than {@link maxDocBytes} + 1 bytes read. A declared or streamed body
 * over the limit rejects with {@link TooLarge}.
 */
export declare const fetchBounded: (url: string, timeoutMs?: number) => Promise<Uint8Array>;
/**
 * Imports every declared source into `root/.flows/wiki/deps`, replacing each
 * source's directory whole, and removes directories no longer declared. The
 * first failing source fails the import before anything is written. Verified
 * bytes are written unchanged, and the receipt hashes those bytes.
 */
export declare const importDocs: (root: string, docs: Readonly<Record<string, DependencyDocs.Declaration>>, fetchBytes?: (url: string) => Promise<Uint8Array>) => Effect.Effect<Imported[], DocsImportError | import("effect/PlatformError").PlatformError, FileSystem.FileSystem | Path.Path>;
/** Reads the workspace declaration and imports what it declares. */
export declare const importDeclared: (root: string, fetchBytes?: (url: string) => Promise<Uint8Array>) => Effect.Effect<Imported[], DocsImportError | import("effect/PlatformError").PlatformError, FileSystem.FileSystem | Path.Path>;
/**
 * The most bytes all dependency pages together may take: a quarter of the
 * 64 KiB of wiki the stack hands a lane, so the repository's own pages keep
 * the rest.
 */
export declare const maxPageBytes: number;
/** Whether a wiki page is an imported dependency file. */
export declare const isDependencyPage: (page: {
    readonly id: string;
    readonly title: string;
}) => boolean;
/** One imported file as a wiki page. */
export interface DependencyPage {
    readonly id: string;
    readonly title: string;
    readonly body: string;
    /** The pin and the file's SHA-256: the page is unchanged while both are. */
    readonly inputDigest: string;
    readonly contentDigest: string;
}
/**
 * The Markdown files a refresh imported under `root`, as pages, verified
 * against each source's receipt. Refuses a set a lane could not be handed
 * whole: a page over {@link maxPageBytes}, all of them together over it, or
 * two whose ids collide.
 */
export declare const publishedPages: (root: string) => Effect.Effect<DependencyPage[], DocsImportError | import("effect/PlatformError").PlatformError, FileSystem.FileSystem | Path.Path>;
/**
 * Writes the dependency pages a stack request was handed into `root`'s
 * {@link directory}, replacing what was there, so `memory` in this checkout
 * reads them as it reads a local import. Other pages are ignored. It
 * refuses a `.flows`, `.flows/wiki` or deps directory that is a link, so it
 * never removes or writes outside the checkout.
 */
export declare const installPages: (root: string, pages: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly body: string;
}>) => Effect.Effect<undefined, DocsImportError | import("effect/PlatformError").PlatformError, FileSystem.FileSystem | Path.Path>;
export {};
