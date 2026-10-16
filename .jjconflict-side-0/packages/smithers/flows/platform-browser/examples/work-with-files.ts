/**
 * Effect's `FileSystem` over a mounted volume: write, append, refuse an
 * exclusive create, list a tree, stream a bounded slice, and branch on the
 * typed refusal for an operation the volume cannot serve.
 *
 * In a page, `backend` is a ZenFS mount's `fs.promises` and `root` is a
 * directory on it such as `/workspace`. Any `node:fs/promises`-shaped object
 * works, which is how the test runs this against a temp directory.
 *
 * @since 1.0.0-rc.7
 */
import * as BrowserFileSystem from "@smthrs/platform-browser/BrowserFileSystem"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Stream from "effect/Stream"

const decoder = new TextDecoder()

/**
 * Runs the walkthrough under `root` and returns what each step observed.
 *
 * @param backend - The volume's promises API.
 * @param root - An absolute directory on the volume to work in; created if absent.
 * @since 1.0.0-rc.7
 */
export const main = (backend: BrowserFileSystem.ZenFsPromisesLike, root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem

    yield* fs.makeDirectory(`${root}/logs`, { recursive: true, mode: 0o700 })
    yield* fs.writeFileString(`${root}/notes.txt`, "first\n")
    // `flag` is forwarded, so this appends rather than truncating.
    yield* fs.writeFileString(`${root}/notes.txt`, "second\n", { flag: "a" })
    const notes = yield* fs.readFileString(`${root}/notes.txt`)

    // `wx` refuses to overwrite: the backend's EEXIST arrives as AlreadyExists.
    const exclusive = yield* fs.writeFileString(`${root}/notes.txt`, "lost\n", { flag: "wx" }).pipe(
      Effect.as("created"),
      Effect.catch((error) =>
        error.reason._tag === "AlreadyExists" ? Effect.succeed("already exists") : Effect.fail(error)
      )
    )

    yield* fs.writeFileString(`${root}/logs/app.log`, "0123456789")
    const tree = (yield* fs.readDirectory(root, { recursive: true })).sort()

    // Four bytes from offset 2, in chunks of at most three.
    const chunks = yield* Stream.runCollect(
      fs.stream(`${root}/logs/app.log`, { offset: 2, bytesToRead: 4, chunkSize: 3 })
    )
    const slice = chunks.map((chunk) => decoder.decode(chunk))

    // The volume cannot create links; the refusal is typed, not a false success.
    const symlink = yield* fs.symlink(`${root}/notes.txt`, `${root}/link`).pipe(
      Effect.as("created"),
      Effect.catch((error) =>
        error.reason._tag === "PermissionDenied" ? Effect.succeed(error.reason.description) : Effect.fail(error)
      )
    )

    const missing = yield* fs.exists(`${root}/absent.txt`)

    return { notes, exclusive, tree, slice, symlink, missing }
  }).pipe(Effect.provide(BrowserFileSystem.layer(backend)))
