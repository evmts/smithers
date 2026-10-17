/*
 * The repository-flows seam: the flow catalog of the active repository, as
 * `.smithers/factory.json` declares it (the `flows` rows of the factory
 * projection), held in the `repositoryFlows` collection so the registry can
 * derive one slash leaf per row synchronously (flows/entries/flow.ts
 * `repositoryFlowLeaves`). Homepage flow buttons and slash leaves read these
 * same rows.
 *
 * The read is the public contents route the Dispatcher card and the palette's
 * target search already use (TriggersSeam.readFactoryProjection), allowlisted
 * signed out, so a visitor sees the repository's flows before signing in. The
 * leaves themselves defer through sign-in when run: that door is flow.run's.
 *
 * Data-driven end to end: the collection holds what the mirror answered and
 * nothing else. A mirror without a projection has no leaves; the row also
 * carries its resolved homepage or a visible read failure. A repository that
 * stops being the target keeps its row, and the leaves follow the target (AppController
 * `repositoryFlows`). Each repository is read once per session, in the
 * background, the first time it becomes the target for an account; `load` re-reads on demand.
 * No flow name is written in this app.
 *
 * The target is re-resolved after every transition; per-repository dedup
 * avoids repeat reads.
 */
import type { RepositoryFlow } from "../AppState"
import { FlowViewSchema, RepositoryHomeSchema } from "@smthrs/rpc/RepositoryHome"
import type { FlowView, RepositoryHome } from "@smthrs/rpc/RepositoryHome"
import { resolveTargetRepo } from "../RepoContext"
import type { SeamContext } from "./SeamContext"
import { captureCloudOwner } from "./SeamContext"
import { readFactoryProjection } from "./TriggersSeam"

export interface RepositoryFlowsSeam {
  /** Read one repository's flows and homepage; an absent projection clears its leaves. */
  readonly load: (repo: string) => Promise<void>
  /** Read the active repository's flows, and every new target's as it becomes one, until disposed. */
  readonly subscribe: (onDispose: (release: () => void) => void) => void
}

/** The projection's flow rows as the collection keeps them, featured first (stable), in catalog order. */
export const repositoryFlowsOf = (
  flows: ReadonlyArray<{
    readonly id: string
    readonly description: string
    readonly summary: string | null
    readonly featured: boolean
    readonly model: string | null
    readonly modelInvocable: boolean
    readonly inputSchema?: unknown
    readonly view?: unknown
  }>
): Array<RepositoryFlow> =>
  [...flows]
    .sort((left, right) => Number(right.featured) - Number(left.featured))
    .map(({ id, description, summary, featured, model, modelInvocable, inputSchema, view }) => ({ id, description, summary, featured, model, modelInvocable,
      ...(inputSchema === undefined ? {} : { inputSchema }), ...(view === undefined ? {} : { view }) }))

/** The view a catalog flow declares: its blocks, none, or a declaration this build cannot read. */
export const flowViewOf = (flow: RepositoryFlow): FlowView | "none" | "unreadable" => {
  if (flow.view === undefined) return "none"
  // A block kind this build does not draw is left out, as on the homepage.
  const parsed = FlowViewSchema.safeParse((knownBlocks({ blocks: flow.view }) as { readonly blocks: unknown }).blocks)
  return parsed.success ? parsed.data : "unreadable"
}

type HomeAnswer = RepositoryHome | { readonly kind: "error"; readonly message: string }

/**
 * Draws each `view` block of a homepage as the named flow's declared view
 * (`Smithers.Home.View`), from the catalog read beside it. A view that cannot
 * be drawn fails the homepage with a sentence naming the flow, so the tree
 * stays the view and says why; it never renders an empty frame.
 */
export const resolveFlowViews = (
  home: HomeAnswer,
  flows: ReadonlyArray<RepositoryFlow>,
  catalog: "read" | "absent" | "unreadable"
): HomeAnswer => {
  if (home.kind !== "blocks" || !home.blocks.some((block) => block.type === "view")) return home
  const blocks: Array<Extract<RepositoryHome, { kind: "blocks" }>["blocks"][number]> = []
  for (const block of home.blocks) {
    if (block.type !== "view") {
      blocks.push(block)
      continue
    }
    const named = `The ${block.flow} view`
    const flow = flows.find((row) => row.id === block.flow)
    if (flow === undefined) {
      return { kind: "error", message: catalog === "unreadable" ? `${named} is unavailable: the flow catalog could not be read` : `${named} is unavailable: this repository has no flow ${block.flow}` }
    }
    const view = flowViewOf(flow)
    if (view === "none") return { kind: "error", message: `${named} is unavailable: ${block.flow} declares no view` }
    if (view === "unreadable") return { kind: "error", message: `${named} is invalid` }
    blocks.push(...view)
  }
  return blocks.length > 32 ? { kind: "error", message: "Homepage is invalid" } : { kind: "blocks", blocks }
}

