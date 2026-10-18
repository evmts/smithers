/*
 * The `repo` flows. One module per namespace: a lane that adds or edits a
 * flow here touches no other flow module, and Flows.ts registers each block in
 * the aggregator order.
 */
import { Schema } from "effect"
import { flow, RepoTarget, NoPayload } from "./Declare"
import type { FlowEntry, FlowRequirement, Namespace } from "../registry"
import type { CommandActions } from "./Declare"

/** The `repo` namespace row: the slash tree lists it in registry.ts NAMESPACES order. */
export const namespace: Namespace = { id: "repo", label: "Repository", summary: "Inspect and select repositories" }

/**
 * First run picks the starting repository itself, after identity answers. A
 * repository command typed inside that window waits for the choice and
 * resumes; it has no fulfilling flow, because there is nothing to ask.
 */
export const requirements: ReadonlyArray<FlowRequirement> = [
  {
    id: "first-run-target",
    satisfied: (state) => state.firstRunTargetPending !== true,
    reason: "Choosing your starting repository"
  }
]

/** The sidebar repository flows: select, unpin, tree. */
export const repoFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  flow({ name: "repo.overview", hidden: true, discloseToAgent: false, summary: "Show the repository update overview", args: "[owner/repo]", input: RepoTarget,
    requires: ["first-run-target", "repo-source"],
    handler: ({ repo }) => actions.showRepoOverview(repo) }),
  flow({ name: "repo.update", hidden: true, discloseToAgent: false, summary: "Read repository activity into context without displaying an overview", args: "[owner/repo]", input: RepoTarget,
    requires: ["first-run-target", "repo-source"],
    handler: ({ repo }) => actions.updateRepo(repo) }),
  /* The sidebar's pinned repositories (docs/LOCAL-APP.md "Tabs"). */
  flow({
    name: "repo.select", hidden: true, discloseToAgent: false,
    summary: "Make a pinned repository the active one",
    runtime: ["cloud"],
    agent: "never" as const,
    agentReason: "which pinned repository is active is the human's selection",
    args: "<repoKey>",
    input: Schema.Struct({ repo: Schema.String }),
    handler: ({ repo }) => actions.selectRepo(repo)
  }),]

/**
 * Recorded first-run doors now use the install Setup card, so they exist only
 * where this origin serves the install's setup routes: `runtime: ["install"]`
 * is that mount condition stated by the process that mounts it
 * (`features.install && !features.role.hosted()`,
 * packages/backend/internal/compose/bootstrap.go), the same row
 * `flows/DoorAvailability.ts` reads for the TODO family.
 *
 * Without it, a hosted origin ran the handler, which presented the Setup card
 * before asking whether an install answers here: `GET /api/install` replies
 * 404, `quietWithoutInstall` retires the notice without a word, and
 * `cards/SetupCard.tsx` renders nothing without a model — a card whose title
 * was its whole content. The card is now presented by the controller's own
 * `showSetup` (state/AppController.ts) over an install this page has actually
 * read, so a read that 404s, fails or is refused keeps its own honest answer
 * instead of an empty card.
 */
export const tutorialRepositoryFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  ...["repo.choose", "repo.create"].map(name => flow({
    name, hidden: true, discloseToAgent: false, minimumRole: "owner", actors: ["person"], agent: "never",
    agentReason: "Install setup requires the owner’s person session", summary: "Setup", input: NoPayload,
    runtime: ["install"],
    /* The doors that DO choose and add a repository where there is no install: the header's menu (`repo.select`) and `repos.import`. */
    absentHere: `/${name} is the install's own Setup, which this origin does not serve. Pick a repository in the repository menu, or run /repos.import owner/repo.`,
    grammar: () => ({ payload: {} }),
    handler: () => actions.showSetup()
  }))
]
