/**
 * Account read and presentation ports shared by Smithers hosts.
 * @since 1.0.0
 */

import { NoInput, operation } from "./Operation.ts"
export { NoInput } from "./Operation.ts"

/** The one Account declaration; hosts bind their identity and presentation ports.
 * @since 1.0.0
 * @category constructors
 */
export const accountOperations = [
  operation({ name: "account.show", summary: "Show account", runtime: ["identity"], input: NoInput })
] as const

/**
 * Account facts verified by the selected host.
 *
 * @since 1.0.0
 * @category models
 */
export interface AccountFacts {
  readonly login: string
  readonly provider?: "github" | "local"
  readonly scopes: ReadonlyArray<{ readonly scope: string; readonly plain: string }>
  readonly boxes: ReadonlyArray<
    { readonly id: string; readonly repoId: string; readonly name: string; readonly status: string }
  >
}

/** The host owns identity selection. A saved credential alone does not verify a login.
 *
 * @since 1.0.0
 * @category models
 */
export interface AccountAuthority {
  readonly state: "unknown" | "signed-out" | "signed-in"
  readonly owner: string
  readonly origin: string
  readonly epoch: number
  readonly login?: string
  readonly provider?: "github" | "local"
  readonly readsScopes: boolean
}

/**
 * An Account read bound to one selected authority.
 *
 * @since 1.0.0
 * @category models
 */
export interface AccountRequest {
  readonly id: string
  readonly authority: AccountAuthority
  readonly read: "identity" | "permissions" | "snapshot"
}
/**
 * The acknowledgment returned by the Account operation.
 *
 * @since 1.0.0
 * @category models
 */
export type AccountAnswer = string | { readonly value: string }
/**
 * Verified Account facts or a safe read failure.
 *
 * @since 1.0.0
 * @category models
 */
export type AccountRead = { readonly facts: AccountFacts } | { readonly error: string }
interface Flight extends AccountRequest {
  readonly abort: AbortController
  admitted: boolean
  admission: Promise<AccountAnswer>
}
/** One shared flight across human and agent bindings of the same host.
 *
 * @since 1.0.0
 * @category models
 */
export interface AccountReads {
  flight: Flight | undefined
}
/**
 * Create the shared request slot for a host.
 *
 * @since 1.0.0
 * @category constructors
 */
export const accountReads = (): AccountReads => ({ flight: undefined })

/**
 * The existing Account card identity.
 *
 * @since 1.0.0
 * @category constructors
 */
export const ACCOUNT_CARD_ID = "account"
/**
 * The existing signed-out acknowledgment.
 *
 * @since 1.0.0
 * @category constructors
 */
export const SIGNED_OUT_VALUE = "signed out: the sign-in step is in the chat"
/**
 * The existing identity-selection acknowledgment.
 *
 * @since 1.0.0
 * @category constructors
 */
export const IDENTITY_PENDING_TEXT = "Still checking who is signed in. Try again in a moment."
const REQUESTED = { value: "Requested" } as const
const superseded = (): AccountAnswer => ({ value: "Account request is no longer current." })

/** Storage and presentation adapters contain no request lifecycle decisions.
 *
 * @since 1.0.0
 * @category models
 */
export interface AccountHost {
  readonly authority: () => AccountAuthority
  readonly disposed: () => boolean
  readonly boxes: () => AccountFacts["boxes"]
  readonly signIn: () => void
  /** Persist before starting any read. Facts may be absent until /api/user answers. */
  readonly admit: (request: AccountRequest, facts: AccountFacts | undefined) => Promise<void>
  /** The currently retained request; host validation fences restoration to its current authority. */
  readonly pending: () => AccountRequest | undefined
  readonly current: (request: AccountRequest) => boolean
  readonly read: (request: AccountRequest, facts: AccountFacts | undefined, signal: AbortSignal) => Promise<AccountRead>
  readonly complete: (request: AccountRequest, answer: AccountRead) => Promise<void>
  /** Existing host notification stack; undefined means superseded. */
  readonly work: (
    request: AccountRequest,
    run: () => Promise<true | string | undefined>,
    current: () => boolean
  ) => Promise<unknown>
  readonly failed: (detail: string) => void
  readonly report: (error: unknown) => void
}

const sameAuthority = (a: AccountAuthority, b: AccountAuthority): boolean =>
  a.state === b.state && a.owner === b.owner && a.origin === b.origin && a.epoch === b.epoch &&
  a.provider === b.provider && a.login === b.login && a.readsScopes === b.readsScopes

/**
 * Bind the Account lifecycle to host-owned ports.
 *
 * @since 1.0.0
 * @category constructors
 */
