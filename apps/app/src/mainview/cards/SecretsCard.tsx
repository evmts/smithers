import { secretInput, type SecretOperation } from "../flows/SecretPayload"
import { useTopic } from "../state/useTopic"
import { SecretsCardSchema, type SecretsViewProps } from "@smthrs/rpc/SecretsCard"
import type { Card } from "../state/AppState"
import type { CardFamily } from "./CardFamily"
import { settledPill } from "./CardFamily"
import { cardActions, type CardActionDefinition, type CardCommandDispatch } from "../flows/cardActions"
import { SecretsView } from "./views/SecretsView"
import { useController } from "../ControllerContext"
import { useCallback, useSyncExternalStore, type ComponentType } from "react"
import { writeOnlyGesture } from "../flows/CommandGesture"
import { secretsReadAvailable, secretsWriteAvailable } from "../state/seams/SecretsProviders"
import type { SecretsMetadataPhase } from "../state/seams/SecretsSeam"
import type { RepositoryAuthority } from "../state/seams/RepositoryAuthority"

type StoredSecrets = Extract<Card, { kind: "secrets" }>

/** No repository is in scope: nothing is granted and nothing was read. */
const UNSCOPED: RepositoryAuthority = { phase: "unscoped" }

/* Model keys stay on the host: a known key name is bound to its provider (§8.8.1b). */
const providerBindings: Readonly<Record<string, { readonly hosts: string; readonly headers: string }>> = {
  ANTHROPIC_API_KEY: { hosts: "api.anthropic.com", headers: "x-api-key" },
  OPENAI_API_KEY: { hosts: "api.openai.com", headers: "authorization" }
}

const secretControl = (operation: SecretOperation, definition: CardActionDefinition<"secrets">): CardActionDefinition<"secrets"> => ({
  ...definition, args: { ...definition.args, operation }, command_input: secretInput(operation, definition.command_input ?? {}),
  ...(definition.resolve_input ? { resolve_input: input => secretInput(operation, definition.resolve_input!(input) ?? {}) } : {})
})

export const SecretsCardBody = ({ card, dispatch, role = "member", access = "ready", listed = true, metadata = "fresh", View = SecretsView, confirm = message => window.confirm(message) }: {
  readonly card: StoredSecrets
  readonly dispatch: CardCommandDispatch
  readonly role?: "owner" | "maintainer" | "member"
  /** What is known about this repository's authority. Only "ready" may offer a write. */
  readonly access?: "ready" | "loading" | "unreadable"
  /** False when the metadata read failed: the card lists nothing because it read nothing. */
  readonly listed?: boolean
  /** How current these rows are: "unreadable" means nobody could re-read them. */
  readonly metadata?: SecretsMetadataPhase
  readonly View?: ComponentType<SecretsViewProps>
  readonly confirm?: (message: string) => boolean
}) => {
  const definitions: CardActionDefinition[] = []
  /*
   * An authority nobody could read, and rows nobody could re-read, are asked
   * for again by the same door that read them.
   */
  if (access === "unreadable" || (access === "ready" && metadata === "unreadable")) definitions.push({ tag: "secrets", label: "Retry", command_input: {} })
  if (access === "ready" && role !== "member") {
    definitions.push(secretControl("set", { tag: "secrets", label: "Add", args: { door: "add" }, command_input: { name: "", value: "" },
      input: [{ name: "name", label: "NAME", kind: "text", required: true },
        { name: "value", label: "Value", kind: "secret", required: true },
        { name: "scope", label: "Scope", kind: "choice", choices: ["all_branches", "main_only"], required: true },
        { name: "hosts", label: "Hosts", kind: "text", required: false },
        { name: "path", label: "Path", kind: "text", required: false }],
      resolve_input: input => ({ name: input.name ?? "", value: input.value ?? "", scope: input.scope === "main_only" ? "main_only" : "all_branches", hosts: input.hosts, ...(input.path ? { path: input.path } : {}) }) }))
    for (const secret of card.payload.secrets) {
      definitions.push(secretControl("set", { tag: "secrets", label: "Replace", args: { name: secret.name }, command_input: { name: secret.name, value: "" },
        input: [{ name: "value", label: "Value", kind: "secret", required: true },
          { name: "hosts", label: "Hosts", kind: "text", required: false },
          { name: "path", label: "Path", kind: "text", required: false, ...(secret.path ? { value: secret.path } : {}) }],
        /* The field starts at the stored path; clearing it removes the file. */
        resolve_input: input => ({ name: secret.name, value: input.value ?? "", ...(input.hosts ? { hosts: input.hosts } : {}),
          ...(input.path || (secret.path && input.path === "") ? { path: input.path } : {}) }) }),
        secretControl("scope", { tag: "secrets", label: secret.mainOnly ? "all branches" : "main only", args: { name: secret.name },
          command_input: { name: secret.name, scope: secret.mainOnly ? "all_branches" : "main_only" } }),
        secretControl("delete", { tag: "secrets", label: "Delete", args: { name: secret.name }, command_input: { name: secret.name } }))
    }
  }
  const bindings = cardActions((tag, input) => {
    if (tag === "secrets" && (input as { operation?: string }).operation === "delete" && !confirm(`Delete ${(input as { name: string }).name}?`)) return
    if (tag === "secrets" && (input as { operation?: string }).operation === "scope" && (input as { scope: string }).scope === "all_branches" && !confirm("Give to all branches?")) return
    return dispatch(tag, input)
  }, definitions)
  /*
   * An empty card has to say which empty it is. An authority still being
   * read, an authority that could not be read, a list that could not be read
   * and a list nobody may add to are four different answers, and a heading
   * over nothing is none of them.
   */
  const note = access === "loading" ? "Checking access\u2026"
    : access === "unreadable" ? "Access unknown."
    : !listed ? "Secrets couldn't be read."
    /* The rows stand, but they are the last read, not the stored answer. */
    : metadata === "unreadable" ? "Secrets couldn't be re-read."
    : definitions.length === 0 && card.payload.secrets.length === 0 ? "No secrets; read only."
    : undefined
  return <>
    <View model={{ secrets: card.payload.secrets.map(secret => ({ name: secret.name,
      scope: secret.mainOnly ? "main_only" : "all_branches", hosts: secret.hosts, ...(secret.path ? { path: secret.path } : {}),
      actions: bindings.actions.filter(action => action.args?.name === secret.name) })) }}
      {...bindings} actions={bindings.actions.filter(action => !action.args?.name)} view={{ maximized: false }} onView={() => {}} />
    {note === undefined ? null : <p className="secret-note">{note}</p>}
  </>
}

