/**
 * Docs data contract shared by the View and its Container.
 * @since 1.0.0
 */

import type { CardCallbacks, CardProps } from "./CardAction.ts"

/**
 * Bundled page projection; loading and persisted-card decoding belong to the container.
 * @since 1.0.0
 * @category models
 */
export type DocsCard = {
  toc: { slug: string; title: string }[]
  page: { slug: string; title: string; summary: string; markdown: string }
  anchor?: string
  not_found?: string
  /** Each screenshot's light and dark file URLs, keyed by the source a page writes (`images/<id>.webp`). */
  images?: Record<string, { light: string; dark: string }>
}

/**
 * The Docs View's props. `gestures.open`: a toc entry or an in-page `.md` link raises
 * `onAction(gestures.open.tag, { page: "<slug>#<anchor>" })` (the `docs` flow).
 * @since 1.0.0
 * @category models
 */
export type DocsViewProps = CardProps<DocsCard, {}, "open">

/**
 * Typed catalog callbacks for Docs.
 * @since 1.0.0
 * @category models
 */
export type DocsCardCallbacks = CardCallbacks<"docs">
