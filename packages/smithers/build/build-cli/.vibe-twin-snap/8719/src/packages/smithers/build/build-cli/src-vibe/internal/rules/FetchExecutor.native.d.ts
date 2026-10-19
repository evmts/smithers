import type * as Effect from "effect/Effect";
import * as Fs from "node:fs/promises";
import { FetchError, type Result } from "./FetchExecutor.vibe";
interface DownloadedFile {
    readonly bytes: number;
    readonly sha256: string;
}
/** FetchExecutor.vibe's transfer program and private helpers. */
export interface Helpers {
    readonly transfer: (url: string, safeUrl: string, destination: string, limitBytes: number, openTemporary: () => Promise<Fs.FileHandle>, settle: () => Promise<void>) => Effect.Effect<DownloadedFile, unknown, never>;
    readonly transportReason: (cause: unknown, fallback: string) => string;
    readonly writeFailure: (destination: string, cause: unknown) => FetchError;
}
/** Writes one complete response chunk, accounting for partial file writes. */
export declare const writeChunk: (handle: Fs.FileHandle, chunk: Uint8Array) => Promise<void>;
/** `download`, unchanged. */
export declare const download: (options: {
    readonly root: string;
    readonly url: string;
    readonly sha256: string;
    readonly outFile: string;
    readonly signal?: AbortSignal | undefined;
    /** Internal test seam; production callers use {@link maximumFetchBytes}. */
    readonly limitBytes?: number | undefined;
}, helpers: Helpers) => Promise<Result>;
export {};
