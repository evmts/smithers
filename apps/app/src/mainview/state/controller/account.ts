/* Account presents canonical server identity receipts; scopes and boxes are observed card facets. */
import { AUTH_SCOPES_PATH } from "@smthrs/rpc/AgentApiRoutes"
import {
  ACCOUNT_CARD_ID,
  type AccountAuthority,
  type AccountFacts,
  accountReads,
  type AccountRequest,
  accountTransport,
  AccountTransportError,
  ACCOUNT_CANCELLED,
  createAccountController as createSharedAccountController,
  readAccountPermissions
} from "@smthrs/ui/account-controller"
import { actorSharedState } from "../ActorBindings"
import type { Card } from "../AppState"
import type { ControllerContext } from "./context"
import { TOAST_CANCELLED, TOAST_SUPERSEDED } from "./failures"

export { ACCOUNT_CARD_ID, IDENTITY_PENDING_TEXT, SIGNED_OUT_VALUE } from "@smthrs/ui/account-controller"
export interface AccountController {
  readonly showAccount: () => Promise<string | { readonly value: string }>
  readonly resumeAccount: () => void
}
export interface AccountControllerDeps {
  readonly provider: "github" | "local"
  readonly readsScopes: boolean
  readonly nextOrdinal: () => number
  readonly promptSignIn: (required?: boolean, request?: { readonly name: string }) => void
}
type AccountCard = Extract<Card, { kind: "account" }>
const mutableFacts = (facts: AccountFacts): AccountCard["payload"] => ({
  ...facts,
  scopes: facts.scopes.map((row) => ({ ...row })),
  boxes: facts.boxes.map((row) => ({ ...row }))
})

