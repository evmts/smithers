/**
 * Account read and presentation ports shared by Smithers hosts.
 * @since 1.0.0
 */

import { Schema } from "effect"
import { NoInput, operation } from "./Operation.ts"
export { NoInput } from "./Operation.ts"

/** The one Account declaration; hosts bind their identity and presentation ports.
 * @since 1.0.0
 * @category constructors
 */
export const accountOperations = [
  operation({ name: "account.show", summary: "Show account", runtime: ["identity"], input: NoInput })
] as const

/** Public verified identity; credentials and host presentation facts never cross this port.
 * @since 1.0.0
 * @category schemas
 */
export const Identity = Schema.Struct({ login: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)) })
/** Durable product request identity, distinct from a completed account read.
 * @since 1.0.0
 * @category schemas
 */
export const RequestId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/))
/** Delivery states of the existing product job store.
 * @since 1.0.0
 * @category schemas
 */
export const RequestState = Schema.Literals([
  "accepted",
  "dispatching",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "uncertain"
])
/** One authenticated invocation of the shared operation.
 * @since 1.0.0
 * @category schemas
 */
export const Invocation = Schema.Struct({
  name: Schema.Literal(accountOperations[0].name),
  requestId: RequestId,
  input: NoInput
})
/** An owned request selected for read or cancellation.
 * @since 1.0.0
 * @category schemas
 */
export const RequestReference = Schema.Struct({ name: Schema.Literal(accountOperations[0].name), requestId: RequestId })
/** The durable admission receipt; acceptance promises no result.
 * @since 1.0.0
 * @category schemas
 */
export const RequestReceipt = Schema.Struct({
  operationId: Schema.String,
  requestId: RequestId,
  kind: Schema.Literal("requested"),
  state: RequestState,
  acceptedAt: Schema.String
})
const outcomeIdentity = {
  operationId: Schema.String,
  requestId: RequestId,
  actor: Schema.Literals(["user", "agent", "api"])
}
/** An owned operation's current projection; only a completed read carries identity.
 * @since 1.0.0
 * @category schemas
 */
export const RequestOutcome = Schema.Union([
  Schema.Struct({ ...outcomeIdentity, state: Schema.Literal("completed"), result: Identity }),
  Schema.Struct({ ...outcomeIdentity, state: Schema.Literals(["failed", "uncertain"]), error: Schema.String }),
  Schema.Struct({
    ...outcomeIdentity,
    state: Schema.Literals(["accepted", "dispatching", "running", "waiting", "cancelled"])
  })
])

/** Reconnect to owned receipts through the existing product delivery stream.
 * @since 1.0.0
 * @category schemas
 */
export const RequestHistory = Schema.Struct({
  cursor: Schema.Number,
  truncated: Schema.Boolean,
  items: Schema.Array(RequestOutcome)
})

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

/** A host's durable pointer; server receipts alone establish delivery state.
 * @since 1.0.0
 * @category models
 */
export interface AccountRequest {
  readonly id: string
  readonly authority: AccountAuthority
  readonly operationId?: string
}
/** The existing acknowledgment, independent of remote admission and execution.
 * @since 1.0.0
 * @category models
 */
export type AccountAnswer = string | { readonly value: string }
/** Supplementary card observations never settle the identity operation.
 * @since 1.0.0
 * @category models
 */
export type AccountRead = { readonly facts: AccountFacts } | { readonly error: string }
/** Safe typed transport refusal; no response diagnostics or credentials are retained.
 * @since 1.0.0
 * @category errors
 */
export class AccountTransportError extends Error {
  readonly code: "account_changed" | "backend_protocol" | "account_read_failed"
  readonly status: number | undefined
  constructor(code: "account_changed" | "backend_protocol" | "account_read_failed", status?: number) {
    super(
      code === "account_changed"
        ? "Account changed"
        : code === "account_read_failed"
        ? `Account read failed${status === undefined ? "" : ` (HTTP ${status})`}.`
        : "Invalid account operation receipt"
    )
    this.code = code
    this.status = status
  }
}
/** The selected host owns authenticated HTTP and selection revalidation.
 * @since 1.0.0
 * @category constructors
 */
