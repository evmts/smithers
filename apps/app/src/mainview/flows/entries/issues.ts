/*
 * The `issues` flows. One module per namespace: a lane that adds or edits a
 * flow here touches no other flow module, and Flows.ts registers each block in
 * the aggregator order.
 */
import { Schema } from "effect"
import { issueFlows } from "./issue"
import { issueViewParts } from "../SlashPayload"
import { flag, line, text } from "@smthrs/ui/flow-form"
import { flow, NumberedTarget } from "./Declare"
import type { FlowEntry, Namespace } from "../registry"
import type { CommandActions } from "./Declare"

/** The `issues` namespace row: the slash tree lists it in registry.ts NAMESPACES order. */
export const namespace: Namespace = { id: "issues", label: "Issues", summary: "GitHub issues" }

// Confirmation buttons carry structured input so repository navigation and
// title/comment punctuation cannot reinterpret the approved action.
const issueWriteConfirmation = (actions: CommandActions) => ({
  preflight: (payload: { readonly repo?: string }) => {
    const target = actions.issueWriteTarget(payload.repo)
    return "error" in target ? target.error : undefined
  },
  confirmArgs: (payload: Record<string, unknown>) => {
    const target = actions.issueWriteTarget(typeof payload.repo === "string" ? payload.repo : undefined)
    return "repo" in target ? JSON.stringify({ ...payload, repo: target.repo }) : undefined
  }
})

/**
 * Which tracker an issue write addresses. A connected repository's GitHub
 * issues and its Smithers Cloud issues number independently, so a write that
 * named no tracker addressed the Cloud row for any number — the wrong object
 * whenever the act came off a GitHub-source card. Omitted, the seam routes by
 * the issue the act came off (IssuesSeam `writeSource`).
 */
const IssueSource = Schema.optional(Schema.Literals(["smithers-cloud", "github"]))

