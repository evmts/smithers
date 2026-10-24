# 0093 — Agent reads shared TODO status

2026-10-23. Implements FLOW-3 and the production bug bash's false status answer.

The agent's device-local run list cannot establish whether a Cloud TODO has
started. `todo/inspect` therefore reads the current stack row through the same
repository role check as the person's stack view. It returns status, attempt,
failure code, run ID and update time; it omits the TODO's title, prompt and
person. A missing TODO has its own `todo_not_found` code only after repository
access succeeds. An unavailable or refused read never becomes “not started.”

The read is one bounded durable flow call. Its client and server record only
outcome, duration and finite error codes. A failing read gives the agent an
explicit failure to report rather than a fabricated status.

The status route belongs beside the stack's existing server role check, and
`todo/inspect` joins the existing TODO flow group. The plugin interface is
pending Will's review (PLUGIN-2); this existing registry placement is
superseded by: everything is a plugin (design pending). This change adds no
shell primitive or private plugin interface. Move this flow with the TODO
feature when that migration lands.

Library catalog: `@smthrs/flow` supplies the durable declaration and
`@smthrs/agent` invokes it through the shared model tool registry.
