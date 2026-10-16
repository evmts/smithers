import { rememberComposerFocus, restoreComposerFocus } from "./runtime/ComposerFocus"
import { useSharedConversation } from "./state/useSharedConversation"
import { useTodoRole } from "./cards/TodoCard"
import { SharedConversation } from "./SharedConversation"
import { accountOwnerOf } from "./state/AccountOwner"
import { renderHomeCard, renderConfirmCard } from "./cards/CardRenderers"
import { memberConfirmations, memberConfirmCardProps } from "./cards/ApprovalCard"
import { useTopic } from "./state/useTopic"
import { flowArgs } from "./flows/FlowArgs"
import { BranchNavigation } from "./BranchNavigation"
import { shownInTranscript } from "./state/ApprovalDeciders"
import {
Button,
ChatMessage,
MessageScrollerButton,
MessageScrollerContent,
MessageScrollerItem,
MessageScrollerProvider,
MessageScrollerViewport,
SmithersUiStyles
} from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react"
import { useMemo,useRef,useState } from "react"
import { controllerCardActions as cardActions } from "./cards/controllerCardActions"
import { LoginScreen } from "./cards/LoginScreen"
import { CardView } from "./ChatCards"
import { Composer } from "./Composer"
import { useController } from "./ControllerContext"
import { DevtoolsPanel } from "./DevtoolsPanel"
import { ChatHint,FirstSightHint } from "./FirstSightHint"
import { dynamicFlowAction, flowProps } from "./flows/FlowAction"
import { InputModeMenu } from "./InputModeMenu"
import type { InitMessage } from "./HostOpening"
import { cloudWebHost, initMessage } from "./HostOpening"
import { LAUNCHER_ENTRY_ID, RepositoryLauncherCard } from "./cards/RepositoryLauncher"
import { REPOSITORY_HOME_ENTRY_ID, RepositoryHomeView } from "./cards/RepositoryHomeView"
import { SHORTCUT_KEYS,ShortcutButton } from "./ShortcutButton"
import { pathRepo, treeCopyOf } from "./RepoLink"
import { missingRepositoryOffer } from "./RepositoryEntryOffer"
import type { Card,Message } from "./state/AppState"
import { conversationTabIdOf,diagnosticVisible,inConversation,readScopeOf } from "./state/AppState"
import { catalogRepositoryOf } from "./state/RepoContext"
import { useCardRows,useFileCardRows,useFlowDurationRows,useTriggerListRows,useWorkflowCatalogRows } from "./state/useCardRows"
import { ConfirmDialog } from "./SurfaceChrome"
import { TranscriptMessage } from "./TranscriptMessage"
import { HOME_ENTRY_ID, ShellRail } from "./ShellRail"
import { WikiDeleteDialog } from "./WikiDeleteDialog"
import { WorldSurface } from "./WorldSurface"

type TranscriptEntry =
  | { readonly kind: "message"; readonly message: Message }
  | { readonly kind: "init"; readonly message: InitMessage }
  | { readonly kind: "card"; readonly card: Card }

const entryOrdinal = (entry: TranscriptEntry): number =>
  entry.kind === "card" ? entry.card.ordinal : entry.message.ordinal

const entryCreatedAt = (entry: TranscriptEntry): number =>
  entry.kind === "card" ? entry.card.createdAt : entry.message.createdAt

const transcriptOrder = (left: TranscriptEntry, right: TranscriptEntry): number =>
  entryOrdinal(left) - entryOrdinal(right) || entryCreatedAt(left) - entryCreatedAt(right)

const entryId = (entry: TranscriptEntry): string => entry.kind === "card" ? entry.card.id : entry.message.id

