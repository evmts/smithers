/** Layer exclusions require a product-spec reason; missing doors remain gaps. */
export type Layer = "ui" | "api" | "cli" | "tui"

export type Domain =
  | "auth"
  | "repositories"
  | "ask-pr"
  | "issues-prs"
  | "todos"
  | "flows"
  | "settings"
  | "wiki-memory"
  | "multiplayer"
  | "agents"
  | "install"
  | "cli-tui"

/** Status belongs to run evidence, never the product catalog. */
export interface FlowEntry {
  readonly id: string
  readonly title: string
  readonly spec: readonly string[]
  readonly operations?: readonly string[]
  readonly actors?: readonly string[]
  readonly na?: Partial<Record<Layer, string>>
  /** Open issue references, verified on 2026-10-19; these do not imply status. */
  readonly issues?: readonly number[]
}
