import { AskChange } from "./AskChange"
import { HeldCodeChange, heldCodeChangeMessage } from "../ui/HeldCodeChange"
/* Open Ask starts with suggestions. Exchanges exist only after a send or an explicit review query.
 * Slash commands and change requests render a form or confirmation before an act starts. */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { signInRoute } from "../../core/catalog"
import { still, useMock, useRead } from "../../core/mock"
import { Link, navigate, useLocation } from "../../core/router"
import { askFor, branches, commit, doc, file, flow, issue, pull, repo, run, tags, to } from "../fixtures"
import { ApprovalCard, useRunRecords } from "../views/runs/shared"
import { RunsContent } from "../views/runs/Runs"
import { waitingOnYou } from "./waiting"
import { docSource } from "../views/docs/document"
import { usePackageScope } from "./packageScope"
import { agentAct } from "./agent-act"
import { formSubject } from "./subjects"
import type { AskSample } from "../fixtures/types"
import { CodeView, CopyButton, Icon, Markdown, StateIcon } from "../ui"
import { getSlash, missingSlashFields, parseSlash, registerSlash, useSlashCommands, type RegisteredSlash, type SlashField, type SlashValues } from "./slash"

type Kind = "change" | "approval" | "view" | "answer" | "held" | "signin" | "limit" | "confirm" | "form" | "denied" | "paused" | "copy" | "execute" | "user-only"
type Message = {
  id: number
  who: "you" | "smithers"
  text: string
  kind?: Kind
  command?: string
  field?: string
  fields?: SlashField[]
  values?: SlashValues
  registered?: boolean
  pending?: boolean
  error?: string
  done?: boolean
  instant?: boolean
  cards?: AskSample["cards"]
}
const changeRequest = (text: string) => /\b(fix|add|implement|change|create|remove|update|write|scaffold|refactor|build)\b/i.test(text)
const commandFields: Record<string, string> = {
  "/branch.switch": "Branch or tag", "/file.find": "File path", "/diff.toggle": "File path"
}
const legacyCommands = new Set([
  "/branch.switch", "/file.find", "/diff.toggle", "/ref.list"
])
const importViewCommands = new Set([
  "/repo.import", "/ask", "/cancel", "/ask.close", "/ask.retry", "/account.menu",
  "/theme", "/signout", "/signin", "/copy", "/notice.dismiss"
])

const questionsFor = (view: string): [string, string] => {
  if (view.startsWith("issues")) return ["What needs attention here?", "Which changes relate to this issue?"]
  if (view.startsWith("pull")) return ["What changed in this pull request?", "Which checks need attention?"]
  if (view.startsWith("runs")) return ["What happened in this run?", "What is waiting on a person?"]
  if (view.startsWith("flows")) return ["What does this flow do?", "What inputs does it need?"]
  if (view.startsWith("wiki") || view.startsWith("docs")) return ["Summarize this page", "Where is the related code?"]
  if (/^(tree|blob|blame|commit)/.test(view)) return ["How does this code work?", "Which tests cover this code?"]
  if (view.startsWith("settings")) return ["Who has access to this repository?", "Which models are connected?"]
  return ["Where should I start reading?", "How do I run the tests?"]
}