function AppContent() {
  const controller = useController()
  const { collections } = controller.store
  // A branch change remounts the keyed transcript. Keep its pending receipt above that boundary.
  const [savingNavigation, setSavingNavigation] = useState(false)
  const pendingNavigation = useRef(0)
  const setBranchNavigationView = (patch: Parameters<typeof controller.setBranchNavigationView>[0]) => {
    const request = ++pendingNavigation.current
    setSavingNavigation(true)
    void controller.setBranchNavigationView(patch)
      .catch(() => { /* The store owns persistence failure and recovery. */ })
      .finally(() => { if (request === pendingNavigation.current) setSavingNavigation(false) })
  }
  /*
   * The transcript's order is the QUERY's order (§hot path): sorting a copy of
   * every row on every render made each keystroke O(messages log messages) on
   * top of the render it should not have caused at all. The collection sorts
   * incrementally and hands back rows already in order.
   */
  const { data: messageRows } = useLiveQuery((q) =>
    q.from({ message: collections.messages }).orderBy(({ message }) => message.ordinal)
  )
  const { data: savedSignInPrompts } = useLiveQuery(q => q.from({ receipt: collections.savedSignInPrompts }))
  /*
   * The shell reads the session WITHOUT the draft.
   *
   * The draft changes on every keystroke, and this subscription carried it —
   * so typing one character re-rendered App, and App renders the whole
   * transcript. The projection is consolidated by the query, so a draft-only
   * write produces no change here at all and the transcript stays still;
   * `Composer` below subscribes to the draft, one component deep, and is the
   * only thing a keystroke re-renders.
   */
  const { data: sessionRows } = useLiveQuery((q) =>
    q.from({ session: collections.sessions }).select(({ session }) => ({
      id: session.id,
      phase: session.phase,
      theme: session.theme,
      surface: session.surface,
      maximizedCardId: session.maximizedCardId,
      activeBranchId: session.activeBranchId,
      branchNavigation: session.branchNavigation,
      requestedRead: session.requestedRead,
      devtoolsOpen: session.devtoolsOpen,
      paletteOpen: session.paletteOpen,
      inputMode: session.inputMode,
      paletteLastQuery: session.paletteLastQuery,
      resetConfirmOpen: session.resetConfirmOpen,
      verbose: session.verbose,
      activeRepoKey: session.activeRepoKey,
      repositoryEntry: session.repositoryEntry
    }))
  )
  const { data: worldDocumentRows } = useLiveQuery(collections.worldDocuments)
  const cardRows = useCardRows(collections.cards)
  const workflowCatalogs = useWorkflowCatalogRows(collections.cards)
  const triggerCatalogs = useTriggerListRows(collections.cards)
  const flowDurations = useFlowDurationRows(collections.flowDurations)
  const fileCards = useFileCardRows(collections.cards)
  const { data: identityRows } = useLiveQuery(collections.identitySessions)
  const { data: connectorRows } = useLiveQuery(collections.connectors)
  const { data: repositoryRows } = useLiveQuery(collections.repositories)
  const { data: repositoryFlowRows } = useLiveQuery(collections.repositoryFlows)
  /* The GitHub App's coverage of the URL's repository, when the entry read it. */
  const { data: appStatusRows } = useLiveQuery(collections.githubAppStatuses)
  /* The composer wrap: Cmd+K focuses the textarea inside it (the palette opens on the composer). */
  const composerWrapRef = useRef<HTMLDivElement>(null)
  const chatTriggerRef = useRef<HTMLButtonElement>(null)
  const readRequestRef = useRef(0)
  const session = sessionRows[0] ?? controller.store.session()
  /*
   * The boot generation's own read receipt, so one restored with the session
   * is not mistaken for an ask (#3813). Revisions are strictly increasing
   * WITHIN one opened store, so the receipt a generation opens with is the
   * only one it has to recognise. A reset or a recovery opens ANOTHER store,
   * whose revisions start again from zero and could otherwise reach this
   * generation's number — so the controller it belongs to is part of the
   * identity, and a new one starts a new generation while App stays mounted.
   */
  const bootReadRef = useRef<{ boot: unknown; revision: number | undefined }>({ boot: controller, revision: session.requestedRead?.revision })
  if (bootReadRef.current.boot !== controller) bootReadRef.current = { boot: controller, revision: session.requestedRead?.revision }
  /*
   * The conversation on screen (docs/LOCAL-APP.md "Tabs"): there is ONE
   * Smithers, the first tab, aware of every other one — so the conversation is
   * always main's. Rows keep their conversation stamp (a turn in flight writes
   * where it started), and this filter reads it.
   */
  const earlier = session.branchNavigation?.open && session.branchNavigation.owner === (accountOwnerOf(identityRows[0]) ?? null) && session.branchNavigation.selected_branch === "earlier"
  const conversationTabId = conversationTabIdOf(session)
  // A recovery door is an acknowledgment only once its journal receipt exists.
  const messages = messageRows.filter((message) => (!controller.sharedConversation || message.action !== undefined || diagnosticVisible(message, identityRows[0]?.login, session.branchNavigation?.selected_branch ?? "main")) && inConversation(message, conversationTabId) &&
    (message.action?.flow !== "sign-in" || savedSignInPrompts.some(receipt => receipt.id === message.id)))
  const conversationRows = cardRows.filter((card) => inConversation(card, conversationTabId))
  // Admin chrome follows the same capability-filtered registry as every act.
  const isAdmin = controller.commands.find("admin.devtools") !== undefined
  const conversationCards = conversationRows.filter((card) => shownInTranscript(card, isAdmin))
  /*
   * A stable array: CardView is memoized, and re-sorting the same rows into a
   * fresh array on every render would re-render every card body regardless.
   * The Wiki pane lists the same array (WorldSurface.tsx).
   */
  const worldDocuments = useMemo(
    () => [...worldDocumentRows].sort((left, right) => left.path.localeCompare(right.path)),
    [worldDocumentRows]
  )
  /*
   * The flow registry, read once per render: the opening read counts it and
   * the shell's `data-flows` manifest names it. The registry object never
   * changes while its catalog does (admin sign-in, a repository's flow
   * leaves), so there is no identity to memoize the read on.
   */
  useLiveQuery(collections.repositoryFlows)
  const flows = controller.commands.all()
  const sharedConversation = useSharedConversation(controller.sharedConversation)
  const typing = controller.sharedConversation ? sharedConversation.conversation?.entries.some(row => "authorLogin" in row && row.authorLogin === identityRows[0]?.login && (row.state === "running" || row.state === "accepted")) === true : session.phase === "responding"
  const streamingMessageId = typing ? messages[messages.length - 1]?.id : undefined
  const identity = identityRows[0]
  const confirmations = useTopic(identity?.state === "signed-in" && identity.memberId && controller.live
    ? `confirmations:${identity.memberId}` : undefined, controller.live)
  const confirmationRole = useTodoRole()
  const privateConfirms = confirmations?.error ? [] : memberConfirmations(confirmations?.data)

  // The door is already mounted. Restore focus in this gesture, before the
  // user's next focus choice can be overwritten by a delayed frame.
  const rememberComposerOrigin = (): void => {
    const doc = composerWrapRef.current?.ownerDocument
    if (doc && controller.store.session().paletteOpen !== true) rememberComposerFocus(doc)
  }
  const restoreComposerOrigin = (): void => {
    const doc = chatTriggerRef.current?.ownerDocument ?? composerWrapRef.current?.ownerDocument
    if (doc) restoreComposerFocus(doc, chatTriggerRef.current)
  }
  const dismissComposer = (): void => {
    controller.closePalette(controller.store.session().draft)
    restoreComposerOrigin()
  }

  /** Dismiss open chrome without swallowing the original press. */
  const onShellPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (session.paletteOpen === true && target.matches(".composer-overlay")) {
      // The backdrop's native pointer focus would otherwise blur the door
      // immediately after we restore it.
      event.preventDefault()
      dismissComposer()
    }
  }
  /*
   * One page: the chat. Auth is a conversation state, never a view — a
   * definitive signed-out answer opens the transcript
   * with the Smithers message whose action IS the one available step.
   * "Unknown" is not a definitive answer and changes nothing. "Unavailable"
   * IS one about the BUILD: a deployment with no identity seam can never
   * sign in, and pretending otherwise walked live users into empty choosers
   * and dead sign-in flows — so the state names itself up front, once,
   * derived like the rest (never stored, gone the moment a seam answers).
   *
   * Signed out on the web (docs/web-mode/PLAN.md §3) is the third definitive
   * state: the visitor reads what this is and the one act that is theirs,
   * in the shape auth.prompt renders (message + CTA bound to sign-in).
   * Only the cloud host: local keeps its opening read (sign-in is an option
   * there), and a build with no identity seam is "unavailable", not this.
   *
   * With a public catalog repository selected (the /owner/name path,
   * apps/server/PUBLIC-REPOSITORIES.md) the signed-out visitor is not gated:
   * reads and chat work, and writes render the sign-in step when needed.
   */
  /*
   * The sign-in door, named once: the hosted GitHub session is the provider
   * `github` (state/IdentityProvider.ts), and the GitHub copy, the public
   * catalog exploring and the signup are its. The owner's credentials
   * (self-host, the owned native backend) get the one `sign-in` door
   * below. Neither reads the host name: a self-hosted origin is the web app.
   * A build with no bootstrap at all (a harness) has no sign-in to offer and
   * no opening read to give; the empty transcript is the pinned behaviour.
   */
  const hasBootstrap = controller.bootstrap !== undefined
  const githubIdentity = hasBootstrap && controller.identityProvider === "github"
  const bootRepository = useMemo(() => typeof window === "undefined" ? null : pathRepo(window.location.pathname), [])
  // The catalog receipt owns admission. A build-time roster cannot classify a
  // pending/failed request, or reject a repository added since this build.
  const bootEntry = session.repositoryEntry?.repo.toLowerCase() === bootRepository?.toLowerCase()
    ? session.repositoryEntry : undefined
  const bootPending = bootRepository !== null && (bootEntry === undefined || bootEntry.phase === "pending")
  const bootUnavailable = bootEntry?.phase === "failed" && bootEntry.failureKind !== "not-public"
  const missingBootRepository = bootEntry?.phase === "failed" && bootEntry.failureKind === "not-public"
    ? bootRepository : null
  const exploringRepo = identity?.state === "signed-out" && githubIdentity
    ? catalogRepositoryOf(session.activeRepoKey, repositoryRows)
    : null
  const repositoryNotice = missingBootRepository !== null && identity?.state === "signed-out" && githubIdentity
  /*
   * Signed in at `/owner/repo` for a repository Smithers does not have
   * (mvp.md M-46). The route owes that reader the truth and the one step that
   * exists: Import where the Smithers GitHub App covers the repository for
   * this account, else the App's own installation page, and neither when the
   * coverage door could not be read (RepositoryEntryOffer.ts). Derived from
   * the App-status row the entry wrote, never stored as a message.
   *
   * It marks the transcript the way the signed-out notice does, so the
   * retained cards of the LAST repository are not presented as this URL's
   * (production 2026-10-15: the header cleared to "Repository" while the
   * previous repository's cards stayed on screen). The cards stay stored.
   */
  const entryOffer = missingBootRepository !== null && identity?.state === "signed-in"
    ? missingRepositoryOffer(missingBootRepository, appStatusRows.find(row => row.repo.toLowerCase() === missingBootRepository.toLowerCase()))
    : undefined
  const repositoryEntryMessage: Message | undefined = entryOffer === undefined ? undefined : {
    id: "repository-entry",
    role: "smithers",
    text: entryOffer.text,
    status: "complete",
    ...(entryOffer.action === undefined ? {} : { action: entryOffer.action }),
    createdAt: 0,
    ordinal: 0
  }
  /** Either missing-repository notice owns the transcript's repository scope. */
  const missingRepositoryScope = repositoryNotice || repositoryEntryMessage !== undefined
  const publicRepositoryLinks = (bootEntry?.publicRepositories ?? [])
    .filter(repo => repo.toLowerCase() !== missingBootRepository?.toLowerCase())
    .map(repo => `- [${repo}](/${repo.toLowerCase()}/)`)
  const authMessage: Message | undefined = controller.bootstrap?.capabilities.includes("install") ? identity?.state === "signed-out" && exploringRepo === null && (typeof window === "undefined" || window.location.pathname !== "/setup") ? {
    id: "auth-state", role: "smithers", text: "", status: "complete",
    action: { flow: "sign-in", label: "Sign in with GitHub" }, createdAt: 0, ordinal: 0
  } : undefined : identity?.state === "signed-out" && hasBootstrap && !githubIdentity
    ? {
      id: "auth-state",
      role: "smithers",
      text: "Sign in to continue.",
      status: "complete",
      action: { flow: "sign-in", label: "Sign in" },
      createdAt: 0,
      ordinal: 0
    }
    : identity?.state === "signed-out" && githubIdentity
    ? bootPending ? undefined : bootUnavailable
      ? {
        id: "repository-state",
        role: "smithers",
        text: bootEntry.error ?? "The public repository catalog could not be read.",
        status: "complete",
        createdAt: 0,
        ordinal: 0
      }
      : repositoryNotice || (bootEntry?.phase !== "ready" && exploringRepo === null && !messages.some(message => message.action?.flow === "sign-in"))
      ? {
        id: "auth-state",
        role: "smithers",
        text: missingBootRepository === null
          ? "This is the Smithers web app. Sign in with GitHub to open one of your repositories and read its files here."
          : `${missingBootRepository} isn't on Smithers yet. Sign in with GitHub to open your own repositories${
            publicRepositoryLinks.length === 0 ? "." : `, or pick one below.\n\n${publicRepositoryLinks.join("\n")}`
          }`,
        status: "complete",
        action: { flow: "sign-in", label: "Sign in with GitHub" },
        createdAt: 0,
        ordinal: 0
      }
      : undefined
    // MOCK SEAM (state/seams/DesignWorld): the mounted seed stands in for the sign-in this host lacks, so the bubble stays out while it is mounted.
    : identity?.state === "unavailable" && !controller.design.enabled
    ? {
      id: "auth-state",
      role: "smithers",
      text:
        "Sign-in is unavailable on this host.",
      status: "complete",
      createdAt: 0,
      ordinal: 0
    }
    : undefined

  /*
   * The one step the auth state offers, named once because it renders twice:
   * inside the message that explains it, and again as the keyboard shortcut
   * below.
   */
  const authAction = authMessage?.action

  /*
   * The hosted web app's signed-out opening is the login screen (Will,
   * 2026-10-03), in the middle of the page: the GitHub door and the email
   * door, in place of the opening message. A repository notice keeps its
   * message (it carries the catalog links) and the owner-credentials host
   * keeps its one Sign in door.
   */
  const loginScreen = !controller.bootstrap?.capabilities.includes("install") && authMessage?.id === "auth-state" && githubIdentity && !repositoryNotice && authMessage.action?.flow === "sign-in"

  /*
   * The opening entry: what the host registered, derived from the live
   * collections (never stored), with the repo step riding it as its action.
   * A gated auth state (signed out) still shows only itself.
   */
  const gatedByAuth = identity?.state === "signed-out"
  /*
   * HOME MOUNT (T-APP-01): the Home card (HomeView through its card file) is
   * pinned first in main's conversation. The home lane fills this slot.
   */
  const homeCard: ReactNode = renderHomeCard()
  // The login screen owns the page: no home beside its two doors.
  const home = homeCard !== null && conversationTabId === undefined && !loginScreen
  // A cloud repository opens on its Welcome actions. Selection is durable and
  // precedes that card's load, so the technical success read never flashes first.
  const repositoryOpening = session.activeRepoKey != null
  // A new conversation opens empty; the host's opening read belongs to main alone.
  // The host read is a diagnostic: local hosts show it; a cloud visitor never needs it.
  const cloudWeb = cloudWebHost(controller.bootstrap)
  /*
   * The launcher at `/` (mvp.md M-45): open a repository Smithers already
   * has, create one, explore the others, read genuine Smithers update news.
   * It replaces the host diagnostic that used to be the first thing a
   * first-time reader met here, and it is additive — the conversation, the
   * saved cards and the repository a returning person already selected all
   * stay exactly where they were, below it.
   *
   * Only the hosted web app's root path: an install's `/` is its stack, and
   * `/owner/repo` is the repository's own route.
   */
  const launcherPath = useMemo(() => typeof window !== "undefined" && window.location.pathname === "/", [])
  const showLauncher = cloudWeb && launcherPath && conversationTabId === undefined && !earlier
  /*
   * The repository's own default view at `/owner/repo` (M-45): the file tree
   * unless the repository declares a homepage, which the existing
   * repository-flows row carries (state/seams/RepositoryFlowsSeam.ts reads
   * GET /api/repos/{o}/{r}/home into it). Absent, unreadable, invalid or
   * still loading all leave the tree as the view; only an outright read
   * failure says so, and the Files act keeps the tree one press away.
   */
  const repositoryHome = bootRepository === null || conversationTabId !== undefined || earlier
    ? undefined
    : repositoryFlowRows.find(row => row.id.toLowerCase() === bootRepository.toLowerCase())?.home
  const homeTreeCopy = bootRepository === null ? undefined : treeCopyOf(controller.store, bootRepository)
  const openingMessage: InitMessage | undefined = gatedByAuth || cloudWeb || repositoryOpening || conversationTabId !== undefined || home ? undefined : initMessage({
    bootstrap: controller.bootstrap,
    flowCount: flows.length,
    connectors: connectorRows,
    repositories: repositoryRows
  })
  /*
   * §2a″ (wave 12 §4): auth is a conversation STATE, and a state shows only
   * itself. Signed out, the auth message is the whole transcript. Wave 14 §1
   * removed the seeded welcome that used to sit under it, so there is no
   * longer a filler message to filter out here — the transcript is exactly
   * what the session actually said.
   */
  const entries: ReadonlyArray<TranscriptEntry> = [
    ...(openingMessage === undefined ? [] : [{ kind: "init", message: openingMessage } as const]),
    ...(authMessage === undefined || loginScreen ? [] : [{ kind: "message", message: authMessage } as const]),
    ...(repositoryEntryMessage === undefined ? [] : [{ kind: "message", message: repositoryEntryMessage } as const]),
    ...messages.map((message): TranscriptEntry => ({ kind: "message", message })),
    // A missing URL owns this arrival; retained cards from the last repository
    // stay stored, but cannot become the requested repository's projection.
    ...(missingRepositoryScope ? conversationCards.filter(card => !("repo" in card.payload) || card.payload.repo === missingBootRepository) : conversationCards)
      .map((card): TranscriptEntry => ({ kind: "card", card }))
  ].sort(transcriptOrder)
  // Batches before the newest ten fold into one row; opening it is transient chrome for this conversation only.
  const transcriptKey = controller.sharedConversation
    ? `${identity?.login ?? ""}:${session.branchNavigation?.selected_branch ?? "main"}`
    : `${conversationTabId ?? "main"}:${session.activeRepoKey ?? ""}`

  const visibleEntries = entries.filter(entry => !controller.sharedConversation || entry.kind !== "message" || entry.message.id === authMessage?.id || entry.message.id === repositoryEntryMessage?.id || entry.message.origin === "external" || entry.message.action !== undefined || diagnosticVisible(entry.message, identityRows[0]?.login, session.branchNavigation?.selected_branch ?? "main"))
  // A requested local read can target a retained card earlier in the transcript.
  const latestEntry = visibleEntries.at(-1)
  /*
   * What a read the PERSON asked for must bring into view (#3813). A read can
   * navigate ONE card in place and keep its own place — the repository web
   * pane is one card, and a saved conversation holds every private card at its
   * anchored position — so its answer is routinely not the transcript's last
   * entry, and the last entry is then somebody else's row (production
   * 20261015: /issues.create and /issues.list both refreshed the pane card
   * early in a saved conversation while the view stayed on the composer's form
   * at the bottom). The projection records the read's own destination; it
   * retires as soon as anything is appended after it, so ordinary output and
   * every passive arrival still read at the live edge.
   *
   * A read nobody asked for in THIS session is not a destination either: the
   * receipt persists with the session, and a reload restores the saved reading
   * position instead — a deliberate mid-transcript anchor, with Latest the way
   * back to the live edge. Neither is a read somebody ELSE asked for: a read
   * carries the account, repository and branch that asked, so signing in as
   * another person, opening another repository or moving branch leaves their
   * read behind rather than replaying it on whatever card shares its id.
   */
  const readScope = readScopeOf(identityRows[0], session)
  const requestedRead = session.requestedRead?.revision === bootReadRef.current.revision || session.requestedRead?.scope !== readScope
    ? undefined
    : session.requestedRead
  const appended = entries.at(-1)
  const readEntry = requestedRead === undefined || (appended !== undefined && entryOrdinal(appended) >= requestedRead.afterOrdinal)
    ? undefined
    : visibleEntries.find(entry => entry.kind === "card" && entry.card.id === requestedRead.cardId)
  /* Asking for the same view twice is two destinations, so the read's own revision keys it. */
  const readVersion = readEntry === undefined || requestedRead === undefined ? undefined : `read:${requestedRead.revision}`
  const readTarget = readEntry ?? latestEntry
  const latestReadId = readTarget === undefined ? undefined : entryId(readTarget)
  const initialReadId = loginScreen ? "login" : repositoryNotice ? authMessage?.id : repositoryEntryMessage !== undefined ? repositoryEntryMessage.id : home ? HOME_ENTRY_ID : undefined

  const renderEntry = (entry: TranscriptEntry) => <MessageScrollerItem key={entryId(entry)} messageId={entryId(entry)} style={{ contentVisibility: "visible" }}>
    {entry.kind === "card" ? <CardView
      key={entry.card.id}
      card={entry.card}
      maximized={session.maximizedCardId === entry.card.id}
      debugVerbose={session.verbose === true}
      signedOut={identity?.state === "signed-out"}
      admin={isAdmin}
      worldDocuments={worldDocuments}
      workflowCatalogs={workflowCatalogs}
      triggerCatalogs={triggerCatalogs}
      flowDurations={flowDurations}
      fileCards={fileCards}
      {...cardActions(controller, entry.card)}
    /> : <TranscriptMessage key={entry.message.id} entry={entry} streamingMessageId={streamingMessageId} />}
  </MessageScrollerItem>

  // Chat stays mounted when closed.
  const composerWrap = (
    <div className="composer-wrap" data-keyboard-pane="Chat input" ref={composerWrapRef} hidden={session.paletteOpen !== true}>
      <Composer
        typing={typing}
        autoFocus={authMessage === undefined}
        placeholder="Ask Smithers to work on something…"
      />
    </div>
  )

  return (
    // data-flows is the live registry manifest (visible AND hidden names):
    // under commands-are-the-app the registry is not secret — the agent tool
    // lists it to the model — and the launch checklist verifies every
    // data-flow binding against exactly this surface.
    <div
      className="app-shell"
      data-frame-maximized={session.maximizedCardId !== null || Object.values(sharedConversation.view?.card_view ?? {}).includes("maximized")}
      data-flows={flows.map((command) => command.name).join(" ")}
      onPointerDownCapture={onShellPointerDownCapture}
      onClickCapture={event => {
        if (event.target instanceof Element && event.target.closest("button[data-flow], [data-testid=composer-send]")) readRequestRef.current += 1
      }}
      onKeyDownCapture={event => {
        // The summon chord toggles the whole composer from every pane. Item
        // actions keep their ArrowRight path inside the palette.
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
          event.preventDefault()
          event.stopPropagation()
          const current = controller.store.session()
          if (current.paletteOpen === true && !event.shiftKey) dismissComposer()
          else {
            rememberComposerOrigin()
            const last = current.paletteLastQuery ?? ""
            if (event.shiftKey && last !== "") controller.runCommand("palette.open", last)
            else controller.runCommand("palette.open")
            composerWrapRef.current?.querySelector("textarea")?.focus()
          }
          return
        }
        if (event.key === "Enter" && !event.shiftKey && event.target instanceof HTMLTextAreaElement && event.target.dataset.testid === "composer-input" && event.target.value.trim()) readRequestRef.current += 1
      }}
      onKeyDown={(event) => {
        // Composer may close through its flow before this event bubbles, so
        // the new render's session already says closed. Use the event's origin.
        if (event.key === "Escape" && event.target instanceof Element && event.target.closest(".composer-wrap") && controller.store.session().paletteOpen !== true) {
          restoreComposerOrigin()
          return
        }
        if (event.defaultPrevented) {
          if (event.key === "Escape" && session.paletteOpen === true && controller.store.session().paletteOpen !== true) restoreComposerOrigin()
          return
        }
        if (event.key === "Escape" && event.target instanceof Element && event.target.closest(".input-mode-menu")) return
        if (event.key === "Escape" && session.paletteOpen === true) {
          event.preventDefault()
          dismissComposer()
          return
        }
        if (event.key === "Escape" && earlier) {
          event.preventDefault()
          controller.runCommand("branch", session.branchNavigation?.previous_branch ?? "main")
          return
        }
        if (event.key === "Escape" && session.maximizedCardId !== null) {
          controller.runCommand("card.minimize")
          return
        }
        // The dev-tools keyboard path (§2b): unregistered for non-admins, so a no-op there.
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
          event.preventDefault()
          controller.runCommand("admin.devtools")
          return
        }
      }}
    >
      <SmithersUiStyles />

      {/* The controller mounts the control-focus dim on the document body. */}
      {/* The chrome bar: the tab strip upper-left, the repo chip and chrome actions right. */}


      <div className="app-main">

      {
        /*
         * The main tab's body IS the chat. Every tab body stays mounted; an
         * inactive one is hidden, never unmounted (docs/LOCAL-APP.md "Tabs").
         */
      }
      <div
        className="tab-body"
        data-kind="main"
        data-conversation={conversationTabId}
        data-testid="tab-body-main"
      >
      <MessageScrollerProvider key={transcriptKey} scrollAnchor="bottom"
            initialMessageId={controller.sharedConversation ? sharedConversation.view?.scroll_anchor : initialReadId}
            readAnchor={controller.sharedConversation && readEntry === undefined && !(latestEntry?.kind === "card" && latestEntry.card.kind === "docs") ? undefined : { messageId: latestReadId ?? "",
              targetId: readTarget?.kind === "card" && readTarget.card.kind === "docs" ? readTarget.card.payload.anchor : undefined,
              /* A recorded read IS the person's own ask; nothing else claims to be. */
              actor: readEntry !== undefined || (readTarget?.kind === "message" && readTarget.message.role === "user") ? "user" : "output",
              requestId: readRequestRef.current,
              userMessageId: messages.filter(message => message.role === "user").at(-1)?.id,
              version: readVersion ?? (readTarget?.kind === "card" ? `${readTarget.card.ordinal}:${readTarget.card.kind}` : undefined) }}>
      <div className="chat-frame" data-pane={session.surface === "chat" ? undefined : session.surface}>
        <div className="chat-column">
          {
            /*
             * The one available step, first in the focus ring.
             *
             * While auth is the conversation state this is the only thing a
             * visitor can do, but the message's own CTA cannot be the document's
             * first tab stop: it renders inside the transcript, and @smthrs/ui
             * wraps the transcript in a scroller viewport that carries
             * tabindex="0". That tabindex is the dependency's keyboard access to
             * a scrollable region and is not ours to delete, and moving the CTA
             * out of the message would take the action away from the state that
             * explains it. So the step renders a second time here, ahead of the
             * scroller, as the control one Tab reaches from the document. It is
             * out of flow and clipped until focused, so the page looks the same
             * and the shortcut appears exactly when it is the thing you are on.
             */
          }
          {authAction !== undefined ?
            (
              <Button
                className="auth-shortcut"
                {...dynamicFlowAction(controller.runCommand, authAction.flow)}
              >
                {authAction.label}
              </Button>
            ) :
            null}

          <div className="sui-chat-transcript smithers-transcript" data-slot="chat-transcript"
            data-repository-missing={missingRepositoryScope || undefined}
            data-login={loginScreen || undefined}
            data-testid="transcript" data-keyboard-pane="Conversation" role="log" aria-label="Conversation" aria-busy={typing}>
            <div data-slot="message-scroller" className="sui-msg-scroller" data-streaming={typing ? "true" : "false"}>
            <MessageScrollerViewport fade onScrollCapture={event => {
              if (!controller.sharedConversation || !sharedConversation.view) return
              const viewport = event.currentTarget, top = viewport.getBoundingClientRect().top
              const first = [...viewport.querySelectorAll<HTMLElement>("[data-message-id]")].find(row => row.getBoundingClientRect().bottom > top + 1)
              const anchor = first?.dataset.messageId
              if (anchor && anchor !== sharedConversation.view.scroll_anchor) controller.sharedConversation.rememberScroll(anchor)
            }}>
            <MessageScrollerContent className="sui-chat-messages">
            {loginScreen && <MessageScrollerItem messageId="login" style={{ contentVisibility: "visible" }}>
              <LoginScreen onRunCommand={controller.runCommand} />
            </MessageScrollerItem>}
            {/* The login screen keeps its own doors; the launcher's public shelf and news sit under them. */}
            {showLauncher && <MessageScrollerItem messageId={LAUNCHER_ENTRY_ID} style={{ contentVisibility: "visible" }}>
              <RepositoryLauncherCard repositories={repositoryRows} signedIn={identity?.state === "signed-in"} />
            </MessageScrollerItem>}
            {repositoryHome !== undefined && !missingRepositoryScope && <MessageScrollerItem messageId={REPOSITORY_HOME_ENTRY_ID} style={{ contentVisibility: "visible" }}>
              <RepositoryHomeView repo={bootRepository!} home={repositoryHome} treeCopyId={homeTreeCopy}
                onRunCommand={(flow, args) => controller.runCommand(flow, args)} />
            </MessageScrollerItem>}
            {!earlier && !repositoryNotice && home && <MessageScrollerItem messageId={HOME_ENTRY_ID}>{homeCard}</MessageScrollerItem>}
            {!loginScreen && !repositoryNotice && <BranchNavigation saving={savingNavigation} onView={setBranchNavigationView} />}
            {!earlier && controller.sharedConversation && <SharedConversation source={controller.sharedConversation} localCardIds={new Set(visibleEntries.flatMap(entry => entry.kind === "card" ? [entry.card.id] : []))} localEntries={visibleEntries.map(entry => ({ id: entryId(entry), content: renderEntry(entry) }))} />}
            {!earlier && !controller.sharedConversation && visibleEntries.map(renderEntry)}
            {!earlier && privateConfirms.map(row => <MessageScrollerItem key={`confirmation:${row.id}`} messageId={`confirmation:${row.id}`}>
              {renderConfirmCard(memberConfirmCardProps(row, (tag, input) => {
                if ((tag === "approval.approve" || tag === "approval.deny") && input && "cardId" in input) {
                  controller.runCommand(tag, flowArgs(tag, { cardId: String(input.cardId) }))
                }
              }, confirmationRole !== "member"))}
            </MessageScrollerItem>)}
            {!earlier && typing && <ChatMessage role="assistant" pending pendingLabel="Smithers is responding" />}
            </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
            </div>
          </div>


        </div>

        {!repositoryNotice && session.surface === "chat" && <ShellRail entries={entries} home={home} />}

        {session.surface === "world" ?
          <WorldSurface documents={worldDocuments} /> :
          null}

        {/* Admin-only: the panel is absent — not hidden — for everyone else. */}
        {isAdmin && session.devtoolsOpen ? <DevtoolsPanel /> : null}
      </div>
      </MessageScrollerProvider>
      </div>

      {/* Card tabs; hidden while inactive, never unmounted. */}
      {/* Keep Chat reachable while a terminal or another tab owns the view. */}
      <div className="composer-overlay" data-testid="composer-overlay" hidden={session.paletteOpen !== true}>
        {composerWrap}
      </div>
      {/* The login screen owns the page: Chat's controls arrive once there is something to ask it (⌘K still opens the composer). */}
      {loginScreen ? null : <footer data-keyboard-pane="Chat controls" className="app-chat-controls" aria-label="Chat controls">
        <FirstSightHint id="chat" placement="above" content={<ChatHint />}><ShortcutButton ref={chatTriggerRef} shortcut={SHORTCUT_KEYS.chat} {...flowProps("chat.open")} onClick={() => {
          rememberComposerOrigin()
          controller.runCommand("chat.open")
          // Focus an already-open input now; Composer owns focus on opening.
          composerWrapRef.current?.querySelector("textarea")?.focus()
        }}>Chat</ShortcutButton></FirstSightHint>
        <InputModeMenu mode={session.inputMode ?? "normal"} onChange={mode => controller.runCommand("input.mode", mode)} />
      </footer>}
      </div>

      {
        /*
         * §28.4: reset destroys the transcript with no undo, so it names what
         * goes before it goes. The count is the transcript's own, so the
         * confirm cannot claim more or less than is actually there.
         */
      }
      <ConfirmDialog
        open={session.resetConfirmOpen === true}
        title="Start a fresh conversation?"
        body={`${
          messages.length === 1 ? "1 message" : `${messages.length} messages`
        } and everything on screen will be discarded. Nothing is kept.`}
        confirmLabel="Discard and start fresh"
        destructive
        onConfirm={() => {
          controller.runCommand("admin.reset")
        }}
        onCancel={() => controller.runCommand("admin.reset.cancel")}
      />
      <WikiDeleteDialog />
    </div>
  )
}

function App() {
  return <AppContent />
}
export default App
