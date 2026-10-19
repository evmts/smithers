// A-2/E-4 (D38) and E-7: a Fetch is a Promise boundary the scheduler awaits. It runs the
// transfer program with Effect.runPromiseExit and writes through a node:fs file handle, so
// `download`, its temporary-file handling and `writeChunk` stay TypeScript, unchanged from
// FetchExecutor.ts. The transfer program and the plain helpers are FetchExecutor.vibe's,
// passed in as arguments.
import * as Cause from "effect/Cause"
import type * as Effect from "effect/Effect"
import * as EffectRuntime from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fs from "node:fs/promises"
import * as NodePath from "node:path"
import { FetchError, maximumFetchBytes, redactUrl, type Result } from "./FetchExecutor.vibe"
import * as NativeArtifactOutput from "./NativeArtifactOutput.ts"

interface DownloadedFile {
  readonly bytes: number
  readonly sha256: string
}

/** FetchExecutor.vibe's transfer program and private helpers. */
export interface Helpers {
  readonly transfer: (
    url: string,
    safeUrl: string,
    destination: string,
    limitBytes: number,
    openTemporary: () => Promise<Fs.FileHandle>,
    settle: () => Promise<void>
  ) => Effect.Effect<DownloadedFile, unknown, never>
  readonly transportReason: (cause: unknown, fallback: string) => string
  readonly writeFailure: (destination: string, cause: unknown) => FetchError
}

/** Writes one complete response chunk, accounting for partial file writes. */
export const writeChunk = async (handle: Fs.FileHandle, chunk: Uint8Array): Promise<void> => {
  let offset = 0
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset, null)
    if (bytesWritten === 0) throw new Error("the temporary fetch file accepted a zero-byte write")
    offset += bytesWritten
  }
}

const downloadedFile = async (
  url: string,
  signal: AbortSignal | undefined,
  temporary: string,
  destination: string,
  limitBytes: number,
  checkParent: () => Promise<void>,
  { transfer, transportReason }: Helpers
): Promise<DownloadedFile> => {
  const safeUrl = redactUrl(url)
  let handle: Fs.FileHandle | undefined
  const openTemporary = async (): Promise<Fs.FileHandle> => {
    if (handle !== undefined) return handle
    await checkParent()
    handle = await Fs.open(temporary, "wx", 0o644)
    return handle
  }
  const settle = async (): Promise<void> => {
    const output = await openTemporary()
    // `open`'s mode is masked by the process umask, but a CAS restore of
    // the same file chmods it to 0o644. Keep a fresh download identical.
    await output.chmod(0o644)
    await output.sync()
    await output.close()
    handle = undefined
  }
  const effect = transfer(url, safeUrl, destination, limitBytes, openTemporary, settle)
  try {
    const exit = await EffectRuntime.runPromiseExit(effect, { signal })
    if (Exit.isSuccess(exit)) return exit.value
    const cause: unknown = Cause.squash(exit.cause)
    if (cause instanceof FetchError) throw cause
    throw new FetchError(
      "request_failed",
      `Fetch request failed for ${safeUrl}: ${transportReason(cause, "HTTP transport failed")}`,
      undefined,
      undefined,
      { cause }
    )
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined)
  }
}

/** `download`, unchanged. */
export const download = async (options: {
  readonly root: string
  readonly url: string
  readonly sha256: string
  readonly outFile: string
  readonly signal?: AbortSignal | undefined
  /** Internal test seam; production callers use {@link maximumFetchBytes}. */
  readonly limitBytes?: number | undefined
}, helpers: Helpers): Promise<Result> => {
  const destination = NodePath.join(options.root, ...options.outFile.split("/"))
  try {
    return await NativeArtifactOutput.publish(options.root, options.outFile, async (temporary, checkParent) => {
      const downloaded = await downloadedFile(
        options.url,
        options.signal,
        temporary,
        destination,
        options.limitBytes ?? maximumFetchBytes,
        checkParent,
        helpers
      )
      if (downloaded.sha256 !== options.sha256) {
        throw new FetchError(
          "digest_mismatch",
          `Fetch sha256 mismatch: expected ${options.sha256}, actual ${downloaded.sha256}`,
          options.sha256,
          downloaded.sha256
        )
      }
      return downloaded
    }, options.signal)
  } catch (cause) {
    throw cause instanceof FetchError ? cause : helpers.writeFailure(destination, cause)
  }
}
