import type { Home } from "@smthrs/views"
import { COMMANDS } from "../commands/catalog"
import { codeHref, HOME_INVALID, HOME_UNREADABLE } from "./contract"
import type { CurrentRow, HomeRow } from "./rows"

// What the page shows of a repository's home, worked out from the rows. Pure: React renders what these answer.

/**
 * The routed repository's page: its home, still being read, or the tree, with one line when a declared home can't
 * show. Before the repository is ready on this device the page is the tree's, which says why it can't show yet.
 */
export type HomePage =
  | { readonly kind: "home"; readonly blocks: ReadonlyArray<Home.Block>; readonly askHref: string }
  | { readonly kind: "loading" }
  | { readonly kind: "tree"; readonly notice: string | null }

export const homePageOf = (current: CurrentRow, home: HomeRow | undefined): HomePage => {
  if (current.key === null || current.defaultBranch === null) return { kind: "tree", notice: null }
  if (home === undefined) return { kind: "loading" }
  if (home.state === "declared" && home.blocks.length > 0) {
    return { kind: "home", blocks: home.blocks, askHref: codeHref(current.owner, current.name, current.defaultBranch) }
  }
  const notice = home.state === "invalid" ? HOME_INVALID : home.state === "unreadable" ? HOME_UNREADABLE : null
  return { kind: "tree", notice }
}

/**
 * The Home and Code tabs' route params, when the repository's home shows: none for a repository without one. Code is
 * the tree route at the default branch, whose name may hold a `/`: its first segment is `$ref`, the rest the splat.
 */
export const tabsOf = (current: CurrentRow, home: HomeRow | undefined) => {
  if (homePageOf(current, home).kind !== "home") return undefined
  const [ref, ...rest] = current.defaultBranch!.split("/")
  return { owner: current.owner, repo: current.name, ref: ref!, _splat: rest.join("/") }
}

/** Whether the composer has a slash command for an app block's flow: the button shows only then. */
export const offered = (flow: string): boolean => COMMANDS.some((command) => command.name === flow)

/** What the composer starts with when a prompt or app block names a command it has: `/<flow> `; else nothing. */
export const draftFor = (flow: string | undefined): string | undefined =>
  flow !== undefined && offered(flow) ? `/${flow} ` : undefined

/** A file a Markdown block reads, as the home view takes it. */
export type HomeFile =
  | { readonly state: "loading" }
  | { readonly state: "text"; readonly text: string }
  | { readonly state: "failed" }

/** The files the shown home's Markdown blocks read, by path. */
export const filesOf = (
  rows: ReadonlyArray<{ readonly path: string; readonly state: "loading" | "text" | "failed"; readonly text: string | null }>,
): Readonly<Record<string, HomeFile>> =>
  Object.fromEntries(
    rows.map((row) => [row.path, row.state === "text" ? { state: "text", text: row.text ?? "" } : { state: row.state }]),
  )
