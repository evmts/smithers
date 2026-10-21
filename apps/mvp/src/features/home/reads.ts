import { Home } from "@smthrs/views"
import type { RepoRefused } from "../repo/api"
import { textOf } from "../repo/contract"
import type { FileRow, HomeRow } from "./rows"

// What a read of `.smithers/home.json`, or of a file a Markdown block names, leaves on the device. Pure: the actions
// read, these decide.

/** A read's result as `Effect.result` gives it: the file's bytes, or RepoApi's refusal. */
export type ReadResult =
  | { readonly _tag: "Success"; readonly success: { readonly bytes: Uint8Array } }
  | { readonly _tag: "Failure"; readonly failure: RepoRefused }

/**
 * The home `.smithers/home.json`'s read declares: `absent` when the repository has no such file (404); `invalid` when
 * it is over RepoApi's 512 KiB (`too_large`), binary, or not a home (`Home.read`'s reason); `unreadable` when RepoApi
 * couldn't answer; else `declared` with its sections.
 */
export const homeRowOf = (key: string, result: ReadResult): HomeRow => {
  const row = (state: HomeRow["state"], reason: string | null = null): HomeRow => ({
    key,
    state,
    sections: [],
    contributors: "role",
    skipped: 0,
    reason,
  })
  if (result._tag === "Failure") {
    const { status } = result.failure
    return status === 404 ? row("absent") : status === 413 ? row("invalid", "too_large") : row("unreadable")
  }
  const text = textOf(result.success.bytes)
  if (text === undefined) return row("invalid", "binary")
  const read = Home.read(text)
  return read._tag === "Invalid"
    ? row("invalid", read.reason)
    : {
      key,
      state: "declared",
      sections: read.sections,
      contributors: read.contributors,
      skipped: read.skipped,
      reason: null,
    }
}

/** A Markdown block's file as its read left it: its text, or failed (missing, binary, too large, unreadable). */
export const fileRowOf = (key: string, home: string, path: string, result: ReadResult): FileRow => {
  const text = result._tag === "Success" ? textOf(result.success.bytes) : undefined
  return text === undefined
    ? { key, home, path, state: "failed", text: null }
    : { key, home, path, state: "text", text }
}

/** The distinct files a home's Markdown blocks name, in every section, in order. */
export const markdownPaths = (sections: ReadonlyArray<Home.Section>): ReadonlyArray<string> => [
  ...new Set(
    sections.flatMap((section) => section.blocks.flatMap((block) => (block.type === "markdown" ? [block.path] : []))),
  ),
]