const SecretsBody = ({ card }: { card: StoredSecrets }) => {
  const controller = useController()
  useSyncExternalStore(controller.membersRoster.subscribe, controller.membersRoster.get, controller.membersRoster.get)
  const install = controller.bootstrap?.capabilities.includes("install") === true
  const providers = controller.secretsProviders
  const topic = useTopic(install && secretsReadAvailable(providers) ? "secrets" : undefined, providers?.live ?? controller.live)
  const parsed = (install ? providers?.decoder : SecretsCardSchema)?.safeParse(topic?.data)
  /*
   * Hosted secrets: the repository's own authority, not the seeded roster.
   * `membersRole` still answers off a hosted repository, where the seeded
   * design world stands in for the roster and calls that repository's owner a
   * member — so it decides nothing here.
   */
  const authority = install ? undefined : controller.secretAuthority
  const repo = card.payload.repo
  const scoped = useSyncExternalStore(
    useCallback((notify: () => void) => {
      if (authority === undefined) return () => {}
      const stop = authority.subscribe(notify)
      authority.ensure(repo)
      return stop
    }, [authority, repo]),
    () => authority?.state(repo) ?? UNSCOPED,
    () => authority?.state(repo) ?? UNSCOPED
  )
  /*
   * The metadata authority (SecretsSeam): a card this transcript retained
   * carries what the last read published, which a scope change made somewhere
   * else has already outdated. Mounting it asks the platform once; nothing
   * else may change a row.
   */
  const freshness = install ? undefined : controller.secretsMetadata
  const current = useSyncExternalStore(
    useCallback((notify: () => void) => {
      if (freshness === undefined) return () => {}
      const stop = freshness.subscribe(notify)
      freshness.ensure(repo)
      return stop
    }, [freshness, repo]),
    () => freshness?.state(repo) ?? "fresh",
    () => "fresh" as const
  )
  /* Every hook is held above this line: the install's secrets provider arrives after its catalog does. */
  if (install && !secretsReadAvailable(providers)) return null
  const unavailable = install && !secretsWriteAvailable(providers)
  /* The read failed, so the card holds no list — which is not the same as a repository holding no secrets. */
  const unread = topic?.error !== undefined || (topic?.data !== undefined && !parsed?.success)
  const projected = unread ? { ...card, payload: { ...card.payload, secrets: [] } }
    : parsed?.success ? { ...card, payload: { ...card.payload, secrets: parsed.data.secrets.map(secret => ({
      name: secret.name, mainOnly: secret.scope === "main_only", hosts: secret.hosts ?? [], matchHeaders: [], updatedAt: null,
      ...(secret.path ? { path: secret.path } : {})
    })) } } : card
  const access = authority === undefined || scoped.phase === "ready" || scoped.phase === "refused" || scoped.phase === "unscoped"
    ? "ready" as const : scoped.phase === "loading" ? "loading" as const : "unreadable" as const
  const role = install ? providers?.authority?.() ?? "member"
    : authority !== undefined ? (scoped.phase === "ready" ? scoped.role : "member")
    : controller.membersRole()
  return <SecretsCardBody card={projected} View={install ? providers?.View : SecretsView} role={unavailable ? "member" : role}
    access={access} listed={!unread} metadata={current} dispatch={(name, input) => {
    /* Re-listing the card also asks for an authority nobody could read; a settled one stands. */
    if (authority !== undefined && name === "secrets" && (input as { operation?: string } | undefined)?.operation === undefined) authority.ensure(repo)
    const payload: Record<string, unknown> = { ...(input ?? {}), repo: card.payload.repo || undefined }
    const gesture = name === "secrets" && payload.operation === "set" ? writeOnlyGesture(name, { value: String(payload.value ?? "") }) : undefined
    Object.assign(payload, secretsBinding(name, payload))
    delete payload.value
    return controller.commands.submit({ name, payload, actor: "user", gesture })
  }} />
}

/** A save's hosts and headers: a known model key defaults to its provider; other hosts send Authorization. */
export const secretsBinding = (tag: string, payload: Readonly<Record<string, unknown>>): Record<string, string> => {
  if (tag !== "secrets" || payload.operation !== "set") return {}
  const known = providerBindings[String(payload.name ?? "")]
  const hosts = typeof payload.hosts === "string" && payload.hosts.trim() !== "" ? payload.hosts : known?.hosts
  return hosts ? { hosts, headers: known?.headers ?? "authorization" } : {}
}

export const secretsCardFamily: CardFamily<"secrets"> = {
  secrets: { render: card => <SecretsBody card={card} />, pill: settledPill }
}
