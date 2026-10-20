import { Model, type ModelEvent, type ModelRequest } from "@smthrs/model"
import { Stream } from "effect"

// The scripted agents the end-to-end tests run on the browser's engine under the dev server (src/flows/engine.worker.ts,
// `?agent=<script>`), so a needs-you path runs the same every time: the model is the only scripted seam. Each asks with
// `app/agent/ask` until its cell has printed what it heard, then finishes with what it heard in its words.

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

/** The scripted model named `name`, or `undefined` for a name no script has. */
export const scriptedModel = (name: string): Model.Model | undefined => {
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
