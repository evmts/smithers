# P1 fixture limits

These journeys assert PM D2–D7, not the clickable launch mock. Semantic region
names are accessibility contracts for subjects, not pinned visible copy.

| Row | Fixture limit | Existing boundary / place to extend |
| --- | --- | --- |
| D2 | Blame, history, branches/tags, releases, wiki and Smithers subjects are absent from the URL subject union. Settings must refuse signed-out access. | packages/rpc/src/RepositorySubjectPath.ts:41; apps/app/src/mainview/RepositorySubjectEntry.ts:33 |
| D3 | No repository blame response or commit-agent-trailer/run linkage in RepositoryRead. Do not manufacture wire fields. The chosen commit and run are fixture identifiers awaiting that contract. | packages/rpc/src/RepositoryRead.ts; apps/app/spec/worlds/default.ts |
| D4 | MonitorCard represents approval waits, but no repository run-list/answer transition is registered in spec readRoutes. No synthetic approval success is supplied. The first waiting item is asserted by ordinal; matching the three doors' underlying invocation remains unverified. Approvals are human-only (`apps/app/AGENTS.md:44`); the agent door may show the human control, never answer it. | packages/rpc/src/MonitorCard.ts:120; apps/app/spec/routes/reads.ts |
| D5 | Issue reads exist; Make TODO write/stack transition and TODO-filter response are not wired into this world. | apps/app/spec/routes/reads.ts; apps/app/src/mainview/cards/IssueCards.tsx |
| D6 | hosted=yes/no are requested world cases; defaultWorld has no existing RPC capability expressing hosted model connection availability, so both currently have the same wire world. Neither is evidence that the held/ready state is implemented. | apps/app/spec/worlds/default.ts; apps/app/src/mainview/cards/ModelCards.tsx |
| D7 | Empty, slow (750 ms), error, signed-out and denied variants exist at read transport. Slow can settle before observation; it does not prove a loading checkpoint. Status/alert assertions require state-specific reason text patterns without pinning draft prose. Ask uses the file context and Terminal its branch path. | apps/app/spec/boot.ts:57; apps/app/spec/routes/reads.ts; apps/app/spec/journeys/default/states.journey.ts |

`states.journey.ts` exports 80 zero-step `cells`; `settings-models.journey.ts`
exports two `modelCases`. Each default export is the complete case array.
`spec/p1.test.ts` runs the mock CLI over the complete collections; the manual
SPEC_P1_LIVE=1 run selects signed-out live reads and records member cases as
unverified. No journey steps branch on execution mode.

The CLI and player now expand all cases from each module. Models has stable
`settings-models-no` / `settings-models-yes` IDs; states use
`states-<view number>-<kind>` IDs. Receipts and labels cannot collide across cases.
The collection test invokes the mock CLI and counts 86 definitions / 124 checkpoints.
