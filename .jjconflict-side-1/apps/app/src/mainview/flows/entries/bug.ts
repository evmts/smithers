/* The slash, failure-card and agent doors all open the same GitHub draft. */
import { Schema } from "effect"
import { flow, type CommandActions } from "./Declare"
import type { FlowEntry } from "../registry"
import { bugReportRepository, bugReportUrl } from "../../BugReport"

/** Reporting does not publish an issue or start work in Smithers. */
export const bugFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  flow({
    name: "bug.report", aliases: ["bug"], slash: "/bug", cli: null, http: null, journey: [],
    group: "Ask", visibility: "core", actors: ["person", "app_agent"], minimumRole: "member",
    summary: "Report a bug on GitHub", agent: "run",
    form: { fields: { failureCode: { hidden: true }, correlationId: { hidden: true } } },
    input: Schema.Struct({ failureCode: Schema.optional(Schema.String), correlationId: Schema.optional(Schema.String) }),
    handler: ({ failureCode, correlationId }) => {
      const bootstrap = actions.bootstrap
      const appSha = globalThis.document?.querySelector<HTMLMetaElement>('meta[name="smithers-build-sha"]')?.content
      globalThis.open(bugReportUrl({
        repository: bugReportRepository(),
        build: `${bootstrap?.version ?? "unknown"} ${appSha ?? bootstrap?.buildSha ?? "unknown"}`,
        pathname: globalThis.location?.pathname ?? "/",
        failureCode, correlationId
      }), "_blank", "noopener,noreferrer")
    }
  })
]