export const createRepositoryFlowsSeam = (
  ctx: SeamContext,
  /** The homepage landed: a block that reads live state (the stack) starts its read. */
  onHome?: (repo: string, home: RepositoryHome | { readonly kind: "error"; readonly message: string }) => void
): RepositoryFlowsSeam => {
  /** The latest read of each repository, current only for the account that started it. */
  const read = new Map<string, () => boolean>()
  let disposed = false

  const load: RepositoryFlowsSeam["load"] = async (repo) => {
    const current = captureCloudOwner(ctx, false)
    read.set(repo, current)
    const [answer, declared] = await Promise.all([readFactoryProjection(ctx, repo), readRepositoryHome(ctx, repo)])
    if (disposed || !current() || read.get(repo) !== current) return
    const flows = "error" in answer || answer.absent ? [] : repositoryFlowsOf(answer.projection.flows ?? [])
    /*
     * How the read ended, which the empty `flows` of all three cases cannot
     * say: a refused read states nothing about what the repository declares,
     * and a reader that cannot tell it from an answered one publishes a
     * verdict the read never reached (controller/agents.ts, #3831).
     */
    const catalog = "error" in answer ? "unreadable" : answer.absent ? "absent" : "read"
    const home = resolveFlowViews(declared, flows, catalog)
    ctx.dispatch({ type: "repository-flows.loaded", actor: "system", repo, flows, home, catalog })
    onHome?.(repo, home)
  }

  const loadTarget = (): void => {
    if (disposed) return
    const target = resolveTargetRepo(ctx.store, undefined)
    if ("error" in target) return
    if (read.get(target.repo)?.()) {
      // Back on a repository read earlier: its homepage's live blocks resume.
      const home = ctx.store.collections.repositoryFlows.get(target.repo)?.home
      if (home !== undefined) onHome?.(target.repo, home)
      return
    }
    void load(target.repo)
  }

  const subscribe: RepositoryFlowsSeam["subscribe"] = (onDispose) => {
    loadTarget()
    const subscription = ctx.store.collections.transitions.subscribeChanges((changes) => {
      /* Working-copy live views settle after the transition subscribers. */
      if (changes.some((change) => change.type === "insert")) queueMicrotask(loadTarget)
    })
    onDispose(() => {
      disposed = true
      subscription.unsubscribe()
    })
  }

  return { load, subscribe }
}

const KNOWN_BLOCKS = new Set(["prompt", "flows", "markdown", "text", "links", "stack", "app", "view"])
/** A block kind this build does not render is left out, never the whole homepage. */
const knownBlocks = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { blocks?: unknown }).blocks)) return body
  const blocks = (body as { blocks: ReadonlyArray<unknown> }).blocks
  return { ...body, blocks: blocks.filter((block) => typeof block !== "object" || block === null || KNOWN_BLOCKS.has(String((block as { type?: unknown }).type))) }
}

/** One server-resolved read, including README fallback and visible failures. */
export const readRepositoryHome = async (
  ctx: Pick<SeamContext, "http" | "baseUrl">,
  repo: string
): Promise<RepositoryHome | { readonly kind: "error"; readonly message: string }> => {
  const [owner = "", name = ""] = repo.split("/")
  try {
    const response = await ctx.http(`${ctx.baseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/home`)
    // A repository the backend does not host has no homepage, not a failure.
    if (response.status === 404) return { kind: "none" }
    if (!response.ok) return { kind: "error", message: "Homepage unavailable" }
    const parsed = RepositoryHomeSchema.safeParse(knownBlocks(await response.json()))
    return parsed.success ? parsed.data : { kind: "error", message: "Homepage is invalid" }
  } catch {
    return { kind: "error", message: "Homepage unavailable" }
  }
}
