/*
 * The account card's controller half (factory mock 21, design session §6c):
 * `account.show` renders who is signed in as one read-only card of seam
 * facts. Every row comes from a seam the app already has: the identity
 * session (login, allowlist answer, access request), the identity worker's
 * scopes read (GET /api/auth/scopes, the same read the signed-out consent
 * copy makes), and the cloudWorkspaces collection (the boxes the workspaces
 * seam has listed, across every repository). A row whose seam did not answer
 * is absent. No billing, usage or seat rows exist because no seam holds them.
 *
 * Signed out, the card IS the sign-in step: the flow renders auth.prompt's
 * message, never an empty account.
 */
import { AUTH_SCOPES_PATH } from "@smthrs/rpc/AgentApiRoutes"
import {
  ACCOUNT_CARD_ID,
  type AccountAuthority,
  type AccountFacts,
  accountReads,
  type AccountRequest,
  createAccountController as createSharedAccountController,
  readAccountPermissions
} from "@smthrs/ui/account-controller"
import { actorSharedState } from "../ActorBindings"
import type { Card } from "../AppState"
import type { ControllerContext } from "./context"
import { TOAST_SUPERSEDED } from "./failures"

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
    boxes: () =>
      [...store.collections.cloudWorkspaces.values()].map(({ id, repoId, name, status }) => ({
        id,
        repoId,
        name,
        status
      })),
    signIn: () => deps.promptSignIn(false, { name: "account.show" }),
    admit: async (request, facts) => {
      if (facts === undefined) return
      const next: AccountCard = {
        id: ACCOUNT_CARD_ID,
        kind: "account",
        title: `Account · @${facts.login}`,
        status: "active",
        createdAt: Date.now(),
        ordinal: deps.nextOrdinal(),
        payload: {
          ...mutableFacts(facts),
          ...(request.read === "permissions" ? { refresh: { id: request.id, state: "requested" as const } } : {})
        }
      }
      await store.dispatch({ type: "card.upsert", actor: ctx.commandActor, card: next }).isPersisted.promise
    },
    pending: () => {
      const current = card(), owner = authority()
      if (
        current === undefined || owner.state !== "signed-in" || !owner.readsScopes || owner.provider !== "github" ||
        current?.payload.login !== owner.login || current.payload.provider !== owner.provider ||
        current.payload.refresh?.state !== "requested"
      ) return undefined
      return { id: current.payload.refresh.id, authority: owner, read: "permissions" }
    },
    current: (request) => card()?.payload.refresh?.id === request.id,
    read: (_request, facts, signal) =>
      readAccountPermissions(() => ctx.boundedFetch(`${ctx.baseUrl}${AUTH_SCOPES_PATH}`, { signal }), facts!),
    complete: async (request, answer) => {
      const current = card()
      if (current === undefined) return
      const failed = "error" in answer
      await store.dispatch({
        type: "card.upsert",
        actor: "system",
        card: {
          ...current,
          status: failed ? "error" : "active",
          payload: {
            ...(failed ? { ...current.payload, scopes: [] } : mutableFacts(answer.facts)),
            refresh: failed
              ? { id: request.id, state: "failed", error: answer.error }
              : { id: request.id, state: "complete" }
          }
        }
      }).isPersisted.promise
    },
    work: (_request: AccountRequest, run, current) =>
      ctx.withToast(
        "account.permissions",
        "Loading permissions…",
        "Permissions loaded",
        async () => (await run()) ?? TOAST_SUPERSEDED,
        false,
        current,
        ACCOUNT_CARD_ID
      ),
    failed: (detail) =>
      ctx.resolveToast("account.permissions", {
        status: "failed",
        detail,
        action: { flow: "account.show", label: "Retry" }
      }),
    report: (error) => ctx.failures.report("toast.work", error, "account.permissions")
  }, actorSharedState(ctx, "account.reads", accountReads))
  const unsubscribe = ctx.onAccountChange(shared.dispose)
  ctx.onDispose(() => {
    unsubscribe()
    shared.dispose()
  })
  return shared
}
