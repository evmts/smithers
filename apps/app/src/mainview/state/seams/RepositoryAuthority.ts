/*
 * The viewer's own authority on ONE repository, as the platform resolved it
 * (GET /api/repos/{owner}/{repo}, `permission`). The hosted Secrets card and
 * the secrets flow read it; nothing else grants secret management.
 *
 * Why a read instead of a role already in hand: the roster role the Settings
 * lane publishes off an install comes from the seeded design world, which
 * knows nothing about a hosted repository and answers "member" for its owner.
 * A login, an admin session or a card's payload are not authority either. The
 * platform's own resolver (`middleware.ResolveRepoPermission`) is, and it is
 * the same resolver the secret routes themselves enforce.
 *
 * Scope is the point: one answer is about one repository, read by one
 * identity. A changed repository, a changed account and an unreadable answer
 * each leave the card with no authority rather than the last one that worked.
 */
import { accountOwnerOf } from "../AccountOwner"
import { REPO_TOKEN } from "../RepoContext"
import type { SeamContext } from "./SeamContext"
import { readErrorMessage } from "./SeamContext"

/** The platform's repository permission ranks (`middleware.PermissionLevel`). */
export const REPOSITORY_PERMISSIONS = ["read", "write", "admin", "owner"] as const

/** One rank of {@link REPOSITORY_PERMISSIONS}. */
export type RepositoryPermission = (typeof REPOSITORY_PERMISSIONS)[number]

/**
 * Secret management authority from a repository permission. Only the
 * repository's administrators and its owner may write a secret — the routes
 * behind it require admin — so a writer is a member here, and an absent or
 * unknown rank is nobody.
 */
export const secretRoleOf = (permission: RepositoryPermission | undefined): "owner" | "maintainer" | "member" =>
  permission === "owner" ? "owner" : permission === "admin" ? "maintainer" : "member"

/**
 * What the card and the flow may act on. "loading" and "unreadable" are not
 * roles: neither offers a write, and neither is an empty list either.
 */
export type RepositoryAuthority =
  | { readonly phase: "unscoped" }
  | { readonly phase: "loading"; readonly repo: string }
  | { readonly phase: "ready"; readonly repo: string; readonly permission: RepositoryPermission; readonly role: "owner" | "maintainer" | "member" }
  /** The platform settled it: this identity reaches nothing here. Not an outage, so no retry. */
  | { readonly phase: "refused"; readonly repo: string }
  | { readonly phase: "unreadable"; readonly repo: string; readonly message: string }

const UNSCOPED: RepositoryAuthority = { phase: "unscoped" }

export interface RepositoryAuthoritySeam {
  readonly subscribe: (listener: () => void) => () => void
  /** Changes whenever any answer, failure or account change replaced a state. */
  readonly version: () => number
  /** This identity's authority on `repo`, without asking for it. */
  readonly state: (repo: string | undefined) => RepositoryAuthority
  /** Read `repo`'s authority once; a read already in flight is joined. */
  readonly read: (repo: string | undefined) => Promise<RepositoryAuthority>
  /** Read `repo`'s authority again, discarding what an earlier read answered. */
  readonly refresh: (repo: string | undefined) => void
  /** Retire every answer the signed-in identity changed; readers hear it. */
  readonly identityChanged: () => void
  readonly dispose: () => void
}

/** The identity an answer belongs to; a different stamp retires it. */
const stampOf = (ctx: SeamContext): string | undefined => {
  const identity = ctx.store.collections.identitySessions.get("identity")
  const owner = accountOwnerOf(identity)
  if (identity === undefined || owner == null) return undefined
  return `${owner.toLowerCase()}:${identity.ownerRevision ?? identity.revision}`
}

const permissionOf = (wire: unknown): RepositoryPermission | undefined => {
  const value = (wire as { permission?: unknown } | null)?.permission
  return REPOSITORY_PERMISSIONS.find(rank => rank === value)
}

export const createRepositoryAuthoritySeam = (ctx: SeamContext, options: { readonly ready: boolean }): RepositoryAuthoritySeam => {
  const listeners = new Set<() => void>()
  const answers = new Map<string, RepositoryAuthority>()
  const flights = new Map<string, Promise<RepositoryAuthority>>()
  let version = 0
  let stamp = stampOf(ctx)
  const changed = () => { version += 1; for (const listener of [...listeners]) listener() }
  /* An account change retires every answer: a role is one identity's, never the page's. */
  const scoped = (): boolean => {
    const current = stampOf(ctx)
    if (current === stamp) return true
    stamp = current
    answers.clear()
    flights.clear()
    return false
  }
  const key = (repo: string): string => `${stamp ?? ""}:${repo.toLowerCase()}`
  const target = (repo: string | undefined): string | undefined =>
    options.ready && stamp !== undefined && repo !== undefined && REPO_TOKEN.test(repo) ? repo : undefined
  const state: RepositoryAuthoritySeam["state"] = repo => {
    scoped()
    const named = target(repo)
    return named === undefined ? UNSCOPED : answers.get(key(named)) ?? UNSCOPED
  }
  const load = async (repo: string): Promise<RepositoryAuthority> => {
    const [owner = "", name = ""] = repo.split("/")
    let response: Response
    try {
      response = await ctx.http(`${ctx.baseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
    } catch {
      return { phase: "unreadable", repo, message: `Access to ${repo} is unknown.` }
    }
    /*
     * A refusal is an answer: this identity has no authority here. It is not
     * an outage, so it never offers a retry — and it never grants either.
     */
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      await response.body?.cancel()
      return { phase: "refused", repo }
    }
    if (!response.ok) return { phase: "unreadable", repo, message: await readErrorMessage(response, `Access to ${repo} is unknown.`) }
    const permission = permissionOf(await response.json().catch(() => null))
    /* An answer without a rank proves nothing; it is not a grant and not a list. */
    if (permission === undefined) return { phase: "unreadable", repo, message: `Access to ${repo} is unknown.` }
    return { phase: "ready", repo, permission, role: secretRoleOf(permission) }
  }
  const start = (repo: string): Promise<RepositoryAuthority> => {
    const at = key(repo)
    const running = flights.get(at)
    if (running !== undefined) return running
    answers.set(at, { phase: "loading", repo })
    const flight = load(repo).then(answer => {
      if (flights.get(at) !== flight) return answer
      flights.delete(at)
      if (ctx.isDisposed?.() === true || !scoped()) return answer
      answers.set(at, answer)
      changed()
      return answer
    })
    flights.set(at, flight)
    changed()
    return flight
  }
  return {
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    version: () => version,
    state,
    read: async repo => {
      scoped()
      const named = target(repo)
      if (named === undefined) return UNSCOPED
      const known = answers.get(key(named))
      if (known !== undefined && known.phase !== "loading") return known
      return start(named)
    },
    identityChanged: () => { if (!scoped()) changed() },
    refresh: repo => {
      scoped()
      const named = target(repo)
      if (named === undefined) return
      const at = key(named)
      const settled = answers.get(at)?.phase
      if (flights.has(at) || settled === "ready" || settled === "refused") return
      answers.delete(at)
      void start(named)
    },
    dispose: () => { listeners.clear(); answers.clear(); flights.clear() }
  }
}