/** Flux cards, actor attribution and the existing toast stack adapt the shared lifecycle. */
export const createAccountController = (ctx: ControllerContext, deps: AccountControllerDeps): AccountController => {
  const { store } = ctx
  const card = (): AccountCard | undefined => {
    const row = store.collections.cards.get(ACCOUNT_CARD_ID)
    return row?.kind === "account" ? row : undefined
  }
  const authority = (): AccountAuthority => {
    const identity = store.collections.identitySessions.get("identity")
    return {
      state: identity?.state === "signed-in" && identity.login !== null && ctx.accountOwner() === identity.login
        ? "signed-in"
        : identity?.state === "unknown" || identity === undefined
        ? "unknown"
        : "signed-out",
      owner: ctx.accountOwner() ?? "",
      origin: ctx.baseUrl,
      epoch: ctx.accountEpoch,
      ...(identity?.login == null ? {} : { login: identity.login }),
      provider: deps.provider,
      readsScopes: deps.readsScopes
    }
  }
  const shared = createSharedAccountController({
    authority,
    disposed: () => ctx.disposed,
    signIn: () => deps.promptSignIn(false, { name: "account.show" }),
    admit: async (request) => {
      const selected = authority()
      const facts: AccountFacts = { login: selected.login ?? "", ...(selected.provider === undefined ? {} : { provider: selected.provider }), scopes: [], boxes: [] }
      const next: AccountCard = {
        id: ACCOUNT_CARD_ID,
        kind: "account",
        title: `Account · @${facts.login}`,
        status: "active",
        createdAt: Date.now(),
        ordinal: deps.nextOrdinal(),
        payload: {
          ...mutableFacts(facts),
          refresh: { id: request.id, state: "requested" }
        }
      }
      await store.dispatch({ type: "card.upsert", actor: ctx.commandActor, card: next }).isPersisted.promise
    },
    acknowledged: async (request, receipt) => {
      const row = card()
      if (row?.payload.refresh?.id !== request.id) return
      await store.dispatch({ type: "card.upsert", actor: "system", card: { ...row, payload: { ...row.payload, refresh: { id: request.id, operationId: receipt.operationId, state: "requested" } } } }).isPersisted.promise
    },
    pending: () => {
      const row = card(), owner = authority()
      if (row === undefined || owner.state !== "signed-in" || row.payload.login !== owner.login || row.payload.provider !== owner.provider || !(row.payload.refresh?.state === "requested" || row.payload.refresh?.state === "failed" && row.payload.refresh.operationId === undefined)) return undefined
      return { id: row.payload.refresh.id, authority: owner, ...(row.payload.refresh.operationId === undefined ? {} : { operationId: row.payload.refresh.operationId }) }
    },
    current: (request) => card()?.payload.refresh?.id === request.id,
    transport: (request) => accountTransport({
      current: () => !ctx.disposed && ctx.accountEpoch === request.authority.epoch && ctx.accountOwner() === request.authority.owner && ctx.baseUrl === request.authority.origin,
      post: async (path, body, signal) => {
        const response = await ctx.boundedFetch(`${ctx.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal })
        if (!response.ok) { await response.body?.cancel(); throw new AccountTransportError("account_read_failed", response.status) }
        return response.json()
      }
    }),
    complete: async (request, outcome) => {
      const row = card()
      if (row === undefined) return
      if ("result" in outcome && outcome.result.login !== ctx.accountOwner()) {
        ctx.endAccount()
        void ctx.loadSession()
        return
      }
      const failed = "error" in outcome
      const facts: AccountFacts = {
        login: "result" in outcome ? outcome.result.login : row.payload.login,
        ...(row.payload.provider === undefined ? {} : { provider: row.payload.provider }), scopes: [],
        boxes: [...store.collections.cloudWorkspaces.values()].map(({ id, repoId, name, status }) => ({ id, repoId, name, status })).sort((a,b) => a.repoId.localeCompare(b.repoId) || a.name.localeCompare(b.name))
      }
      await store.dispatch({ type: "card.upsert", actor: "system", card: { ...row, status: failed ? "error" : "active", payload: {
        ...mutableFacts(facts), refresh: failed ? { id: request.id, operationId: outcome.operationId, state: "failed", error: outcome.error } : { id: request.id, operationId: outcome.operationId, state: outcome.state === "cancelled" ? "cancelled" : "complete" }
      } } }).isPersisted.promise
      // Permission rows are supplementary observations. Their answer cannot complete or fail the identity job.
      if (outcome.state === "completed" && deps.readsScopes && facts.provider === "github") {
        void readAccountPermissions(() => ctx.boundedFetch(`${ctx.baseUrl}${AUTH_SCOPES_PATH}`), facts).then(answer => {
          const current = card()
          if (ctx.disposed || ctx.accountEpoch !== request.authority.epoch || current?.payload.refresh?.id !== request.id) return
          store.dispatch({ type: "card.upsert", actor: "system", card: { ...current, payload: { ...current.payload,
            ...("error" in answer ? { permissionsError: answer.error } : { scopes: mutableFacts(answer.facts).scopes, permissionsError: undefined }) } } })
        }).catch(error => ctx.failures.report("toast.work", error, "account.permissions"))
      }
    },
    work: (_request: AccountRequest, run, current) =>
      ctx.withToast(
        "account.permissions",
        "Account",
        "Account",
        async () => { const outcome = await run(); return outcome === ACCOUNT_CANCELLED ? TOAST_CANCELLED : outcome ?? TOAST_SUPERSEDED },
        false,
        current,
        ACCOUNT_CARD_ID
      ),
    failed: (detail) => {
      const row = card()
      if (row?.payload.refresh !== undefined) {
        const saved = store.dispatch({ type: "card.upsert", actor: "system", card: { ...row, status: "error", payload: { ...row.payload, scopes: [], boxes: [],
          refresh: { id: row.payload.refresh.id, ...(row.payload.refresh.operationId === undefined ? {} : { operationId: row.payload.refresh.operationId }), state: "failed", error: detail } } } })
        void saved.isPersisted.promise.catch(error => ctx.failures.report("toast.work", error, "account.permissions"))
      }
      ctx.resolveToast("account.permissions", { status: "failed", detail, action: { flow: "account.show", label: "Retry" } })
    },
    report: (error) => ctx.failures.report("toast.work", error, "account.permissions")
  }, actorSharedState(ctx, "account.reads", accountReads))
  const unsubscribe = ctx.onAccountChange(shared.dispose)
  ctx.onDispose(() => {
    unsubscribe()
    shared.dispose()
  })
  return {
    showAccount: shared.showAccount,
    resumeAccount: () => {
      const row = card()
      if (row?.payload.refresh === undefined) return
      if (row.payload.refresh.state === "requested") { shared.resumeAccount(); return }
      // Persist only a reconnect projection. Restored terminal facts require the same live source before publication.
      void store.dispatch({ type: "card.upsert", actor: "system", card: { ...row, payload: { ...row.payload, scopes: [], boxes: [], permissionsError: undefined,
        refresh: { id: row.payload.refresh.id, ...(row.payload.refresh.operationId === undefined ? {} : { operationId: row.payload.refresh.operationId }), state: "requested" } } } }).isPersisted.promise.then(() => shared.resumeAccount()).catch(error => ctx.failures.report("toast.work", error, "account.permissions"))
    }
  }
}