export const accountTransport = (options: {
  readonly current: () => boolean | Promise<boolean>
  readonly post: (path: string, body: unknown, signal?: AbortSignal) => Promise<unknown>
}) => {
  const decode = <S extends Schema.ConstraintDecoder<unknown, never>>(schema: S, value: unknown): S["Type"] => {
    try {
      return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
    } catch {
      throw new AccountTransportError("backend_protocol")
    }
  }
  const call = async (procedure: string, payload: unknown, signal?: AbortSignal) => {
    if (!await options.current()) throw new AccountTransportError("account_changed")
    const answer = await options.post("/api/workflow/rpc", { procedure, payload }, signal)
    if (!await options.current()) throw new AccountTransportError("account_changed")
    return answer
  }
  const reference = (id: string) => decode(RequestReference, { name: accountOperations[0].name, requestId: id })
  const selection = async (
    procedure: "Operation.Read" | "Operation.Cancel",
    id: string,
    operationId?: string,
    signal?: AbortSignal
  ) => {
    const outcome = decode(RequestOutcome, await call(procedure, reference(id), signal))
    if (outcome.requestId !== id || operationId !== undefined && outcome.operationId !== operationId) {
      throw new AccountTransportError("backend_protocol")
    }
    return outcome
  }
  return {
    dispatch: async (id: string, input: unknown = {}, signal?: AbortSignal) => {
      const invocation = decode(Invocation, { ...reference(id), input })
      const receipt = decode(RequestReceipt, await call("Operation.Dispatch", invocation, signal))
      if (receipt.requestId !== id) throw new AccountTransportError("backend_protocol")
      return receipt
    },
    read: (id: string, operationId?: string, signal?: AbortSignal) =>
      selection("Operation.Read", id, operationId, signal),
    cancel: (id: string, operationId?: string, signal?: AbortSignal) =>
      selection("Operation.Cancel", id, operationId, signal),
    history: async (signal?: AbortSignal) => decode(RequestHistory, await call("Operation.History", {}, signal))
  }
}
/** Canonical typed transport shared by every host.
 * @since 1.0.0
 * @category models
 */
export type AccountTransport = ReturnType<typeof accountTransport>
interface Flight extends AccountRequest {
  readonly abort: AbortController
  admission: Promise<AccountAnswer>
  persisted: boolean
}
/** A shared observation slot, never an execution or history store.
 * @since 1.0.0
 * @category models
 */
export interface AccountReads {
  flight: Flight | undefined
}
/** Create one observation slot for a host's human and model doors.
 * @since 1.0.0
 * @category constructors
 */
export const accountReads = (): AccountReads => ({ flight: undefined })
/** The existing Account card identity.
 * @since 1.0.0
 * @category constructors
 */
export const ACCOUNT_CARD_ID = "account"
/** The existing signed-out acknowledgment.
 * @since 1.0.0
 * @category constructors
 */
export const SIGNED_OUT_VALUE = "signed out: the sign-in step is in the chat"
/** The existing identity-selection acknowledgment.
 * @since 1.0.0
 * @category constructors
 */
export const IDENTITY_PENDING_TEXT = "Still checking who is signed in. Try again in a moment."
/** Canonical cancellation has its own presentation result.
 * @since 1.0.0
 * @category constructors
 */
export const ACCOUNT_CANCELLED = Symbol("Account cancelled")
const REQUESTED = { value: "Requested" } as const
const superseded = (): AccountAnswer => ({ value: "Account request is no longer current." })
/** Existing host storage and presentation, bound to the sole server authority.
 * @since 1.0.0
 * @category models
 */
export interface AccountHost {
  readonly authority: () => AccountAuthority
  readonly disposed: () => boolean
  readonly signIn: () => void
  readonly admit: (request: AccountRequest) => Promise<void>
  readonly acknowledged: (request: AccountRequest, receipt: typeof RequestReceipt.Type) => Promise<void>
  readonly pending: () => AccountRequest | undefined
  readonly current: (request: AccountRequest) => boolean
  readonly transport: (request: AccountRequest) => AccountTransport
  readonly complete: (request: AccountRequest, outcome: typeof RequestOutcome.Type) => Promise<void>
  readonly work: (
    request: AccountRequest,
    run: () => Promise<true | string | typeof ACCOUNT_CANCELLED | undefined>,
    current: () => boolean
  ) => Promise<unknown>
  readonly failed: (detail: string) => void
  readonly report: (error: unknown) => void
  readonly wait?: (signal: AbortSignal) => Promise<void>
}
const sameAuthority = (a: AccountAuthority, b: AccountAuthority): boolean =>
  a.state === b.state && a.owner === b.owner && a.origin === b.origin && a.epoch === b.epoch &&
  a.provider === b.provider && a.login === b.login && a.readsScopes === b.readsScopes