const SampleCard = ({ card, answer }: { card: NonNullable<AskSample["cards"]>[number]; answer: string }) => {
  if (card.kind === "file") {
    const path = card.ref.split(/[:#]/)[0]
    const blob = file(path)
    const citation = [...answer.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]).find(url => url.includes(`/${path}?`))
    const cited = Number(citation ? new URL(citation, "https://smithers.sh/").searchParams.get("L")?.split("-")[0] : card.ref.split(":")[1]) || 1
    const start = Math.max(1, cited - 2)
    return (
      <div className="repo-frame-ask-card">
        <Link to={to(`blob/${repo.defaultBranch}/${path}?L=${cited}`)}>
          <Icon name="file" size={14} />
          {path}
        </Link>
        {blob && <CodeView code={blob.content.split("\n").slice(start - 1, cited + 2).join("\n")} startLine={start} selectedLine={cited} path={path} />}
      </div>
    )
  }
  const entry = card.kind === "issue" ? issue(Number(card.ref.replace(/^#/, "")))
    : card.kind === "pull" ? pull(Number(card.ref.replace(/^#/, "")))
    : card.kind === "run" ? run(card.ref)
    : card.kind === "commit" ? commit(card.ref) : flow(card.ref)
  const path = card.kind === "issue" ? `issues/${card.ref.replace(/^#/, "")}`
    : card.kind === "pull" ? `pull/${card.ref.replace(/^#/, "")}`
    : card.kind === "run" ? `runs/${card.ref}`
    : card.kind === "commit" ? `commit/${card.ref}` : `flows/${card.ref}`
  return (
    <Link className="repo-frame-ask-card repo-frame-ask-card-row" to={to(path)}>
      <StateIcon state={entry && "state" in entry ? entry.state : "open"} />
      <span>{entry && "title" in entry ? entry.title : entry && "name" in entry ? entry.name : card.ref}</span>
      <Icon name="chevron" size={13} />
    </Link>
  )
}

const AskApproval = ({ id }: { id: string }) => {
  const { decisions, decide } = useRunRecords()
  const item = decisions.find(item => item.id === id)
  return item ? <ApprovalCard item={item} decide={decide} /> : <p>This approval is no longer available.</p>
}

const AnswerMessage = ({ message, view, renderReply, onSettled }: {
  message: Message
  view: string
  renderReply: (message: Message) => ReactNode
  onSettled: () => void
}) => {
  const location = useLocation()
  const instant = message.instant || still || new URLSearchParams(location.split("?")[1]).get("still") === "1"
  const [typed, setTyped] = useState(Boolean(instant))
  const read = useRead(`ask:${repo.slug}:${view}:${message.id}`)
  const remote = message.kind === "answer"
  const state = remote ? read.state : "ready"
  useEffect(() => {
    if (!remote || state !== "error") return
    return registerSlash("ask.retry", {
      purpose: "Retry answer", fields: [], access: "public", confirm: false,
      run: () => read.retry()
    })
  }, [remote, state])
  useEffect(() => {
    if (instant) return
    const timer = setTimeout(() => setTyped(true), 650)
    return () => clearTimeout(timer)
  }, [instant])
  useEffect(() => {
    if (typed && state !== "loading") onSettled()
  }, [typed, state])
  if (!typed || state === "loading") {
    return (
      <div className="repo-frame-typing" role="status" aria-label="Smithers is answering">
        <i /><i /><i />
      </div>
    )
  }
  if (state === "error") {
    return (
      <div className="repo-frame-ask-error" role="alert">
        <p>Smithers couldn't answer: the model host didn't respond.</p>
        <button className="repo-ui-btn" title="/ask.retry" onClick={read.retry}>Retry</button>
      </div>
    )
  }
  return (
    <div className="repo-frame-message">
      <span className="repo-frame-message-who">Smithers</span>
      {renderReply(message)}
      {message.kind === "answer" && message.cards?.map((card, i) => <SampleCard key={i} card={card} answer={message.text} />)}
    </div>
  )
}

export const AskPanel = ({ view, context, prompt, onClose, onActionChange, available = true }: {
  view: string
  context?: string
  prompt: { text: string; revision: number; send?: boolean }
  onClose: () => void
  onActionChange?: (open: boolean) => void
  available?: boolean
}) => {
  const { flags } = useMock()
  const capped = flags.as === "out" && flags.guest === "ceiling"
  const location = useLocation()
  const { scope } = usePackageScope()
  const homePrompt = available && location.split("?")[0].replace(/\/$/, "") === to()
    ? repo.config.home?.find(block => block.type === "prompt") : undefined
  const promptText = (text: string) => text.replaceAll("{package}", scope?.name ?? "the workspace")
  const baseSample = available ? askFor(view) ?? askFor("") : undefined
  const activePull = /\/pull\/(\d+)/.exec(location.split("?")[0])?.[1]
  const currentPull = activePull ? pull(Number(activePull)) : undefined
  const activeIssue = /\/issues\/(\d+)/.exec(location.split("?")[0])?.[1]
  const currentIssue = activeIssue ? issue(Number(activeIssue)) : undefined
  const sample = currentIssue ? {
    view, context: `#${currentIssue.n}: ${currentIssue.title}`,
    question: `What happened with #${currentIssue.n}: ${currentIssue.title}?`,
    answer: `${currentIssue.title}\n\n${currentIssue.body}`,
    cards: [{ kind: "issue" as const, ref: String(currentIssue.n) }]
  } : currentPull && baseSample ? {
    ...baseSample,
    question: `What changed in #${currentPull.n}: ${currentPull.title}?`,
    answer: `${currentPull.title}\n\n${currentPull.body}`,
    cards: [{ kind: "pull" as const, ref: String(currentPull.n) }]
  } : baseSample
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const actionOpen = messages.some(message => ["form", "confirm", "user-only"].includes(message.kind ?? ""))
  useEffect(() => { onActionChange?.(actionOpen) }, [actionOpen, onActionChange])
  const commands = useSlashCommands()
  const executing = useRef(new Set<number>())
  const automatic = useRef(new Set<number>())
  const textarea = useRef<HTMLTextAreaElement>(null)
  const conversation = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const header = headingRef.current
    const panel = header?.parentElement
    if (!header || !panel) return
    const measure = () => {
      const height = header.getBoundingClientRect().bottom - panel.getBoundingClientRect().top
      if (height > 0) panel.style.setProperty("--repo-ask-header-height", `${height}px`)
    }
    measure()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)
    observer?.observe(header)
    window.addEventListener("resize", measure)
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure) }
  }, [])
  const serial = useRef(0)
  const heading = context ?? sample?.context ?? `${repo.slug} at ${repo.defaultBranch}`
  const isPhone = () => matchMedia("(max-width: 767px)").matches
  const askDraft = new URLSearchParams(location.split("?")[1]).get("askDraft")
  const demo = askDraft ? null : new URLSearchParams(location.split("?")[1]).get("ask")
  const form = formSubject(location)
  const formQuestions = form === "bug" ? ["What makes a good bug report?", "Which details should I include?"]
    : form === "issue" ? ["What makes a good issue?", "How can I describe the problem?"]
    : form === "settings" ? ["What does this setting change?", "Who can change these settings?"]
    : form === "flow" ? ["What inputs does this flow need?", "What will this run change?"] : undefined
  const article = /\/docs(?:\/|$)/.test(location) ? doc(location.split("?")[0].split("/docs/")[1] ?? "") : undefined
  const articleQuestions = article ? [`Explain ${article.title}`, `Show an example from ${article.title}`] : undefined
  const source = available ? /\/(blob|blame|commits)\/[^/]+\/(.+)$/.exec(location.split("?")[0]) : null
  const requestedSource = source?.[2].split("/").map(decodeURIComponent).join("/")
  const resolvedSource = requestedSource ? file(requestedSource) : undefined
  const sourcePath = resolvedSource?.path ?? (source?.[1] !== "commits" ? requestedSource : undefined)
  const suggested = formQuestions || articleQuestions ? undefined : sourcePath ? `Explain ${sourcePath}` : sample?.question
  const [routeOwner, routeName] = location.split("?")[0].split("/").slice(1, 3)
  const activeRef = location.match(/\/(?:tree|blob|blame|commits|commit|branches)\/([^/?]+)/)?.[1] ?? location.match(/\/releases\/tag\/([^/?]+)/)?.[1]
  const articleSource = article ? docSource(article) : undefined
  const contextPath = sourcePath ?? (articleSource ? file(articleSource)?.path ?? articleSource : article ? `docs/${article.slug}` : undefined)
  const composerContext = `${routeOwner}/${routeName}${available ? ` · ${activeRef ? decodeURIComponent(activeRef) : repo.defaultBranch}` : ""}${contextPath ? ` · ${contextPath}` : ""}`
  const suggestions = [...new Set([suggested, ...(formQuestions ?? articleQuestions ?? (available ? questionsFor(view) : ["/repo.import"]))].filter((value): value is string => Boolean(value)))].slice(0, 3)
  const commandQuery = input.trimStart()
  const showCommands = commandQuery.startsWith("/") && !/\s/.test(commandQuery)
  const matchingCommands = commands.filter(command => (flags.as === "in" || command.access === "public") && command.name.startsWith(commandQuery) && (available || importViewCommands.has(command.name)))
  const demoFlags = demo ? [flags.as, flags.guest, flags.data, flags.role, flags.landing, flags.hosted, flags.model].join(":") : ""
  const scrollToEnd = () => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight
  }
  const reply = (kind: Kind, text: string, extra: Partial<Message> = {}): Message => ({
    id: ++serial.current, who: "smithers", kind, text, ...extra
  })
  const signedInReply = (text: string): Message | undefined => {
    if (flags.as === "out" && changeRequest(text) && flags.landing === "open") return reply("signin", "Sign in to start an agent.")
    if (flags.as === "out" && flags.guest === "ceiling") return reply("limit", "You've reached today's question limit.")
    if (flags.as === "out" && flags.guest === "off") return reply("signin", "Sign in to ask about this repo.")
    if (flags.as === "out" && (changeRequest(text) || /^\/(issue\.implement|box\.open|flow\.run)/.test(text))) {
      return reply("signin", "Sign in with GitHub to ask for changes.")
    }
    return undefined
  }
  const commandWall = (command: RegisteredSlash): Message | undefined => {
    if (!available && !importViewCommands.has(command.name)) return reply("denied", "Import this repository to continue.")
    if (command.name === "/change") {
      if (flags.as === "out") return reply("signin", "Sign in to start an agent.")
      if (flags.role !== "member") return reply("denied", `Only people who can push to ${repo.slug} can start an agent.`)
      if (flags.landing === "install") return reply("held", heldCodeChangeMessage)
    }
    const access = command.access ?? "member"
    if (access !== "public" && flags.as === "out") return reply("signin", "Sign in to continue.")
    if (access === "member" && flags.role !== "member") return reply("denied", `Only members of ${repo.slug} can start this act.`)
    return undefined
  }
  useEffect(() => registerSlash("change", {
    purpose: "Start an agent on a change",
    fields: [{ name: "request", label: "Change request" }],
    confirm: false,
    run: (values, context) => {
      const [path, raw] = context.location.split("?")
      const query = new URLSearchParams(raw)
      query.set("ask", "change")
      query.set("change", "admitted")
      query.set("changeRequest", values.request)
      navigate(`${path}?${query}`, { replace: true })
    }
  }), [])
  const registeredReply = (name: string, values: SlashValues): Message => {
    const command = getSlash(name)
    if (!command) return reply("answer", `Command ${name} is no longer available. Type / to choose a command.`)
    const wall = commandWall(command)
    if (wall) return wall
    const fields = missingSlashFields(command, values)
    const extra = { command: command.name, values, registered: true }
    if (fields.length) return reply("form", command.purpose, { ...extra, fields })
    if (command.name === "/change") return reply("change", values.request, { field: "admitted" })
    if (command.userOnly) return reply("user-only", command.userOnly, extra)
    if (command.confirm === false) return reply("execute", command.purpose, extra)
    return reply("confirm", typeof command.confirm === "string" ? command.confirm : `${command.purpose}?`, extra)
  }
  const makeReply = (text: string): Message => {
    if (text.startsWith("/")) {
      const parsed = parseSlash(text)
      if (getSlash(parsed.name)) return registeredReply(parsed.name, parsed.values)
    }
    const wall = signedInReply(text)
    if (wall) return wall
    if (!available) return reply("answer", "This repository hasn't been imported.")
    // Scripted agent doors select the actual act form; a person still records every decision.
    if (flags.data !== "empty" && /\b(answer|decide)\b.*\bapproval\b/i.test(text)) {
      if (flags.as === "out") return reply("signin", "Sign in to answer an approval.")
      const id = text.match(/run-[\w-]+/)?.[0]
      const item = waitingOnYou().pending.find(item => !id || item.run === id)
      return item ? reply("approval", "", { field: item.id }) : reply("answer", "No matching approval is waiting on you.")
    }
    if (/\b(make|create|add)\b.*\btodo\b/i.test(text)) {
      const number = text.match(/(?:issue\s*#?|#)(\d+)/i)?.[1]
      return registeredReply("issue.todo", { issue: number ?? "" })
    }
    const act = agentAct(text, commands)
    if (act) return registeredReply(act.name, act.values)
    if (/\b(show|open)\b.*\bruns\b/i.test(text)) return reply("view", "Runs", { field: /\b(need|waiting)\b/i.test(text) ? "waiting" : "all" })
    if (text === sample?.question && flags.data !== "empty") {
      return reply("answer", sample.answer, { cards: sample.cards })
    }
    if (text.startsWith("/")) {
      const [command, ...args] = text.trim().split(/\s+/)
      if (!legacyCommands.has(command)) return reply("answer", `Command ${command} isn't available here. Type / to choose a command.`)
      if (commandFields[command] && !args.length) {
        return reply("form", command, { command, field: commandFields[command] })
      }
      if (command === "/ref.list") {
        return reply("answer", (args[0] === "tags" ? tags : branches)
          .map(ref => `- [${ref.name}](tree/${encodeURIComponent(ref.name)})`).join("\n"))
      }
      if (command === "/diff.toggle") {
        return reply("answer", `[Open ${args.join(" ")}](blob/${repo.defaultBranch}/${args.join(" ")})`)
      }
      return reply("confirm", `Run ${text}?`, { command: text })
    }
    if (changeRequest(text)) {
      if (flags.as === "in" && flags.role !== "member") {
        return reply("denied", `Only people who can push to ${repo.slug} can start an agent.`)
      }
      if (flags.landing === "install") {
        return reply("held", heldCodeChangeMessage)
      }
      return reply("change", text)
    }
    if (flags.data === "empty") return reply("answer", "This repository is empty. Ask me to scaffold a project.")
    return reply("answer", sample?.answer ?? "No answer is available for this view yet.", { cards: sample?.cards })
  }

  useEffect(() => {
    let exchange: Message[] = []
    if (demo === "sample" && sample) {
      exchange = [
        { id: ++serial.current, who: "you", text: sample.question },
        { ...makeReply(sample.question), instant: true }
      ]
    } else if (["approval", "todo", "view"].includes(demo ?? "")) {
      const text = demo === "approval" ? `Answer the approval for ${waitingOnYou().pending[0]?.run ?? "run-511"}`
        : demo === "todo" ? "Make a TODO for issue #29" : "Show me the runs that need me"
      exchange = [{ id: ++serial.current, who: "you", text }, { ...makeReply(text), instant: true }]
    } else if (demo === "change") {
      exchange = [
        { id: ++serial.current, who: "you", text: flags.landing === "install" ? "Fix parameter decoding in the router" : (new URLSearchParams(location.split("?")[1]).get("changeRequest") ?? "add slugify(text) with tests") },
        { ...makeReply(flags.landing === "install" ? "Fix parameter decoding in the router" : (new URLSearchParams(location.split("?")[1]).get("changeRequest") ?? "add slugify(text) with tests")), instant: true }
      ]
    } else if (demo === "limit") {
      exchange = [
        { id: ++serial.current, who: "you", text: sample?.question ?? "How does this repository work?" },
        { ...makeReply(sample?.question ?? "How does this repository work?"), instant: true }
      ]
    } else if (demo?.startsWith("/") && demo !== "/") {
      exchange = [
        { id: ++serial.current, who: "you", text: demo },
        { ...makeReply(demo), instant: true }
      ]
    }
    setMessages(exchange)
    setInput(askDraft ?? (demo === "/" ? "/" : demo === "limit" ? sample?.question ?? "How does this repository work?" : ""))
  }, [repo.slug, view, demo, demoFlags, askDraft])
  useEffect(() => {
    if (prompt.send && prompt.text) send(prompt.text)
    else if (prompt.revision > 0 || !demo) setInput(prompt.text || new URLSearchParams(location.split("?")[1]).get("askDraft") || "")
    if (prompt.revision > 0 || isPhone()) textarea.current?.focus()
  }, [prompt.revision])
  useEffect(scrollToEnd, [messages])
  useEffect(() => {
    for (const message of messages) {
      if (message.kind !== "execute" || automatic.current.has(message.id)) continue
      automatic.current.add(message.id)
      void start(message)
    }
  }, [messages])

  const send = (text: string) => {
    const value = text.trim()
    if (!value) return
    if (capped) { setInput(text); return }
    if (value === "/") { setInput("/"); return }
    const personMessage: Message = { id: ++serial.current, who: "you", text: value }
    const answer = makeReply(value)
    setMessages(current => [...current, personMessage, answer])
    setInput("")
    textarea.current?.focus()
  }
  const finish = (id: number, replacement?: Message) => setMessages(current => replacement
    ? current.map(item => item.id === id ? { ...replacement, id, instant: true } : item)
    : current.filter(item => item.id !== id))
  const start = async (message: Message) => {
    if (!message.registered) {
      const parsed = parseSlash(message.command ?? "")
      if (getSlash(parsed.name)) {
        finish(message.id, registeredReply(parsed.name, parsed.values))
        return
      }
    }
    if (message.registered) {
      if (executing.current.has(message.id)) return
      const registered = getSlash(message.command ?? "")
      if (!registered) {
        finish(message.id, reply("answer", "This command is no longer available. Type / to choose a command."))
        return
      }
      const wall = commandWall(registered)
      if (wall) { finish(message.id, wall); return }
      executing.current.add(message.id)
      const values = message.values ?? {}
      if (missingSlashFields(registered, values).length) {
        executing.current.delete(message.id)
        finish(message.id, registeredReply(registered.name, values))
        return
      }
      setMessages(current => current.map(item => item.id === message.id ? { ...item, pending: true, error: undefined } : item))
      try {
        await registered.run(values, { flags, location, closeAsk: onClose })
        finish(message.id)
      } catch (error) {
        const reason = error instanceof Error ? error.message : "This command couldn't finish. Try again."
        setMessages(current => current.map(item => item.id === message.id ? { ...item, pending: false, error: reason } : item))
      } finally {
        executing.current.delete(message.id)
      }
      return
    }
    const line = message.command ?? ""
    const [command, ...parts] = line.split(/\s+/)
    const value = parts.join(" ")
    if (command === "/file.find") {
      finish(message.id)
      navigate(to(`search?q=${encodeURIComponent(value)}`))
      return
    }
    if (command === "/branch.switch") {
      finish(message.id)
      navigate(to(`tree/${encodeURIComponent(value)}`))
      return
    }
    if (flags.as === "out") {
      finish(message.id, reply("signin", "Sign in with GitHub to ask for changes."))
      return
    }
    if (flags.role !== "member") {
      finish(message.id, reply("denied", `Only members of ${repo.slug} can start this act.`))
      return
    }
    finish(message.id, reply("answer", "This command isn't available here. Type / to choose a command."))
  }
  const focusTrap = (event: KeyboardEvent<HTMLElement>) => {
    if (!isPhone() || event.key !== "Tab") return
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea')]
    const first = elements[0]
    const last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  const actionLabel = (message: Message) => {
    const names: Record<string, string> = { "/change": "Start agent", "/box.open": "Open sandbox", "/ask": "Ask", "/repo.import": "Import", "/search": "Search", "/theme": "Apply theme", "/copy": "Copy" }
    return names[message.command ?? ""] ?? getSlash(message.command ?? "")?.purpose ?? "Continue"
  }
  const renderReply = (message: Message) => {
    if (message.kind === "change") return <AskChange request={message.text} initialState={message.field} onCancel={() => finish(message.id)} />
    if (message.kind === "approval") return <AskApproval id={message.field!} />
    if (message.kind === "view") return <RunsContent embedded filterOverride={message.field} />
    if (message.done) return <p className="repo-ui-muted">Dismissed.</p>
    if (message.kind === "copy") {
      return (
        <div className="repo-frame-install">
          <code>{message.text}</code>
          <CopyButton text={message.text} small />
        </div>
      )
    }
    if (message.kind === "held") {
      return (
        <>
          <HeldCodeChange />
        </>
      )
    }
    if (message.kind === "signin" || message.kind === "limit") {
      return (
        <>
          <p>{message.text}</p>
          {!capped && <Link className="repo-ui-btn repo-ui-btn-primary" to={signInRoute(location)} title="/signin">Sign in with GitHub</Link>}
        </>
      )
    }
    if (message.kind === "denied" || message.kind === "paused") return <p>{message.text}</p>
    if (message.kind === "confirm" || message.kind === "execute" || message.kind === "user-only") {
      return (
        <div className="repo-frame-confirm">
          <p>{message.text}</p>
          {message.registered && message.values && <dl className="repo-frame-command-values">
            {Object.entries(message.values).filter(([, value]) => value).map(([name, value]) => (
              <div key={name}><dt>{getSlash(message.command ?? "")?.fields.find(field => field.name === name)?.label ?? name}</dt><dd>{value}</dd></div>
            ))}
          </dl>}
          {message.error && <p className="repo-frame-command-error" role="alert">{message.error}</p>}
          {message.pending && <span role="status">Running…</span>}
          <div className="repo-ui-actions">
            {(message.kind === "confirm" || message.kind === "user-only" || message.error) && <button className="repo-ui-btn repo-ui-btn-primary" title={message.command} disabled={message.pending} onClick={() => void start(message)}>{message.error ? "Retry" : message.kind === "user-only" ? getSlash(message.command ?? "")?.purpose : actionLabel(message)}</button>}
            <button className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" disabled={message.pending} onClick={() => finish(message.id)}>Cancel</button>
          </div>
        </div>
      )
    }
    if (message.kind === "form") {
      return (
        <form
          className="repo-frame-confirm"
          onSubmit={event => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            if (message.registered) {
              const values = { ...message.values }
              message.fields?.forEach(field => { values[field.name] = String(data.get(field.name) ?? "").trim() })
              finish(message.id, registeredReply(message.command ?? "", values))
              return
            }
            const value = String(data.get("value") ?? "").trim()
            if (value) finish(message.id, makeReply(`${message.command} ${value}`))
          }}
        >
          {message.registered ? message.fields?.map(field => {
            const id = `ask-field-${message.id}-${field.name}`
            return <div className="repo-frame-command-field" key={field.name}>
              <label htmlFor={id}>{field.label}</label>
              {field.options ? <select className="repo-ui-input" id={id} name={field.name} required={field.required !== false} defaultValue="">
                <option value="" disabled>Choose {field.label.toLowerCase()}</option>
                {field.options.map(value => <option key={value} value={value}>{value}</option>)}
              </select> : field.type === "textarea" ? <textarea className="repo-ui-input" id={id} name={field.name} required={field.required !== false} placeholder={field.placeholder} defaultValue={field.name === "repository" ? `${routeOwner}/${routeName}` : undefined} />
                : <input className="repo-ui-input" id={id} name={field.name} required={field.required !== false} type={field.type ?? "text"} min={field.min} placeholder={field.placeholder} defaultValue={field.name === "repository" ? `${routeOwner}/${routeName}` : undefined} />}
            </div>
          }) : <>
            <label htmlFor={`ask-field-${message.id}`}>{message.field}</label>
            <input
              className="repo-ui-input"
              id={`ask-field-${message.id}`}
              name="value"
              required
              type={message.field === "Issue number" ? "number" : "text"}
              min={message.field === "Issue number" ? 1 : undefined}
            />
          </>}
          <div className="repo-ui-actions">
            <button className="repo-ui-btn repo-ui-btn-primary" title={message.command}>{actionLabel(message)}</button>
            <button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" onClick={() => finish(message.id)}>Cancel</button>
          </div>
        </form>
      )
    }
    return <Markdown source={message.text} dense />
  }

  const actions = useRef({ send, messages, finish })
  actions.current = { send, messages, finish }
  useLayoutEffect(() => {
    const off = [
      registerSlash("ask", {
        purpose: "Ask", access: "public", confirm: false,
        fields: [{ name: "question", label: "Question", type: "textarea" }],
        run: ({ question }) => actions.current.send(question)
      }),
      registerSlash("cancel", {
        purpose: "Cancel", fields: [], access: "public", confirm: false,
        run: () => {
          const pending = [...actions.current.messages].reverse().find(message => message.who === "smithers"
            && ["form", "confirm", "execute", "user-only"].includes(message.kind ?? "")
            && !message.pending && message.command !== "/cancel")
          if (pending) actions.current.finish(pending.id)
          else document.querySelector<HTMLButtonElement>('#repo-content button[title="/cancel"]:not(:disabled)')?.click()
          setInput("")
        }
      })
    ]
    return () => off.forEach(dispose => dispose())
  }, [])

  return (
    <aside
      className="repo-frame-ask"
      id="repo-ask-panel"
      role={isPhone() ? "dialog" : "complementary"}
      aria-modal={isPhone() || undefined}
      aria-label="Ask Smithers"
      onKeyDown={focusTrap}
    >
      <button className="repo-frame-sheet-handle" title="/ask.close" aria-label="Close Ask sheet" onClick={onClose}
        onPointerDown={event => { event.currentTarget.dataset.startY = String(event.clientY); event.currentTarget.setPointerCapture?.(event.pointerId) }}
        onPointerUp={event => { if (event.clientY - Number(event.currentTarget.dataset.startY) > 40) onClose() }}><span /></button>
      <header ref={headingRef} className="repo-frame-ask-heading">
        <div>
          <h2>{homePrompt?.type === "prompt" ? promptText(homePrompt.title) : "Ask"}</h2>
          <p>{heading.startsWith("Asking about") ? heading : `Asking about ${heading}`}</p>
        </div>
        <button className="repo-ui-icon-btn" title="/ask.close · Escape" aria-label="Close Ask" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      <div className="repo-frame-conversation" ref={conversation} aria-live="polite" role="log" aria-label="Conversation">
        {messages.length === 0 && !capped && (
          <div className="repo-frame-suggestions" aria-label="Suggested questions">
            {suggestions.map(question => (
              <button
                key={question}
                type="button"
                className="repo-frame-suggestion"
                title={`/ask ${question}`}
                onClick={() => send(question)}
              >
                {question}
              </button>
            ))}
          </div>
        )}
        {messages.map(message => message.who === "you" ? (
          <div key={message.id} className="repo-frame-message repo-frame-message-you">
            <span className="repo-frame-message-who">{flags.as === "in" ? "maya" : "You"}</span>
            <p>{message.text}</p>
          </div>
        ) : (
          <AnswerMessage
            key={message.id}
            message={message}
            view={view}
            renderReply={renderReply}
            onSettled={scrollToEnd}
          />
        ))}
      </div>
      <form className="repo-frame-composer" onSubmit={event => { event.preventDefault(); send(input) }}>
      {showCommands && <div className="repo-frame-commands" aria-label="Slash commands">
        {matchingCommands.map(command => <button
          className="repo-frame-command"
          key={command.name}
          type="button"
          title={command.name}
          onClick={() => { setInput(`${command.name} `); textarea.current?.focus() }}
        >
          <code>{command.name}</code>
          <span>{command.purpose}</span>
        </button>)}
        {!matchingCommands.length && <p className="repo-ui-muted">No matching commands.</p>}
      </div>}
        <label className="repo-ui-sr" htmlFor="repo-ask-input">Ask about this repository</label>
        <textarea
          ref={textarea}
          id="repo-ask-input"
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={homePrompt?.type === "prompt" ? promptText(homePrompt.placeholder) : "Ask a question, or type /…"}
          rows={3}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send(input)
            }
          }}
        />
        <div className="repo-frame-composer-foot">
          <span className="repo-ui-muted">{composerContext}</span>
          {capped ? <Link className="repo-ui-btn repo-ui-btn-primary" title="/signin" to={signInRoute((() => {
            const [path, raw] = location.split("?")
            const query = new URLSearchParams(raw)
            query.delete("as")
            query.set("ask", "1")
            if (input) query.set("askDraft", input)
            return `${path}?${query}`
          })())}>Sign in with GitHub</Link> : <button className={`repo-ui-btn repo-frame-send${messages.some(message => ["form", "confirm", "user-only", "signin"].includes(message.kind ?? "") || message.error) ? "" : " repo-ui-btn-primary"}`} type="submit" title="/ask" aria-label="Send message" disabled={!input.trim()}>
            <Icon name="send" size={19} />
          </button>}
        </div>
      </form>
    </aside>
  )
}
