import { describedFailure, FailureNotice } from "./FailureNotice"
import { useLiveQuery } from "@tanstack/react-db"
import { Fragment, useSyncExternalStore, type ReactNode } from "react"
import { activityCode, activityLabel, elapsed, scriptFence, turnSegments } from "./TurnTrace"
import { Wrench } from "lucide-react"
import { Markdown, MessageScrollerItem } from "@smthrs/ui"
import { PlaceholderAvatarUrl } from "@smthrs/rpc/CardPrimitives"
import { CopyMessageButton, TranscriptMessage } from "./TranscriptMessage"
import { answerActions } from "./flows/AnswerActions"
import { flowArgs } from "./flows/FlowArgs"
import { DiffAction } from "./cards/views/DiffAction"
import { cardActions } from "./flows/cardActions"
import { contextActions } from "./flows/contextActions"
import { contextOpenAction } from "./flows/contextOpenAction"
import { EntryRow } from "./EntryRow"
import { CardView } from "./ChatCards"
import { controllerCardActions } from "./cards/controllerCardActions"
import { useController } from "./ControllerContext"
import type { AgentTurnFrame } from "@smthrs/rpc/NativeAgent"
import type { Card } from "./state/AppState"
import type { SharedConversationSeam } from "./state/seams/SharedConversationSeam"
import { TranscriptOrder } from "./state/TranscriptOrder"

/* A live turn re-renders its line each second: an external clock
 * subscription, never a lifecycle effect. */
const tick = (onTick: () => void) => { const timer = setInterval(onTick, 1000); return () => clearInterval(timer) }
const idle = () => () => {}
function TurnElapsed({ state, startedAt, finishedAt, produced }: { state: string; startedAt?: number; finishedAt?: number; produced: boolean }) {
  const working = state === "accepted" || state === "running"
  const seconds = () => startedAt === undefined || !working ? 0 : Math.floor((Date.now() - startedAt) / 1000)
  const live = useSyncExternalStore(working ? tick : idle, seconds, seconds)
  // A turn that has committed nothing is not working yet: production turn
  // 83bca322 spent 206.8 s deferred for a busy fleet while this line claimed
  // "Working for 3m26". Until output arrives, say the one true thing, that no
  // model host has answered, and leave the cause to the typed outcome.
  if (working) return startedAt === undefined ? null
    : produced ? <p className="turn-elapsed" data-turn-elapsed="working">Working for {elapsed(live * 1000)}</p>
    : <p className="turn-elapsed" data-turn-elapsed="waiting">Waiting for a model host · {elapsed(live * 1000)}</p>
  const label = state === "completed" ? "Worked" : state === "cancelled" ? "Stopped" : state === "failed" ? "Failed" : "Interrupted"
  const duration = startedAt === undefined || finishedAt === undefined ? undefined : elapsed(finishedAt - startedAt)
  if (state === "completed" && duration === undefined) return null
  return <p className="turn-elapsed" data-turn-elapsed={state === "completed" ? "worked" : state}>{label}{duration === undefined ? "" : ` ${state === "completed" ? "for" : "after"} ${duration}`}</p>
}

/*
 * What a person reads first about a turn that ended badly. The typed outcome
 * the producer stated chooses the sentence; the producer's own words stay the
 * raw detail behind Details, and an outcome this build does not know keeps the
 * generic sentence rather than promoting an error message into trusted copy.
 */
type DoneFrame = Extract<AgentTurnFrame, { type: "done" }>
const SHARED_TURN_FAILED = { fault: "infra", sentence: "Smithers could not finish that. Not your fault.", actions: [] } as const
/* The fleet refused the launch before anything ran, so nothing of theirs is gone. */
const HOST_NO_CAPACITY = { fault: "infra", sentence: "Every model host is busy. Nothing here was lost; send it again in a moment.", actions: [] } as const
const sharedTurnFailure = (failure: DoneFrame & { error: string }) => failure.code === "host_no_capacity"
  ? describedFailure("HostNoCapacity", HOST_NO_CAPACITY, failure.error)
  : describedFailure("SharedTurnFailed", SHARED_TURN_FAILED, failure.error)