const waitForRead = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", finish)
      resolve()
    }
    const timer = setTimeout(finish, 250)
    signal.addEventListener("abort", finish, { once: true })
  })
/** Persist a pointer immediately; observe server admission and real completion in the background.
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
  const launch = (flight: Flight): void => {
    const current = () => owns(flight) && host.current(flight)
    const observe = async (): Promise<true | string | typeof ACCOUNT_CANCELLED | undefined> => {
      if (!current()) return undefined
      const remote = host.transport(flight)
      let operationId = flight.operationId
      if (operationId === undefined) {
        const receipt = await remote.dispatch(flight.id, {}, flight.abort.signal)
        if (!current()) return undefined
        await host.acknowledged(flight, receipt)
        if (!current()) return undefined
        operationId = receipt.operationId
      }
      while (current()) {
        const outcome = await remote.read(flight.id, operationId, flight.abort.signal)
        if (!current()) return undefined
        if (["completed", "failed", "uncertain", "cancelled"].includes(outcome.state)) {
          await host.complete(flight, outcome)
          if (!current()) return undefined
          return outcome.state === "cancelled" ? ACCOUNT_CANCELLED : "error" in outcome ? outcome.error : true
        }
        await (host.wait ?? waitForRead)(flight.abort.signal)
      }
      return undefined
    }
    // Some notification adapters consume failures. Publish the safe failed observation before handing it to them.
    void host.work(flight, () =>
      observe().catch((error: unknown) => {
        if (current()) host.failed(error instanceof AccountTransportError ? error.message : "Account read failed.")
        throw error
      }), current).then((outcome) => {
        if (current() && typeof outcome === "string") host.failed(outcome)
        release(flight)
      }).catch((error) => {
        const active = current()
        release(flight)
        if (active) host.report(error)
      })
  }
  const resumeAccount = (): void => {
    if (host.disposed()) return
    const request = host.pending()
    if (
      request === undefined || request.authority.state !== "signed-in" ||
      !sameAuthority(request.authority, host.authority())
    ) return
    if (reads.flight && owns(reads.flight) && host.current(reads.flight)) return
    reads.flight?.abort.abort()
    const flight: Flight = {
      ...request,
      abort: new AbortController(),
      admission: Promise.resolve(REQUESTED),
      persisted: true
    }
    reads.flight = flight
    launch(flight)
  }
  const showAccount = async (): Promise<AccountAnswer> => {
    if (host.disposed()) return superseded()
    const authority = host.authority()
    if (authority.state === "unknown") return IDENTITY_PENDING_TEXT
    if (authority.state !== "signed-in") {
      host.signIn()
      return { value: SIGNED_OUT_VALUE }
    }
    if (reads.flight && owns(reads.flight) && (!reads.flight.persisted || host.current(reads.flight))) {
      return reads.flight.admission
    }
    const pending = host.pending()
    if (pending && sameAuthority(pending.authority, authority)) {
      resumeAccount()
      return REQUESTED
    }
    reads.flight?.abort.abort()
    const flight: Flight = {
      id: crypto.randomUUID(),
      authority,
      abort: new AbortController(),
      admission: Promise.resolve(REQUESTED),
      persisted: false
    }
    reads.flight = flight
    flight.admission = Promise.resolve().then(() => host.admit(flight)).then(() => {
      flight.persisted = true
      if (!owns(flight) || !host.current(flight)) {
        release(flight)
        return superseded()
      }
      launch(flight)
      return REQUESTED
    }).catch((error) => {
      const active = owns(flight)
      release(flight)
      if (!active) return superseded()
      throw error
    })
    return flight.admission
  }
  const cancelAccount = async (): Promise<typeof RequestOutcome.Type | undefined> => {
    const flight = reads.flight
    if (flight === undefined || !owns(flight) || !host.current(flight)) return undefined
    const pending = host.pending()
    return host.transport(flight).cancel(flight.id, pending?.operationId, flight.abort.signal)
  }
  const dispose = (): void => {
    reads.flight?.abort.abort()
    reads.flight = undefined
  }
  return { showAccount, resumeAccount, cancelAccount, dispose }
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
