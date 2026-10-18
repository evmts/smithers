import { AUTH_SIGNED_IN_PARAM } from "@smthrs/rpc/AgentApiRoutes"
import type { FetchLike } from "@smthrs/rpc/NativeAgent"
import { splitRepositoryPath } from "@smthrs/rpc/RepositorySubjectPath"
import type { RepositorySubject } from "@smthrs/rpc/RepositorySubjectPath"
import { appCoverageRow, readRepoAccess } from "./RepositoryEntryOffer"
import type { AppController } from "./state/AppController"
import type { AppStore } from "./state/AppStore"
import { accountOwnerOf } from "./state/AccountOwner"
import { parseRepoSelection,repoTreeRowId,sharedCopyIdOf, type RepositoryEntry } from "./state/AppState"
import { randomUuid } from "./runtime/RandomUuid"

/*
 * A repository's app lives at `/owner/name` (https://smithers.sh/smithersai/smithers),
 * and the GitHub-shaped paths below it name one of its subjects
 * (RepositorySubjectEntry.ts opens them after admission).
 * The landing page's older "Open in Smithers" link lands on `/?repo=owner/name`.
 * The path wins; the parameter is read only at `/`. The name is honoured only
 * when the signed-in inventory or a direct public repository read
 * carries it: the public row enters the repositories collection
 * and becomes the active selection, so the first turn is about that
 * repository. The path stays in the address bar, so a reload reselects; the
 * parameter is removed from the URL either way, so a reload does not.
 */

export const REPO_PARAM = "repo"
export const PUBLIC_REPOS_PATH = "/api/public/repos"

const REPO_NAME = /^[\w.-]+\/[\w.-]+$/

/**
 * The repository a URL names, and the GitHub-shaped subject below it when the
 * path carries one.
 */
export interface RequestedTarget {
  /** `owner/name`, in the URL's own spelling. */
  readonly repo: string
  /** The pull request, pull request list, issue or issue list the path asks for. */
  readonly subject?: RepositorySubject
}

/**
 * The repository and subject a path names, or null for any other path.
 *
 * `/owner/name` is the repository itself; the GitHub-shaped paths below it are
 * its subjects (@smthrs/rpc RepositorySubjectPath), parsed by the same grammar
 * the Worker edge routes with, so the client opens exactly the paths the edge
 * serves the app for. A trailing slash is the same path: a prerendered
 * `/owner/name/index.html` is served at `/owner/name/` by hosts that do not
 * strip it.
 */
export const pathTarget = (pathname: string): RequestedTarget | null => {
  const split = splitRepositoryPath(pathname)
  if (split === undefined) return null
  const repo = `${split.owner}/${split.name}`
  if (!REPO_NAME.test(repo)) return null
  return split.subject === undefined ? { repo } : { repo, subject: split.subject }
}

export { repositoryInputTarget, REPOSITORY_URL_HOSTS, REPOSITORY_INPUT_EMPTY, REPOSITORY_INPUT_INVALID } from "./RepositoryInput"

/** The `owner/name` a repository path or one of its subject paths names, or null. */
export const pathRepo = (pathname: string): string | null => pathTarget(pathname)?.repo ?? null

/** The `owner/name` the `repo` parameter names, or null when absent or not a repository name. */
export const paramRepo = (search: string): string | null => {
  const value = new URLSearchParams(search).get(REPO_PARAM)?.trim() ?? ""
  return REPO_NAME.test(value) ? value : null
}

/**
 * What the URL asks for: the repository path and its subject first, else the
 * `repo` parameter at `/`, which names a repository and never a subject.
 */
export const requestedTarget = (location: Pick<Location, "pathname" | "search">): RequestedTarget | null => {
  const path = pathTarget(location.pathname)
  if (path !== null) return path
  const param = location.pathname === "/" ? paramRepo(location.search) : null
  return param === null ? null : { repo: param }
}

