# Opening memory before the agent

Status: accepted implementation of AGENT-5 and Will's 2026-10-21 correction.

Recall durable records and the saved-flow skill catalog in a sealed action before
judging. Judge the frozen candidates through the existing Jev metered ModelStep,
then pass budgeted rows through AgentAction.memory. Include conversation history
when retrieving and judging. Separately sealing retrieval prevents changed live
records from re-keying a paid judgment after a crash.

The memory SDK owns source injection and selection; the app composes it. Wiki
memory and the maintainer concept wait for the future wiki feature, which will
supply another source. The browser engine injects its SQL client and serialized
writer; no filesystem source or second database is introduced.

`app/memory/remember` records device-local facts through the same public flow catalog
the agent uses. Its host-owned bank is enforced by SDK policy handlers; sign-out
wipes the engine database. Catalog outages are visible failures after bounded
durable retries, rather than silent empty catalogs. Shortlisting reserves slots
for both memory and skill candidates so a busy bank cannot starve skills.