/** Output only: no tool-call frame can invoke a browser command. */
export function SharedConversation({ source, localCardIds, localEntries = [] }: { source: SharedConversationSeam; localCardIds?: ReadonlySet<string>; localEntries?: readonly { id: string; content: ReactNode }[] }) {
  const controller = useController()
  const { data: sessions } = useLiveQuery(q => q.from({ session: controller.store.collections.sessions }).select(({ session }) => ({ id: session.id, requests: session.sharedPrompts, anchors: session.transcriptAnchors })))
  const { data: identities } = useLiveQuery(controller.store.collections.identitySessions)
  const owner = identities[0]?.state === "signed-in" ? identities[0].login : undefined
  const navigation = controller.store.session().branchNavigation
  const branch = navigation?.owner === owner ? navigation?.selected_branch : "main"
  const snapshot = useSyncExternalStore(source.subscribe, source.get, source.get)
  // A request the conversation acknowledged with a turn id has one receipt:
  // the shared turn. Keeping the private row beside it showed production turn
  // 83bca322's prompt twice, once as a failed request and once as the turn's
  // own failed answer. The saved row is untouched, so Retry still has it, and
  // a request the conversation never acknowledged (or whose turn is not in
  // this projection) keeps its own row rather than losing the person's words.
  const acknowledged = new Set((snapshot.conversation?.entries ?? []).map(entry => entry.id))
  const requests = (sessions[0]?.requests ?? []).filter(row => row.owner === owner && row.branch === branch
    && (row.state === "requested" || row.state === "failed")
    && !(row.state === "failed" && row.turnId !== undefined && acknowledged.has(row.turnId)))
  const sharedCards = new Map<string, Card>()
  for (const turn of snapshot.conversation?.entries ?? []) {
    if (!("frames" in turn)) continue
    for (const frame of turn.frames) if (frame.runId === turn.runId && frame.type === "card") sharedCards.set(frame.card.id, frame.card)
  }
  const renderedCards = new Set<string>()
  const scope = TranscriptOrder.scope(identities[0], controller.store.session())
  const local = [...localEntries.map(entry => ({ id: entry.id, value: entry.content })), ...requests.map(row => ({
    id: `prompt-request:${row.id}`,
    value: <MessageScrollerItem messageId={`prompt-request:${row.id}`} style={{ contentVisibility: "visible" }}><EntryRow kind="prompt" private author={{ kind: "person", login: row.owner, name: row.owner, avatar_url: PlaceholderAvatarUrl, color_index: 0 }} title="" tone={row.state === "failed" ? "failed" : "quiet"} card={<div data-prompt-request={row.id}><div data-composer-prompt={row.id}><Markdown content={row.prompt} /></div>{row.error ? <FailureNotice role="status" failure={describedFailure("PromptUnavailable", { fault: "infra", sentence: "Prompt unavailable", actions: [] }, row.error)} /> : <p role="status">Requested</p>}</div>} onAction={() => {}} /></MessageScrollerItem>
  }))]
  const ordered = TranscriptOrder.merge(snapshot.conversation?.entries ?? [], local, sessions[0]?.anchors, scope)
  return <div data-shared-conversation={snapshot.conversation?.id}>
    {snapshot.error ? <FailureNotice role="status" failure={describedFailure("ConversationUnavailable", { fault: "infra", sentence: snapshot.error === "View unavailable" ? "View unavailable" : "Conversation unavailable", actions: [] }, snapshot.error)} /> : null}
    {ordered.map(item => {
      if (item.kind === "local") return <Fragment key={`local:${item.entry.id}`}>{item.entry.value}</Fragment>
      const turn = item.turn
      if ("origin" in turn && turn.origin === "external" && "role" in turn) return <MessageScrollerItem key={turn.id} messageId={turn.id} style={{ contentVisibility: "visible" }}><TranscriptMessage entry={{ kind: "message", message: turn }} streamingMessageId={undefined} /></MessageScrollerItem>
      if (!("frames" in turn)) return null
      const person = { login: turn.authorLogin, name: turn.authorLogin, avatar_url: PlaceholderAvatarUrl }
      const frames = turn.frames.filter(frame => frame.runId === turn.runId)
      const text = frames.flatMap(frame => frame.type === "delta" && frame.kind === "text" ? [frame.text] : []).join("")
      const failure = [...frames].reverse().find(frame => frame.type === "done" && frame.error)
      const color = (turn.author % 6) as 0 | 1 | 2 | 3 | 4 | 5
      const inspect = cardActions((tag, input) => controller.runCommand(tag, JSON.stringify(input)), turn.preflight ? [
        { tag: "run.inspect", label: "Inspect", command_input: { id: turn.runId } }
      ] : [])
      const answers = turn.state === "completed" && text.trim() ? answerActions((name, input) => controller.commands.submit({ name, payload: (input ?? {}) as Record<string, unknown>, actor: "user", ...(name === "wiki.save" ? { display: flowArgs("wiki.save", input as { name?: string; text?: string }) } : {}) }), text, controller.commands) : undefined
      // The sender is Smithers; the reply quote, not the name, attributes the prompt (M-34).
      const answer = { kind: "agent" as const, id: turn.runId, agent: "smithers" as const, avatar_url: PlaceholderAvatarUrl, color_index: color }
      const reply = <blockquote className="turn-reply" data-reply-to={`${turn.id}:prompt`}><span className="turn-reply-author">{person.name}</span><span className="turn-reply-text">{turn.prompt}</span></blockquote>
      const renderCard = (id: string) => {
        const card = sharedCards.get(id)
        if (!card || localCardIds?.has(id) || renderedCards.has(id)) return null
        renderedCards.add(id)
        return <MessageScrollerItem style={{ contentVisibility: "visible" }} key={`card:${id}`} messageId={id}><CardView card={card} worldDocuments={[]} maximized={snapshot.view?.card_view?.[id] === "maximized"} {...controllerCardActions(controller, card)} /></MessageScrollerItem>
      }
      const trace = turn.subject ? null : turnSegments(frames).map((segment, index) => segment.kind === "text" ? <Markdown key={`text:${index}`} content={segment.text} />
        : segment.kind === "reasoning" ? <p key={`reasoning:${index}`} className="turn-reasoning" data-turn-reasoning="">{segment.text}</p>
        : segment.kind === "card" ? renderCard(segment.id)
        : (() => {
          const code = activityCode(segment)
          const label = <><Wrench size={14} aria-hidden="true" />{activityLabel(segment)}</>
          return code === undefined ? <p key={`activity:${segment.link}`} className="turn-activity" data-turn-activity={segment.link}>{label}</p>
            : <details key={`activity:${segment.link}`} className="turn-activity" data-turn-activity={segment.link}><summary>{label}</summary><Markdown content={scriptFence(code)} />{segment.rejected ? <p>{segment.rejected}</p> : null}</details>
        })())
      return <div key={turn.id} data-shared-turn={turn.id} data-state={turn.state}>
        {turn.subject ? null : <>
          <MessageScrollerItem style={{ contentVisibility: "visible" }} messageId={`${turn.id}:prompt`}><EntryRow kind="prompt" author={{ kind: "person", ...person, color_index: color }} title="" tone="quiet" card={<div data-composer-prompt={sessions[0]?.requests?.find(row => row.turnId === turn.id)?.id ?? turn.id}><Markdown content={turn.prompt} /></div>} onAction={() => {}} /></MessageScrollerItem>
          <MessageScrollerItem style={{ contentVisibility: "visible" }} messageId={`${turn.id}:answer`}><EntryRow kind="answer" author={answer} title="" tone="quiet" action={inspect.actions[0]} contextActions={turn.context ? contextActions(turn.context, (tag, input) => controller.runCommand(tag, JSON.stringify(input)), contextOpenAction) : undefined} context={turn.context ? { count: turn.context.length, items: turn.context } : undefined} card={<>{reply}<TurnElapsed state={turn.state} startedAt={turn.startedAt} finishedAt={turn.finishedAt} produced={frames.length > 0} />{trace}{answers ? <div className="message-answer-actions">{answers.actions.map(action => <DiffAction key={action.tag} action={action} onAction={answers.onAction} />)}</div> : null}<span className="message-actions"><CopyMessageButton text={text} onCopy={value => controller.runCommandForResult("chat.copy-message", value)} /></span>{failure?.type === "done" && failure.error ? <FailureNotice role="status" failure={sharedTurnFailure({ ...failure, error: failure.error })} /> : null}</>} onAction={inspect.onAction} /></MessageScrollerItem>
        </>}
        {turn.subject ? frames.flatMap(frame => frame.type === "card" ? [renderCard(frame.card.id)] : []) : null}
      </div>
    })}
  </div>
}