export const createAccountController = (host: AccountHost, reads = accountReads()) => {
  const owns = (flight: Flight): boolean =>
    !host.disposed() && reads.flight === flight &&
    sameAuthority(flight.authority, host.authority()) && host.authority().state === "signed-in"
  const release = (flight: Flight) => {
    if (reads.flight === flight) reads.flight = undefined
  }
  const factsOf = (authority: AccountAuthority): AccountFacts | undefined =>
    authority.login === undefined ? undefined : ({
      login: authority.login,
      ...(authority.provider === undefined ? {} : { provider: authority.provider }),
      scopes: [],
      boxes: [...host.boxes()].sort((a, b) => a.repoId.localeCompare(b.repoId) || a.name.localeCompare(b.name))
    })
  const launch = (flight: Flight, facts: AccountFacts | undefined): void => {
    const current = () => owns(flight) && host.current(flight)
    void host.work(flight, async () => {
      if (!current()) return undefined
      const answer = await host.read(flight, facts, flight.abort.signal)
      if (!current()) return undefined
      await host.complete(flight, answer)
      if (!current()) return undefined
      return "error" in answer ? answer.error : true
    }, current).then((outcome) => {
      if (current() && typeof outcome === "string") host.failed(outcome)
      release(flight)
    }).catch((error) => {
      const currentRequest = current()
      release(flight)
      if (currentRequest) host.report(error)
    })
  }
  const resumeAccount = (): void => {
    if (host.disposed()) return
    const request = host.pending()
    if (
      request === undefined || request.read === "snapshot" || request.authority.state !== "signed-in" ||
      !sameAuthority(request.authority, host.authority())
    ) return
    if (reads.flight && owns(reads.flight) && host.current(reads.flight)) return
    reads.flight?.abort.abort()
    const flight: Flight = {
      ...request,
      abort: new AbortController(),
      admitted: true,
      admission: Promise.resolve(REQUESTED)
    }
    reads.flight = flight
    launch(flight, factsOf(request.authority))
  }
  const showAccount = async (): Promise<AccountAnswer> => {
    if (host.disposed()) return superseded()
    const authority = host.authority()
    if (authority.state === "unknown") return IDENTITY_PENDING_TEXT
    if (authority.state !== "signed-in") {
      host.signIn()
      return { value: SIGNED_OUT_VALUE }
    }
    if (
      reads.flight && owns(reads.flight) &&
      (!reads.flight.admitted || host.current(reads.flight))
    ) return reads.flight.admission
    const pending = host.pending()
    if (pending && sameAuthority(pending.authority, authority) && pending.read !== "snapshot") {
      resumeAccount()
      return REQUESTED
    }
    reads.flight?.abort.abort()
    const flight: Flight = {
      id: crypto.randomUUID(),
      authority,
      read: authority.login === undefined
        ? "identity"
        : authority.provider === "github" && authority.readsScopes
        ? "permissions"
        : "snapshot",
      abort: new AbortController(),
      admitted: false,
      admission: Promise.resolve(REQUESTED)
    }
    reads.flight = flight
    const facts = factsOf(authority)
    try {
      flight.admission = host.admit(flight, facts).then(() => {
        flight.admitted = true
        if (!owns(flight) || (flight.read !== "snapshot" && !host.current(flight))) {
          release(flight)
          return superseded()
        }
        if (flight.read !== "snapshot") {
          launch(flight, facts)
          return REQUESTED
        }
        release(flight)
        return { value: `account: @${facts!.login}; ${facts!.boxes.length} box(es) listed` }
      }).catch((error) => {
        const current = owns(flight)
        release(flight)
        if (!current) return superseded()
        throw error
      })
      return await flight.admission
    } catch (error) {
      release(flight)
      throw error
    }
  }
  const dispose = (): void => {
    reads.flight?.abort.abort()
    reads.flight = undefined
  }
  return { showAccount, resumeAccount, dispose }
}

/** Decode the identity worker's existing permission answer without inventing scope facts.
 *
 * @since 1.0.0
 * @category constructors
 */
export const readAccountPermissions = async (
  fetch: () => Promise<Response>,
  facts: AccountFacts
): Promise<AccountRead> => {
  try {
    const response = await fetch()
    if (!response.ok) {
      await response.body?.cancel()
      return { error: `Permissions could not be loaded (HTTP ${response.status}).` }
    }
    const body: unknown = await response.json()
    if (typeof body !== "object" || body === null || !("scopes" in body) || !Array.isArray(body.scopes)) {
      return { error: "Invalid permission response." }
    }
    const scopes: Array<{ scope: string; plain: string }> = [], seen = new Set<string>()
    for (const row of body.scopes) {
      if (
        typeof row !== "object" || row === null || typeof row.scope !== "string" || typeof row.plain !== "string" ||
        row.scope.trim() === "" || row.plain.trim() === "" || seen.has(row.scope.trim())
      ) return { error: "Invalid permission response." }
      seen.add(row.scope.trim())
      scopes.push({ scope: row.scope.trim(), plain: row.plain.trim() })
    }
    return { facts: { ...facts, scopes } }
  } catch {
    return { error: "Permissions could not be loaded." }
  }
}

/** Project only the selected backend's canonical identity, never token or profile metadata.
 * @since 1.0.0
 * @category constructors
 */
export const identityFacts = (value: unknown): AccountFacts | undefined => {
  if (
    typeof value !== "object" || value === null || !("username" in value) ||
    typeof value.username !== "string" || value.username.trim() === ""
  ) return undefined
  return { login: value.username, scopes: [], boxes: [] }
}