/** The `owner/name` the URL asks for: the `/owner/name` path first, else the `repo` parameter at `/`. */
export const requestedRepo = (location: Pick<Location, "pathname" | "search">): string | null =>
  requestedTarget(location)?.repo ?? null

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
 * `auth`), so they are never replayed. The whole path returns, so a reader who
 * signed in from a pull request comes back to that pull request. Null anywhere
 * but a repository path: the landing page is where the callback lands on its
 * own. The backend accepts any local path of its own (routes/auth_return.go
 * `validBrowserReturn`), so a subject path needs nothing new there.
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
 * Select the requested repository from its authorized document or the signed-in inventory. The
 * admitted row joins the repositories collection beside whatever the cloud
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
  const identityAtStart = controller.store.collections.identitySessions.get("identity")
  const sameAccount = () => {
    const identity = controller.store.collections.identitySessions.get("identity")
    return (identity?.state === "signed-in" || identity?.state === "unavailable") && accountOwnerOf(identity) === identityAtStart?.login &&
      identity.provider === identityAtStart?.provider && identity.ownerRevision === identityAtStart?.ownerRevision
  }
  const current = () => entry()?.requestId === requestId && (options.isCurrent?.() ?? true) &&
    (identityAtStart?.state !== "signed-in" || sameAccount())
  const diagnostics: NonNullable<RepositoryEntry["diagnostics"]> = { stage: "document" }
  const finish = (error?: string, failureKind: "unavailable" | "not-public" = "unavailable", publicRepositories?: ReadonlyArray<string>): string | void => {
    if (!current()) return
    if (error === undefined) diagnostics.stage = "complete"
    const result = {
      requestId, repo: requested, phase: error === undefined ? "ready" : "failed", ...(error === undefined ? {} : { error, failureKind }),
      ...(publicRepositories === undefined ? {} : { publicRepositories: [...publicRepositories] }), diagnostics
    } as const
    if (options.scope === "command") {
      const owned = controller.store.session().repositoryCommandEntry
      if (owned?.requestId === requestId) controller.store.dispatch({ type: "repository.command.changed", actor: "system", entry: { ...result, owner: owned.owner } })
    } else controller.store.dispatch({ type: "repository.entry.changed", actor: "system", entry: result })
    return error
  }
  let tracking: { issueTracker?: "github" | "smithers-cloud"; githubSource?: { owner: string; repo: string } } = {}
  let catalog: unknown
  let memberDocument: { full_name: string; description?: unknown; default_bookmark?: unknown } | undefined
  let guest: { sessionId: string; landingId:string; revision: string } | undefined
  try {
    const path = `/api/repos/${requested.split("/").map(encodeURIComponent).join("/")}`
    const response = await http(path, { headers: { accept: "application/json" }, credentials: "same-origin" })
    if (!current()) return
    diagnostics.documentStatus = response.status
    const backendRequestId = response.headers.get("x-request-id")
    if (backendRequestId !== null && /^[\w/.-]{1,160}$/.test(backendRequestId)) diagnostics.documentRequestId = backendRequestId
    if (!response.ok && ![401, 403, 404].includes(response.status)) return finish(`Repository unavailable (HTTP ${response.status}).`)
    const document = response.ok ? await response.json() as { is_public?: unknown; description?: unknown; full_name?:unknown; default_bookmark?: unknown; issue_tracker?: unknown; github_source?: { owner?: unknown; repo?: unknown } } : undefined
    if (!current()) return
    if (typeof document?.full_name === "string" && document.full_name.toLowerCase() === requested.toLowerCase()) {
      const source = document.github_source
      tracking = {
        issueTracker: undefined, githubSource: undefined,
        ...(document.issue_tracker === "github" || document.issue_tracker === "smithers-cloud" ? { issueTracker: document.issue_tracker } : {}),
        ...(typeof source?.owner === "string" && typeof source.repo === "string" && REPO_NAME.test(`${source.owner}/${source.repo}`) ? { githubSource: { owner: source.owner, repo: source.repo } } : {})
      }
    }
    const canonical = typeof document?.full_name === "string" && document.full_name.toLowerCase() === requested.toLowerCase() ? document.full_name : requested
    catalog = { repos: document?.is_public === true ? [{ name: canonical, summary: document.description }] : [] }
    if (document?.is_public === false && typeof document.full_name === "string" &&
      document.full_name.toLowerCase() === requested.toLowerCase() && identityAtStart?.state !== "signed-in" &&
      controller.store.collections.identitySessions.get("identity")?.state === "signed-in") {
      // Identity may settle while the boot read is in flight. Re-read under
      // that confirmed account instead of attributing an earlier response to it.
      return openRequestedRepo(controller, http, requested, requestId, options)
    }
    if (document?.is_public === false && typeof document.full_name === "string" &&
      document.full_name.toLowerCase() === requested.toLowerCase() && identityAtStart?.state === "signed-in" &&
      typeof identityAtStart.login === "string" && sameAccount() &&
      catalogRepository({ repos: [{ name: document.full_name }] }, requested) !== null) {
      // This exact repository read already passed backend authorization. The
      // account's own-repository inventory need not include an organization or
      // collaborator repository; absence there cannot revoke a successful read.
      memberDocument = { ...document, full_name: document.full_name }
    }
    if (document?.is_public === true) {
      // Public readability alone never authorizes sponsored compute.
      const admission = await http(`/api/repos/${canonical.split("/").map(encodeURIComponent).join("/")}/guest`, { credentials: "same-origin", headers: { accept: "application/json" } }).catch(() => undefined)
      if (admission?.ok) {
        const projection = await admission.json().catch(() => undefined) as { allowed?: unknown; sessionId?: unknown; landingId?:unknown; revision?: unknown } | undefined
        if (projection?.allowed === true && typeof projection.sessionId === "string" && typeof projection.landingId === "string" && typeof projection.revision === "string") guest = { sessionId: projection.sessionId, landingId:projection.landingId, revision: projection.revision }
      }
    }
  } catch {
    // A dropped request or an unreadable body: its thrown text is never copy.
    return finish("Repository unavailable.")
  }
  if (!current()) return
  if (memberDocument !== undefined) {
    diagnostics.source = "member-document"
    const member = catalogRepository({ repos: [{ name: memberDocument.full_name, summary: memberDocument.description }] }, requested)!
    const existing = controller.store.collections.repositories.get(member.id)
    const bookmark = typeof memberDocument.default_bookmark === "string" && memberDocument.default_bookmark !== "" ? memberDocument.default_bookmark : undefined
    controller.store.dispatch({ type: "repository.upserted", actor: "system", repository: {
      ...existing, ...member, ...tracking, ownerKind: existing?.ownerKind ?? "user", catalog: false, guest: undefined,
      documentOwner: identityAtStart!.login!,
      head: bookmark === undefined || existing?.head?.bookmark === bookmark ? existing?.head ?? null : { bookmark, changeId: null, commitId: null }
    } })
    if (options.activate === false || options.scope === "command") return finish()
    diagnostics.stage = "selection"
    const refusal = await controller.selectRepo(selectionForRepo(controller, member.id))
    if (!current()) return
    if (refusal !== undefined) return finish(refusal)
    diagnostics.stage = "complete"
    finish()
    openRepositoryTree(controller, member.id)
    return
  }
  const repository = catalogRepository(catalog, requested)
  if (repository === null) {
    // A URL grants no access. If its document supplied no admission, fall
    // back to the signed-in account's loaded repository inventory.
    if (controller.store.collections.identitySessions.get("identity")?.state === "signed-in") {
      diagnostics.stage = "inventory"
      const failure = await controller.loadRepositories()
      if (!current()) return
      const own = [...controller.store.collections.repositories.values()].find((repo) => repo.id.toLowerCase() === requested.toLowerCase() && repo.catalog !== true && repo.documentOwner === undefined)
      diagnostics.inventory = failure !== undefined ? "unavailable" : own === undefined ? "missing" : "matched"
      if (failure === undefined && own !== undefined) {
        diagnostics.source = "inventory"
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
    return finish(`${requested} is not available publicly.`, "not-public",
      catalogRepositories(catalog).map(repo => repo.id).filter(id => id.toLowerCase() !== requested.toLowerCase()))
  }
  diagnostics.source = "public-document"
  const { repositories } = controller.store.collections
  const existing = repositories.get(repository.id)
  if (existing?.catalog !== true || JSON.stringify(existing.guest) !== JSON.stringify(guest) || existing.issueTracker !== tracking.issueTracker || JSON.stringify(existing.githubSource) !== JSON.stringify(tracking.githubSource)) {
    controller.store.dispatch({
      type: "repository.upserted",
      actor: "system",
      /*
       * The catalog carries no owner kind and no head. "user" is the
       * conservative reading: the one consumer (the org changesets read)
       * treats it as "no org changesets", never as a fabricated org.
       * `catalog` records where the row came from: readable signed out.
       */
      repository: { ...existing, ...repository, ...tracking, guest, ownerKind: existing?.ownerKind ?? "user", head: existing?.head ?? null, catalog: true }
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
