/** Account's terminal adapter: existing Cloud authority, Session receipts and shared lifecycle. */
import { Refused } from "@smthrs/cli/CliError"
import * as CloudSession from "@smthrs/cli/CloudSession"
import * as Account from "@smthrs/control/Account"
import { Option, Schema } from "effect"
import * as Failures from "./failures.ts"
import type * as Panels from "./panels.ts"

export const id = Account.ACCOUNT_CARD_ID
export const operations = Account.accountOperations
/** Only request identity is durable. Account facts are refetched under the selected authority. */
export const Receipt = Schema.Struct({
  actor: Schema.Literals(["user", "agent"]),
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  owner: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  origin: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048)),
  state: Schema.Literals(["requested", "complete", "failed", "cancelled"])
})
export type Receipt = typeof Receipt.Type
const decodeReceipt = Schema.decodeUnknownOption(Receipt)
export const receiptOf = (value: unknown): Receipt | undefined => Option.getOrUndefined(decodeReceipt(value))
export type State =
  | { readonly phase: "idle" | "signed-out" }
  | { readonly phase: "requested"; readonly startedAt: number }
  | { readonly phase: "complete"; readonly facts: Account.AccountFacts }
  | { readonly phase: "failed"; readonly detail: string }

export const panel = (state: State): Panels.Panel => ({
  id,
  title: state.phase === "complete" ? `Account · @${state.facts.login}` : "Account",
  summary: state.phase === "requested" ? "Requested" : state.phase === "signed-out" ? "Sign in" : "Account",
  rows: state.phase === "complete" ?
    [{ id: "identity", label: `@${state.facts.login}`, details: [] }]
    : state.phase === "signed-out" ?
    [{ id: "sign-in", label: "smthrs auth login", details: [] }]
    : state.phase === "failed" ?
    [{ id: "failure", label: state.detail.slice(0, 240), status: "failed", details: [] }]
    : []
})

export const controller = (options: {
  readonly session?: () => Promise<CloudSession.SelectedCloud | undefined>
  readonly persist: (receipt: Receipt, at: number) => void
  readonly present: (at: number) => void
}) => {
  const session = options.session ?? (() => CloudSession.signedIn(process.env))
  const listeners = new Set<() => void>()
  let state: State = { phase: "idle" }, disposed = false, epoch = 0
  let cloud: CloudSession.SelectedCloud | undefined, retained: Receipt | undefined
  let actor: "user" | "agent" = "user"
  let selecting: Promise<Account.AccountAnswer> | undefined
  const authority = (): Account.AccountAuthority => ({
    state: cloud === undefined ? "signed-out" : "signed-in",
    owner: cloud?.identity ?? "",
    origin: cloud?.origin ?? "",
    epoch,
    readsScopes: false
  })
  const set = (next: State) => {
    state = next
    for (const notify of listeners) notify()
  }
  const save = (receipt: Receipt) => {
    options.persist(receipt, Date.now())
    retained = receipt
  }
  const requestOf = (receipt: Receipt): Account.AccountRequest => ({
    id: receipt.id,
    authority: authority(),
    read: "identity"
  })
  const current = (request: Account.AccountRequest) =>
    !disposed && request.authority.epoch === epoch && retained?.id === request.id
  const failure = (error: unknown) => {
    const detail = Failures.line("command", error)
    if (retained !== undefined) save({ ...retained, state: "failed" })
    set({ phase: "failed", detail })
  }
  const core = Account.createAccountController({
    authority,
    disposed: () => disposed,
    boxes: () => [],
    signIn: () => {
      set({ phase: "signed-out" })
      options.present(Date.now())
    },
    admit: async (request) => {
      save({
        actor,
        id: request.id,
        owner: request.authority.owner,
        origin: request.authority.origin,
        state: "requested"
      })
      const at = Date.now()
      set({ phase: "requested", startedAt: at })
      options.present(at)
    },
    pending: () =>
      retained?.state === "requested" && retained.owner === cloud?.identity && retained.origin === cloud.origin
        ? requestOf(retained) :
        undefined,
    current,
    read: async (request, _facts, signal) => {
      const selected = cloud
      const valid = async () =>
        selected !== undefined && current(request) && await selected.current() && current(request)
      if (!await valid()) {
        if (current(request)) {
          epoch++
          core.dispose()
          set({ phase: "idle" })
        }
        return { error: "Account request is no longer current." }
      }
      const value = await selected!.get("/api/user", signal)
      if (!await valid()) {
        if (current(request)) {
          epoch++
          core.dispose()
          set({ phase: "idle" })
        }
        return { error: "Account request is no longer current." }
      }
      const facts = Account.identityFacts(value)
      if (facts === undefined) {
        throw new Refused({
          fault: "infra",
          code: "backend_protocol",
          message: "The backend returned an unreadable account."
        })
      }
      return { facts }
    },
    complete: async (_request, answer) => {
      if (retained === undefined) return
      save({ ...retained, state: "error" in answer ? "failed" : "complete" })
      set("error" in answer ? { phase: "failed", detail: answer.error } : { phase: "complete", facts: answer.facts })
    },
    work: async (_request, run) => await run(),
    failed: (detail) => set({ phase: "failed", detail }),
    report: failure
  })
  const select = async (restore?: Receipt): Promise<Account.AccountAnswer> => {
    const generation = epoch
    let selected: CloudSession.SelectedCloud | undefined
    try {
      selected = await session()
    } catch (error) {
      if (disposed || generation !== epoch) return { value: "Account request is no longer current." }
      throw error
    }
    if (disposed || generation !== epoch) return { value: "Account request is no longer current." }
    if (selected?.identity !== cloud?.identity || selected?.origin !== cloud?.origin) {
      core.dispose()
      epoch++
      cloud = selected
      retained = undefined
      set({ phase: "idle" })
    }
    if (restore !== undefined) {
      if (selected?.identity !== restore.owner || selected.origin !== restore.origin) {
        return { value: "Account request is no longer current." }
      }
      actor = restore.actor
      retained = restore.state === "requested" ? restore : undefined
      if (retained !== undefined) {
        set({ phase: "requested", startedAt: Date.now() })
        core.resumeAccount()
        return { value: "Requested" }
      }
    }
    return core.showAccount()
  }
  const show = (input: unknown = {}, requestedBy: "user" | "agent" = "user"): Promise<Account.AccountAnswer> => {
    Schema.decodeUnknownSync(operations[0].input)(input)
    if (disposed) return Promise.resolve({ value: "Account request is no longer current." })
    if (selecting === undefined) actor = requestedBy
    if (selecting === undefined) {
      const pending = select().finally(() => {
        if (selecting === pending) selecting = undefined
      })
      selecting = pending
    }
    return selecting
  }
  const restore = (receipt: Receipt | undefined): void => {
    epoch++
    core.dispose()
    cloud = undefined
    retained = undefined
    selecting = undefined
    set({ phase: "idle" })
    if (receipt !== undefined) {
      void select(receipt).catch((error) => {
        if (!disposed) failure(error)
      })
    }
  }
  return {
    state: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    show,
    restore,
    dispose: () => {
      disposed = true
      epoch++
      core.dispose()
      listeners.clear()
      cloud = undefined
      retained = undefined
      state = { phase: "idle" }
    }
  }
}
