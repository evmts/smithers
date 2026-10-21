import { flowPath } from "./contract"
import type { Generated } from "./schema"

// What the Generated chip and the editor's warning show (docs/features/repo.md#generated-files): pure, from how the
// file is generated and where the view is.

/** One link the chip offers: its words and where it goes; no `href` when the place isn't in the repository. */
export interface GeneratedLink {
  readonly label: string
  readonly href?: string
}

/** The chip's links: the flow that produced the file, its last run, and its sources. */
export interface GeneratedLinks {
  readonly flow?: GeneratedLink
  readonly run?: GeneratedLink
  readonly sources: ReadonlyArray<GeneratedLink>
}

/**
 * The links of a generated file, at the view's revision: the flow's source (the manifest's `source`, else
 * `.smithers/flows/<tag>/flow.ts`) when the repository has it, the last run's page, and each input the repository has.
 * The manifest's paths are from its project `folder` (`""`: the repository's root). `blobHref` is the view's link to a
 * file at its revision; `has` says whether the repository has a path there. A file marked only by its header names
 * none of them.
 */
export const generatedLinksOf = (
  generated: Generated,
  blobHref: (path: string) => string,
  has: (path: string) => boolean,
  folder = "",
): GeneratedLinks => {
  if (generated.by === "marker") return { sources: [] }
  const { flow, source, inputs = [], run } = generated.output
  const inRepository = (path: string) => (folder === "" ? path : `${folder}/${path}`)
  const link = (label: string, path: string): GeneratedLink => {
    const full = inRepository(path)
    return has(full) ? { label, href: blobHref(full) } : { label }
  }
  return {
    flow: link(flow, source ?? flowPath(flow)),
    ...(run === undefined ? {} : { run: { label: run, href: `/app/runs/${encodeURIComponent(run)}` } }),
    sources: inputs.map((input) => {
      const path = typeof input === "string" ? input : input.path
      return link(path, path)
    }),
  }
}

/** Where the editor's warning sends someone who meant to change a generated file: its first source, or its flow. */
export const editInsteadOf = (links: GeneratedLinks): GeneratedLink | undefined =>
  links.sources.find((source) => source.href !== undefined) ?? (links.flow?.href === undefined ? undefined : links.flow)
