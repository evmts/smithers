/** Placeholder copy for journey tests only; Will owns all shipping copy. */
export const placeholderRules = {
  version: 1,
  holdoutShare: 0.1,
  journeys: [
    {
      id: "no-repo",
      when: { signedIn: true, ownRepos: { max: 0 } },
      lead: [{ type: "text", text: "PLACEHOLDER: Bring your repository" }, {
        type: "action",
        flow: "repo.select",
        label: "PLACEHOLDER: Choose a repository"
      }],
      order: ["open-existing", "open", "create", "explore", "updates"],
      goal: "repos.import"
    },
    {
      id: "effeck-anon",
      when: { signedIn: false, source: ["effeck"] },
      lead: [{ type: "text", text: "PLACEHOLDER: Effeck runs on Smithers" }, {
        type: "links",
        links: [{ label: "PLACEHOLDER: Open Smithers", url: "https://smithers.sh/smithers/smithers/" }]
      }],
      order: ["open-existing", "explore", "open", "create", "updates"],
      goal: "repo.opened"
    },
    { id: "default", when: {}, lead: [], goal: "repo.opened" }
  ]
}
export const unknownCount = { state: "unknown" } as const
export const visitFacts = {
  signedIn: false,
  source: "direct" as const,
  arm: "treat" as const,
  ownRepos: unknownCount,
  coveredNotImported: unknownCount,
  activeRuns: unknownCount,
  modelConnections: unknownCount
}
/** One witness for each S catalog row. No visitor history is fabricated. */
export const catalogFixtures = [
  { row: 5, facts: { ...visitFacts, signedIn: true, ownRepos: { state: "known", value: 0 } } },
  { row: 9, facts: { ...visitFacts, source: "effeck" } },
  { row: 16, facts: visitFacts }
]
