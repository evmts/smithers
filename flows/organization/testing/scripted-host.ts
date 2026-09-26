/**
 * An organization host whose seats answer from a script instead of a model,
 * for the offline end-to-end test (`flows/test/organization-host.test.mjs`).
 *
 * Everything else is the production host: the same settings, the durable
 * engine, the gateway, real microVM workspaces. Each seat recognises the role
 * it is serving by the charter objective in its system prompt and answers
 * with one cell: the assistant hands the request to the lead, the lead names
 * the builder and the checker, the builder appends a line to `README.md`
 * with `bash` in its workspace machine, and the checker approves. The builder
 * edits through `bash` rather than the file tools, which do not yet write
 * inside a microVM.
 *
 * `node flows/organization/testing/scripted-host.ts serve --standalone ...`
 * takes `serve`'s flags.
 */
import { NodeRuntime } from "@effect/platform-node"
import type * as FlowEngineLike from "@smthrs/agent/FlowEngineLike"
import * as Seat from "@smthrs/agent/Seat"
import * as SeatResolver from "@smthrs/agent/SeatResolver"
import * as Model from "@smthrs/model/Model"
import * as ModelEvent from "@smthrs/model/ModelEvent"
import type * as Route from "@smthrs/model/Route"
import { Effect, Stream } from "effect"
import { parseArgs } from "node:util"
import { platform } from "../../../packages/smithers/src/internal/NodeControlHost.ts"
import { start } from "../serve.ts"
import { environmentOf, resolve } from "../settings.ts"

/** The line the scripted builder appends. */
export const scriptedLine = "hello from the organization"

const done = (fields: Record<string, string>, summary: string, handoffs: ReadonlyArray<unknown> = []) => ({
  status: "done",
  summary,
  fields,
  evidence: [{ kind: "note", ref: "scripted", detail: "scripted answer" }],
  handoffs,
  escalations: [],
  decisions: []
})

const answering = (result: unknown) => `ctx.done(${JSON.stringify(JSON.stringify(result))})`

/** The one cell each role answers with, by the charter objective its system prompt carries. */
const cellFor = (system: string): string => {
  if (system.includes("Protect the owner's attention")) {
    return answering(done(
      { route: "task", assignee: "lead", reply: "Routing to the lead." },
      "The request needs a change; the lead owns it.",
      [{ to: "lead", objective: "Deliver the owner's request.", inputs: ["The owner's request."] }]
    ))
  }
  if (system.includes("Turn a routed request into the smallest valuable")) {
    return answering(done(
      { acceptance: `README.md ends with the line '${scriptedLine}'.`, owner: "builder" },
      "One line appended to README.md, checked independently.",
      [
        {
          to: "builder",
          objective: `Append the line '${scriptedLine}' to README.md.`,
          inputs: [`README.md ends with the line '${scriptedLine}'.`]
        },
        { to: "checker", objective: "Check the README change against its criterion.", inputs: [] }
      ]
    ))
  }
  if (system.includes("Deliver the scoped change in the task workspace")) {
    const result = done({ summary: "", commands: "" }, "Appended the line to README.md.")
    return `const edit = await ctx.call("bash", { command: "printf '${scriptedLine}\\\\n' >> /workspace/README.md && tail -n 1 /workspace/README.md" });
const result = ${JSON.stringify(result)};
result.fields.summary = "README.md now ends with: " + edit.stdout.trim();
result.fields.commands = "printf >> README.md: exit " + edit.exitCode;
ctx.done(JSON.stringify(result))`
  }
  if (system.includes("Independently decide whether a change meets")) {
    return answering(done({ verdict: "approve", findings: "none" }, "The README change meets its criterion."))
  }
  return answering({
    status: "declined",
    summary: "The scripted seat does not serve this role.",
    fields: {},
    evidence: [],
    handoffs: [],
    escalations: [],
    decisions: []
  })
}

const prepared: Route.PreparedRequest = {
  routeId: "organization/scripted",
  protocolId: "organization/scripted-v1",
  method: "POST",
  url: "http://127.0.0.1/organization/scripted",
  publicHeaders: { "content-type": "application/json" },
  body: new TextEncoder().encode("{}"),
  bodyText: "{}"
}
const route: FlowEngineLike.RouteResolver = { prepare: () => Effect.succeed(prepared) }

let cells = 0
const model = Model.make({
  stream: (request) =>
    Stream.suspend(() => {
      const id = `cell-${++cells}`
      const text = cellFor(request.system.map((part) => part.text).join("\n"))
      return Stream.fromIterable([
        ModelEvent.ModelEvent.TextStart({ type: "text-start", id }),
        ModelEvent.ModelEvent.TextDelta({ type: "text-delta", id, text: "```cell\n" + text + "\n```" }),
        ModelEvent.ModelEvent.TextEnd({ type: "text-end", id }),
        ModelEvent.ModelEvent.Settle({ type: "settle", stopReason: "stop" })
      ])
    })
})

/** Every seat, answered by the script. */
export const seats = SeatResolver.make({
  resolve: (id) =>
    Effect.succeed(Seat.make({ id, modelId: Seat.modelIdOf(id), model, route, contextWindowTokens: 200_000 }))
})

const [command, ...argv] = process.argv.slice(2)
if (command !== "serve") throw new Error("usage: scripted-host.ts serve --standalone <serve flags>")
const { values } = parseArgs({
  args: argv,
  options: {
    standalone: { type: "boolean", default: false },
    root: { type: "string" },
    "state-dir": { type: "string" },
    repo: { type: "string", multiple: true },
    check: { type: "string", multiple: true },
    "max-rounds": { type: "string" },
    host: { type: "string" },
    port: { type: "string" },
    "env-file": { type: "string" }
  }
})
if (!values.standalone) throw new Error("the scripted host serves --standalone only")
const environment = environmentOf(values, process.env, process.cwd())
const settings = await resolve(values, environment, process.cwd())
NodeRuntime.runMain(await start({
  settings,
  environment,
  platform,
  seats,
  // A Slack fixture serves Socket Mode over plaintext on loopback.
  allowPlaintextSocket: environment.SMITHERS_ORGANIZATION_SLACK_FIXTURE === "1"
}))
