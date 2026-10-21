import { Model, type ModelEvent, type ModelRequest } from "@smthrs/model"
import { Effect, Stream } from "effect"

// The scripted agents the end-to-end tests run on the browser's engine under the dev server (src/flows/engine.worker.ts,
// `?agent=<script>`), so a needs-you path and a sandbox tool's resume run the same every time: the model is the only
// scripted seam. The needs-you scripts ask with `app/agent/ask` until their cell has printed what it heard, then
// finish with what it heard in their words; `sandbox-once` calls the sandbox tools; `todo-draft` drafts a TODO.

/** A script: what its agent asks, and how it finishes once it heard the answer. */
interface Script {
  readonly ask: string
  readonly done: (heard: { readonly answered: boolean; readonly answer?: string; readonly approved?: boolean }) => string
}

const scripts: Readonly<Record<string, Script>> = {
  "needs-you": {
    ask: `{ kind: "question", prompt: "Which branch should I deploy?", options: ["main", "docs-v2"] }`,
    done: (heard) => (heard.answered ? `Deploying ${heard.answer}.` : "No answer, so nothing deployed."),
  },
  approval: {
    ask: `{ kind: "approval", prompt: "Delete the stale preview docs-v1?" }`,
    done: (heard) => (heard.approved === true ? "Deleted docs-v1." : "Kept docs-v1."),
  },
}

const cell = (source: string) => "```cell\n" + source + "\n```"

/** What the agent's cell printed it heard, if it has asked. */
const heardIn = (request: ModelRequest.ModelRequest) => {
  const text = request.messages.flatMap((message) => message.content.map((part) => ("text" in part ? part.text : "")))
  const printed = text.join("\n").match(/\{"answered":(?:true|false)[^}]*\}/)
  return printed === null ? undefined : JSON.parse(printed[0]) as Parameters<Script["done"]>[0]
}

/** Everything the model has been sent so far, as one text. */
const textOf = (request: ModelRequest.ModelRequest) =>
  request.messages.flatMap((message) => message.content.map((part) => ("text" in part ? part.text : ""))).join("\n")

/** One cell, then the turn's end: what a scripted turn streams. */
const turn = (source: string) =>
  Stream.fromIterable<ModelEvent.ModelEvent>([
    { type: "text-delta", id: "t", text: cell(source) },
    { type: "usage", inputTokens: 1, outputTokens: 1 },
    { type: "settle", stopReason: "stop" },
  ])

/**
 * `sandbox-once` (e2e/sandbox-tools.spec.ts): asked `sandbox-count <word>`, the agent runs a slow command on the branch's
 * machine that appends a line to `runs-<word>.log` and counts its lines, then reads the file back, then answers what it
 * saw. A command that ran twice would leave two lines.
 */
const sandboxOnce = Model.make({
  stream: (request) => {
    const text = textOf(request)
    // The question may reach the model in the system prompt or a message, after the conversation's earlier questions:
    // this run's is the last one anywhere in the request.
    const word = [...JSON.stringify(request).matchAll(/sandbox-count ([a-z0-9-]+)/g)].at(-1)?.[1] ?? "none"
    const ran = text.match(/\{"ran":"(\d+)"\}/)?.[1]
    const lines = text.match(/\{"lines":(\d+)\}/)?.[1]
    const log = `runs-${word}.log`
    if (ran === undefined) {
      return turn(
        `const r = await ctx.call("sandbox/run", { command: ${JSON.stringify(`sleep 15; echo ran >> ${log}; wc -l < ${log}`)} })\n` +
          `console.log(JSON.stringify({ ran: r.stdout.trim() }))`,
      )
    }
    if (lines === undefined) {
      return turn(
        `const f = await ctx.call("sandbox/read", { path: ${JSON.stringify(log)} })\n` +
          `console.log(JSON.stringify({ lines: f.content.split("\\n").filter(Boolean).length }))`,
      )
    }
    return turn(`ctx.done(${JSON.stringify(`Counted ${ran}; the log has ${lines} line(s) for ${word}.`)})`)
  },
})

/**
 * `todo-draft` (e2e/todos.spec.ts): asked `todo-draft <owner>/<name> <word>`, the agent drafts a TODO on that
 * repository with `todo/draft`, its prompt naming the word, then answers. It never commits: the person does.
 */
const todoDraft = Model.make({
  stream: (request) => {
    // The question ends the agent's system prompt, after the conversation before it, which may hold earlier runs'
    // questions: the last one asked is this run's. What its cells printed is in the messages.
    const text = [...request.system.map((part) => part.text), textOf(request)].join("\n")
    const asked = [...text.matchAll(/todo-draft ([\w.-]+\/[\w.-]+) ([a-z0-9-]+)/g)].at(-1) ?? []
    const [, repo = "octocat/Spoon-Knife", word = "none"] = asked
    if (!textOf(request).includes(`"status":"drafted"`)) {
      const input = { repo, prompt: `Add a line to the README: ${word}`, acceptance: ["The README ends with the line"] }
      return turn(`const d = await ctx.call("todo/draft", ${JSON.stringify(input)})\nconsole.log(JSON.stringify(d))`)
    }
    return turn(`ctx.done("Drafted. Edit it and press Commit.")`)
  },
})

/**
 * A deliberately slow reasoning service for the ordering regression. It emits private thinking for forty seconds
 * without visible answer progress. A follow-up can say it saw the earlier reply only when ChatApi included that
 * completed exchange in its turn. Everything except this slow model is the real browser/Worker/engine path.
 */
const reasoningOrder = Model.make({
  stream: (request) => {
    const text = [...request.system.map((part) => part.text), textOf(request)].join("\n")
    const asked = [...text.matchAll(/(Think quietly, then say ready|Use the previous answer): ([a-z0-9-]+)/g)].at(-1)
    const word = asked?.[2] ?? "missing"
    if (asked?.[1] === "Use the previous answer") {
      const included = text.includes(`Smithers: Ready ${word}.`)
      return turn(`ctx.done(${JSON.stringify(`${included ? "Earlier answer included" : "Earlier answer missing"}: ${word}.`)})`)
    }
    const thinking = Stream.fromIterable(Array.from({ length: 40 }, (_, index) => index)).pipe(
      Stream.mapEffect(() =>
        Effect.as(Effect.sleep("1 second"), {
          type: "thinking-delta", id: "reasoning-order", text: "Still considering the question. ",
        } satisfies ModelEvent.ModelEvent)
      ),
    )
    return Stream.concat(thinking, turn(`ctx.done(${JSON.stringify(`Ready ${word}.`)})`))
  },
})

/** The scripted model named `name`, or `undefined` for a name no script has. */
export const scriptedModel = (name: string): Model.Model | undefined => {
  if (name === "sandbox-once") return sandboxOnce
  if (name === "todo-draft") return todoDraft
  if (name === "reasoning-order") return reasoningOrder
  const script = scripts[name]
  if (script === undefined) return undefined
  return Model.make({
    stream: (request) => {
      const heard = heardIn(request)
      const source = heard === undefined
        ? `const heard = await ctx.call("app/agent/ask", ${script.ask})\nconsole.log(JSON.stringify(heard))`
        : `ctx.done(${JSON.stringify(script.done(heard))})`
      const events: ReadonlyArray<ModelEvent.ModelEvent> = [
        { type: "text-delta", id: "t", text: cell(source) },
        { type: "usage", inputTokens: 1, outputTokens: 1 },
        { type: "settle", stopReason: "stop" },
      ]
      return Stream.fromIterable(events)
    },
  })
}