/** The `issues.*` flows: GitHub issues. */
export const issuesFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  ...issueFlows(actions),
  flow({
    name: "issues.list",
    summary: "List a repository's issues and conversations, only one kind, or a saved view",
    form: { args: payload => line(text(payload, "filter"), payload.kind === undefined || payload.kind === "all" ? undefined : flag(payload, "kind"), flag(payload, "view"), text(payload, "repo")) },
    // An install lists its repository's GitHub issues (GET /api/issues).
    runtimeAny: ["cloud", "install"],
    args: "[open|closed|all] [--kind conversation|issue] [--view <id>] [owner/repo]",
    requires: ["first-run-target", "repo-source"],
    input: Schema.Struct({
      filter: Schema.optional(Schema.Literals(["open", "closed", "all"])),
      kind: Schema.optional(Schema.Literals(["all", "conversation", "issue"])),
      view: Schema.optional(Schema.String),
      repo: Schema.optional(Schema.String)
    }),
    prepare: ({ filter, repo, kind, view }) => actions.listIssues.preload?.(filter ?? "open", repo, kind, view),
    handler: ({ filter, repo, kind, view }) => actions.listIssues(filter ?? "open", repo, kind, view)
  }),
  flow({
    name: "issues.view",
    summary: "Open an issue with its comments; use source github for GitHub rows",
    form: { partial: issueViewParts, args: payload => line(text(payload, "number"), text(payload, "repo"), flag(payload, "source")) },
    // An install opens its repository's GitHub issues (GET /api/issues/{n}).
    runtimeAny: ["cloud", "install"],
    args: "<number> [owner/repo] [--source github|smithers-cloud]",
    requires: ["repo-read"],
    input: Schema.Struct({
      ...NumberedTarget.fields,
      source: Schema.optional(Schema.Literals(["smithers-cloud", "github"]))
    }),
    prepare: ({ number, repo, source }) => actions.viewIssue.preload?.(number, repo, source),
    handler: ({ number, repo, source }) => actions.viewIssue(number, repo, source)
  }),
  flow({
    name: "issues.create",
    confirm: "create this issue",
    ...issueWriteConfirmation(actions),
    /*
     * Cloud issue rows are not the install's GitHub App issue identity. That
     * reads the HOST and no part of the payload, so it is `unavailable`, which
     * `Commands.settle` answers BEFORE the form asks for a title — an install
     * serves both `install` and `cloud` (`compose/bootstrap.go`), so this door
     * is registered here and a bare `/issues.create` used to collect a title
     * it could never send (`entries/subjects.ts` names the same bug on
     * `/issue.new`). The repository target's refusal reads `payload.repo` and
     * stays a `preflight`.
     */
    unavailable: () => actions.bootstrap?.capabilities.includes("install") ? "Use /issue.new on this install." : undefined,
    form: { fields: { repo: { optionsFrom: "cloud-repos", kind: "text" } }, args: payload => line(text(payload, "title"), text(payload, "repo"), flag(payload, "kind"), flag(payload, "source")) },
    summary: "Create an issue, or a private conversation with --kind conversation",
    runtime: ["cloud"],
    args: "<title> [owner/repo] [--kind conversation] [--source github|smithers-cloud]",
    requires: ["signed-in"],
    input: Schema.Struct({ title: Schema.String, repo: Schema.optional(Schema.String), kind: Schema.optional(Schema.Literals(["issue", "conversation"])), source: IssueSource }),
    handler: ({ title, repo, kind, source }) => actions.createIssue(title, repo, kind === "conversation" ? "chat" : kind, source)
  }),
  flow({
    name: "issues.close",
    confirm: "close this issue",
    ...issueWriteConfirmation(actions),
    summary: "Close an issue",
    /* The tracker rides the line as a flag, exactly as issues.view carries it. */
    form: { args: payload => line(text(payload, "number"), text(payload, "repo"), flag(payload, "source")) },
    runtimeAny: ["cloud"],
    args: "<number> [owner/repo] [--source github|smithers-cloud]",
    requires: ["repo-read"],
    input: Schema.Struct({ ...NumberedTarget.fields, source: IssueSource }),
    handler: ({ number, repo, source }) => actions.setIssueState(number, "closed", repo, source)
  }),
  flow({
    name: "issues.reopen",
    confirm: "reopen this issue",
    ...issueWriteConfirmation(actions),
    summary: "Reopen a closed issue",
    form: { args: payload => line(text(payload, "number"), text(payload, "repo"), flag(payload, "source")) },
    runtimeAny: ["cloud"],
    args: "<number> [owner/repo] [--source github|smithers-cloud]",
    requires: ["repo-read"],
    input: Schema.Struct({ ...NumberedTarget.fields, source: IssueSource }),
    handler: ({ number, repo, source }) => actions.setIssueState(number, "open", repo, source)
  }),
  flow({
    name: "issues.comment",
    confirm: "post this comment",
    ...issueWriteConfirmation(actions),
    /*
     * `--source` is read off the END of the line (SlashPayload
     * splitIssueSource), so the comment text keeps its own spacing,
     * newlines and fences. A card's composer submits the JSON object
     * instead (FlowArgs), which needs no splitting at all.
     */
    form: { fields: { repo: { optionsFrom: "cloud-repos", kind: "text" } }, args: payload => line(text(payload, "number"), text(payload, "text"), text(payload, "repo"), flag(payload, "source")) },
    summary: "Comment on an issue",
    runtimeAny: ["cloud"],
    args: "<number> <text> [owner/repo] [--source github|smithers-cloud]",
    requires: ["repo-read"],
    input: Schema.Struct({
      number: Schema.Number,
      text: Schema.String,
      repo: Schema.optional(Schema.String),
      source: IssueSource
    }),
    handler: ({ number, text, repo, source }) => actions.commentOnIssue(number, text, repo, undefined, source)
  })
]

