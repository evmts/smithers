import { AUTH_SIGNED_IN_PARAM } from "@smthrs/rpc/AgentApiRoutes"
import type { FetchLike } from "@smthrs/rpc/NativeAgent"
import { appCoverageRow, readRepoAccess } from "./RepositoryEntryOffer"
import type { AppController } from "./state/AppController"
import type { AppStore } from "./state/AppStore"
import { parseRepoSelection,repoTreeRowId,sharedCopyIdOf } from "./state/AppState"
import { randomUuid } from "./runtime/RandomUuid"

/*
 * A repository's app lives at `/owner/name` (https://smithers.sh/smithersai/smithers).
 * The landing page's older "Open in Smithers" link lands on `/?repo=owner/name`.
 * The path wins; the parameter is read only at `/`. The name is honoured only
 * when the signed-in inventory or public catalog (GET /api/public/repos)
 * carries it: a catalog row enters the repositories collection
 * and becomes the active selection, so the first turn is about that
 * repository. The path stays in the address bar, so a reload reselects; the
 * parameter is removed from the URL either way, so a reload does not.
 */

export const REPO_PARAM = "repo"
export const PUBLIC_REPOS_PATH = "/api/public/repos"

const REPO_NAME = /^[\w.-]+\/[\w.-]+$/

/**
 * The `owner/name` a `/owner/name` path names (exactly two segments), or null
 * for any other path. A trailing slash is the same repository: a prerendered
 * `/owner/name/index.html` is served at `/owner/name/` by hosts that do not
 * strip it.
 */
export const pathRepo = (pathname: string): string | null => {
  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(pathname)
  if (match === null) return null
  const value = `${match[1]}/${match[2]}`
  return REPO_NAME.test(value) ? value : null
}

/** The `owner/name` the `repo` parameter names, or null when absent or not a repository name. */
export const paramRepo = (search: string): string | null => {
  const value = new URLSearchParams(search).get(REPO_PARAM)?.trim() ?? ""
  return REPO_NAME.test(value) ? value : null
}

/** The `owner/name` the URL asks for: the `/owner/name` path first, else the `repo` parameter at `/`. */
export const requestedRepo = (location: Pick<Location, "pathname" | "search">): string | null =>
  pathRepo(location.pathname) ?? (location.pathname === "/" ? paramRepo(location.search) : null)

export interface CatalogRepository {
  /** `owner/name`, in the catalog's spelling. */
  readonly id: string
  readonly org: string
  readonly name: string
  /** The catalog's curated one-sentence explanation, when it carries one. */
  readonly summary?: string
}

