/**
 * The server-resolved homepage of a repository at main.
 *
 * @since 1.0.0
 */

import { z } from "zod"
import { HttpUrlSchema } from "./WebUrl.ts"

const title = z.string().min(1).max(120)
const flow = z.string().regex(/^[a-z0-9_-]+(?:[./][a-z0-9_-]+)*$/)
const path = z.string().min(1).max(1024).refine((value) =>
  !value.startsWith("/") && !value.includes("\\") &&
  !/[%:?#\x00-\x1f]/.test(value) &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
)

const prompt = z.object({
  type: z.literal("prompt"),
  flow: flow.optional(),
  title: title.optional(),
  placeholder: title.optional()
})
/* An app: a featured flow with a picture (D-18); the tiles of the app home. */
const app = z.object({ type: z.literal("app"), flow, title, picture: z.enum(["issue", "review", "wiki", "schedule"]) })
const flows = z.object({ type: z.literal("flows"), title: title.optional() })
const markdown = z.object({
  type: z.literal("markdown"),
  path,
  title: title.optional(),
  markdown: z.string().max(256 * 1024)
})
const text = z.object({ type: z.literal("text"), title: title.optional(), text: z.string().min(1).max(4096) })
/* The repository's live mythical stack; the app reads it from `@smthrs/rpc/Mythical`. */
const stack = z.object({ type: z.literal("stack"), title: title.optional() })
const links = z.object({
  type: z.literal("links"),
  title: title.optional(),
  links: z.array(z.object({
    label: title,
    url: HttpUrlSchema
  })).min(1)
})
/* A repository flow's declared view, drawn in this place (`Smithers.Home.View`). */
const view = z.object({ type: z.literal("view"), flow })

/** One homepage block after the server resolves markdown content.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryHomeBlockSchema = z.discriminatedUnion("type", [
  prompt,
  app,
  flows,
  markdown,
  text,
  stack,
  links,
  view
])

/** The view a repository flow declares (`Smithers.Flow({ view })`): every block that needs no server resolution.
 * @category schemas
 * @since 1.0.0
 */
export const FlowViewSchema = z.array(z.discriminatedUnion("type", [prompt, app, flows, text, stack, links])).min(1)
  .max(32)
/** The view a repository flow declares.
 * @category models
 * @since 1.0.0
 */
export type FlowView = z.infer<typeof FlowViewSchema>

/** The homepage resolution result at main.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryHomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blocks"), blocks: z.array(RepositoryHomeBlockSchema).max(32) }),
  z.object({ kind: z.literal("readme"), markdown: z.string().max(256 * 1024) }),
  z.object({ kind: z.literal("none") })
])
/** The homepage resolution result at main.
 * @category models
 * @since 1.0.0
 */
export type RepositoryHome = z.infer<typeof RepositoryHomeSchema>