/** Valid repository identities from the live catalog, in its published order. */
export const catalogRepositories = (catalog: unknown): Array<CatalogRepository> => {
  if (typeof catalog !== "object" || catalog === null) return []
  const repos: unknown = (catalog as { readonly repos?: unknown }).repos
  if (!Array.isArray(repos)) return []
  const repositories: Array<CatalogRepository> = []
  const seen = new Set<string>()
  for (const entry of repos) {
    const name: unknown = typeof entry === "object" && entry !== null ? (entry as { readonly name?: unknown }).name : undefined
    if (typeof name !== "string" || !REPO_NAME.test(name) || name.split("/").some(part => part === "." || part === "..") || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const slash = name.indexOf("/")
    const summary: unknown = (entry as { readonly summary?: unknown }).summary
    repositories.push({
      id: name,
      org: name.slice(0, slash),
      name: name.slice(slash + 1),
      ...(typeof summary === "string" && summary.trim() !== "" ? { summary: summary.trim() } : {})
    })
  }
  return repositories
}

/** The catalog entry the request names; the catalog's spelling wins. */
export const catalogRepository = (catalog: unknown, requested: string): CatalogRepository | null =>
  catalogRepositories(catalog).find(repository => repository.id.toLowerCase() === requested.toLowerCase()) ?? null

/*
 * The server drops a longer return path (apps/server validReturnTo), so the
 * client sends the bare page rather than lose the whole return.
 */
const RETURN_TO_MAX_BYTES = 512

/** URLSearchParams adds '=' to flags; keep the tutorial's published bare key. */
const queryString = (params: URLSearchParams): string => params.toString()

/**
 * The page a sign-in started from a repository path returns to: the path and
 * its query, minus the auth markers a previous return spent (`signed-in`,
 * `auth`), so they are never replayed. Null anywhere but `/owner/name`: the
 * landing page is where the callback lands on its own.
 */
export const signInReturnTo = (location: Pick<Location, "pathname" | "search">): string | null => {
  if (pathRepo(location.pathname) === null) return null
  const params = new URLSearchParams(location.search)
  params.delete(AUTH_SIGNED_IN_PARAM)
  params.delete("auth")
  const search = queryString(params)
  const withSearch = `${location.pathname}${search === "" ? "" : `?${search}`}`
  return new TextEncoder().encode(withSearch).byteLength > RETURN_TO_MAX_BYTES ? location.pathname : withSearch
}

/** The same location without the repo parameter; other parameters and the fragment stay. */
export const withoutRepoParam = (location: Pick<Location, "pathname" | "search" | "hash">): string => {
  const params = new URLSearchParams(location.search)
  params.delete(REPO_PARAM)
  const search = queryString(params)
  return `${location.pathname}${search === "" ? "" : `?${search}`}${location.hash}`
}

/** A repository URL must not discard that repository's selected working copy. */
const selectionForRepo = (controller: Pick<AppController, "store">, repo: string): string => {
  const key = controller.store.session().activeRepoKey
  const selected = key == null ? null : parseRepoSelection(key)
  if (selected && selected.repoId === repo && selected.copyId !== undefined &&
    controller.store.collections.workingCopies.get(selected.copyId)?.repoId === repo) return key!
  return repo
}

/**
 * The copy whose files the repository route lists: the person's own
 * per-repository pick first (a selected branch's box stays the one being
 * browsed), then the repository's shared read-only copy, then any other copy
 * already in the inventory. Nothing is created, resumed or woken to answer
 * this — browsing files is a read — so a repository with no copy at all has
 * no tree to open from here and the route says nothing it cannot read.
 */
export const treeCopyOf = (store: AppStore, repo: string): string | undefined => {
  const copies = store.collections.workingCopies
  const key = store.session().activeRepoKey
  const selected = key == null ? null : parseRepoSelection(key)
  if (selected?.repoId === repo && selected.copyId !== undefined && copies.get(selected.copyId)?.repoId === repo) return selected.copyId
  const shared = sharedCopyIdOf(repo)
  if (copies.get(shared) !== undefined) return shared
  return [...copies.values()].find((copy) => copy.repoId === repo)?.id
}

/**
 * The repository's root file tree, the default view of `/owner/repo` (M-45),
 * opened once on arrival for a repository this account has as well as one
 * from the public catalog, at every supported width. It runs `files
 * {operation:"tree"}` through the registry — the same act the sidebar caret
 * runs — so the read, its refusals and its retry are the existing ones; a
 * directory already loaded for this copy is this launch's own state and is
 * left alone.
 */
export const openRepositoryTree = (
  controller: Pick<AppController, "store" | "runCommand">,
  repo: string
): void => {
  const copyId = treeCopyOf(controller.store, repo)
  if (copyId === undefined || controller.store.collections.repoTree.get(repoTreeRowId(copyId, "")) !== undefined) return
  controller.runCommand("files", JSON.stringify({ operation: "tree", copy: copyId }))
}

/**
 * The repository document's default bookmark, read from the public mirror
 * (`GET /api/repos/{o}/{r}`, a public repository read the Worker forwards
 * with no credentials): the bookmark the shared read-only copy tracks. The
 * catalog itself carries no head, so this is the one honest source signed
 * out. Null when the document cannot be read or names no default bookmark:
 * the copy then shows no bookmark, never an invented one.
 */
const defaultBookmarkOf = async (http: FetchLike, repo: string): Promise<string | null> => {
  const [owner = "", name = ""] = repo.split("/")
  try {
    const response = await http(`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { headers: { accept: "application/json" } })
    if (!response.ok) return null
    const body: unknown = await response.json()
    const bookmark: unknown = typeof body === "object" && body !== null ? (body as { readonly default_bookmark?: unknown }).default_bookmark : undefined
    return typeof bookmark === "string" && bookmark !== "" ? bookmark : null
  } catch {
    return null
  }
}

/**
 * The public catalog's rows, joined to the repositories collection so the
 * launcher at `/` can offer real repositories to explore (M-45). False when
 * the catalog could not be read: the launcher then says so rather than
 * showing an empty shelf.
 *
 * Being listed publicly is not a fact about who the reader is, so a row this
 * ACCOUNT already has is never promoted to a catalog row. The account's own
 * public repository stays the account's — the launcher would otherwise move
 * it out of "your repositories" and onto the shelf of things to discover —
 * and only a repository the account does not have enters as `catalog`.
 *
 * `isCurrent` is the caller's account guard: a read that lands after the
 * signed-in person changed writes nothing, so one account's shelf never
 * appears under another's.
 */
export const loadPublicCatalog = async (
  controller: Pick<AppController, "store">,
  http: FetchLike,
  isCurrent: () => boolean = () => true
): Promise<boolean> => {
  let catalog: unknown
  try {
    const response = await http(PUBLIC_REPOS_PATH, { headers: { accept: "application/json" } })
    if (!response.ok) return false
    catalog = await response.json()
  } catch {
    return false
  }
  if (typeof catalog !== "object" || catalog === null || !Array.isArray((catalog as { repos?: unknown }).repos)) return false
  if (!isCurrent()) return false
  const { repositories } = controller.store.collections
  for (const repository of catalogRepositories(catalog)) {
    const existing = repositories.get(repository.id)
    // The account already has it: its own row, and its own membership, stand.
    if (existing !== undefined) continue
    controller.store.dispatch({
      type: "repository.upserted",
      actor: "system",
      repository: { ...repository, ownerKind: "user", head: null, catalog: true }
    })
  }
  return true
}

/** Record the URL before the controller starts any background inventory work. */
export const beginRepositoryEntry = (store: AppStore, requested: string | null): string | undefined => {
  const requestId = requested === null ? undefined : randomUuid()
  store.dispatch({ type: "repository.entry.changed", actor: "system", entry: requested === null ? null : {
    requestId: requestId!, repo: requested, phase: "pending"
  } })
  return requestId
}

/**
 * Select the requested repository from the signed-in inventory or public catalog. The
 * catalog row joins the repositories collection beside whatever the cloud
 * inventory already loaded, then `repo.select` makes it the active one.
 * The repository's shared read-only copy (WorkspaceViews.ts)
 * opens its root in the sidebar on this first paint, and the mirror's
 * default bookmark lands on the row so the copy names it. Returns the
 * refusal when the request could not be honoured.
 * A command retry can resolve admission without activating the repository;
 * its caller also supplies the account/selection ownership check.
 */
export const openRequestedRepo = async (
  controller: Pick<AppController, "store" | "selectRepo" | "runCommand" | "loadRepositories">,
  http: FetchLike,
  requested: string,
  requestId = beginRepositoryEntry(controller.store, requested)!,
  options: { readonly activate?: boolean; readonly isCurrent?: () => boolean; readonly scope?: "command" } = {}
): Promise<string | void> => {
  const entry = () => options.scope === "command" ? controller.store.session().repositoryCommandEntry : controller.store.session().repositoryEntry
  const current = () => entry()?.requestId === requestId && (options.isCurrent?.() ?? true)
  const finish = (error?: string, failureKind: "unavailable" | "not-public" = "unavailable", publicRepositories?: ReadonlyArray<string>): string | void => {
    if (!current()) return
    const result = {
      requestId, repo: requested, phase: error === undefined ? "ready" : "failed", ...(error === undefined ? {} : { error, failureKind }),
      ...(publicRepositories === undefined ? {} : { publicRepositories: [...publicRepositories] })
    } as const
    if (options.scope === "command") {
      const owned = controller.store.session().repositoryCommandEntry
      if (owned?.requestId === requestId) controller.store.dispatch({ type: "repository.command.changed", actor: "system", entry: { ...result, owner: owned.owner } })
    } else controller.store.dispatch({ type: "repository.entry.changed", actor: "system", entry: result })
    return error
  }
  let catalog: unknown
  try {
    const response = await http(PUBLIC_REPOS_PATH, { headers: { accept: "application/json" } })
    if (!response.ok) return finish(`The public repository catalog answered HTTP ${response.status}.`)
    catalog = await response.json()
  } catch {
    // A dropped request or an unreadable body: its thrown text is never copy.
    return finish("The public repository catalog could not be read.")
  }
  if (!current()) return
  if (typeof catalog !== "object" || catalog === null || !Array.isArray((catalog as { repos?: unknown }).repos)) return finish("The public repository catalog could not be read.")
  const repository = catalogRepository(catalog, requested)
  if (repository === null) {
    // A URL grants no access. A signed-in user's inventory is the authority
    // for repositories outside the public catalog; wait for that read before selecting.
    if (controller.store.collections.identitySessions.get("identity")?.state === "signed-in") {
      const failure = await controller.loadRepositories()
      if (!current()) return
      const own = [...controller.store.collections.repositories.values()].find((repo) => repo.id.toLowerCase() === requested.toLowerCase() && repo.catalog !== true)
      if (failure === undefined && own !== undefined) {
        if (options.activate === false || options.scope === "command") return finish()
        const refusal = await controller.selectRepo(selectionForRepo(controller, own.id))
        if (!current()) return
        if (refusal !== undefined) return finish(refusal)
        finish()
        // An own repository opens on its file tree too, not only a catalog one.
        openRepositoryTree(controller, own.id)
        return
      }
      /*
       * Neither the catalog nor this account's inventory has it, so the route
       * owes the person the next step (M-46): Import when the Smithers GitHub
       * App covers the repository for this account, else the App's own
       * installation page. The read is ONE bounded repository-specific
       * diagnosis (`GET /api/user/github-access/{o}/{r}`), not a walk of the
       * account's whole inventory: one repository's entry must not be left
       * unknown by an unrelated repository. The coverage door answers before the refusal is
       * recorded, so the notice paints its offer once instead of correcting
       * itself; an unreadable answer writes no row and says so
       * (RepositoryEntryOffer.ts). A superseded request writes nothing.
       */
      if (options.scope !== "command") {
        const coverage = await readRepoAccess(http, requested)
        if (!current()) return
        if (coverage !== null) {
          controller.store.dispatch({ type: "github.app-status.loaded", actor: "system", status: appCoverageRow(requested, coverage) })
        }
      }
    }
    // App's route welcome names this path and owns its sign-in door.
    return finish(`${requested} is not in the public repository catalog.`, "not-public",
      catalogRepositories(catalog).map(repo => repo.id).filter(id => id.toLowerCase() !== requested.toLowerCase()))
  }
  const { repositories } = controller.store.collections
  const existing = repositories.get(repository.id)
  if (existing?.catalog !== true) {
    controller.store.dispatch({
      type: "repository.upserted",
      actor: "system",
      /*
       * The catalog carries no owner kind and no head. "user" is the
       * conservative reading: the one consumer (the org changesets read)
       * treats it as "no org changesets", never as a fabricated org.
       * `catalog` records where the row came from: readable signed out.
       */
      repository: { ...existing, ...repository, ownerKind: existing?.ownerKind ?? "user", head: existing?.head ?? null, catalog: true }
    })
  }
  if (options.activate === false || options.scope === "command") return finish()
  const refusal = await controller.selectRepo(selectionForRepo(controller, repository.id))
  if (!current()) return
  if (refusal !== undefined) return finish(refusal)
  finish()
  /*
   * The file tree is the repository's default view (M-45), so it opens on the
   * first paint of every supported width — a narrow reader who followed a
   * repository URL came for the repository, and the previous >600px gate left
   * them on a transcript instead.
   */
  openRepositoryTree(controller, repository.id)
  const bookmark = await defaultBookmarkOf(http, repository.id)
  if (!current()) return
  const row = controller.store.collections.repositories.get(repository.id)
  if (bookmark === null || row === undefined || row.head !== null) return
  controller.store.dispatch({
    type: "repository.upserted",
    actor: "system",
    repository: { ...row, head: { bookmark, changeId: null, commitId: null } }
  })
}
