---
"@smthrs/harness": minor
"@smthrs/agent": minor
---

Adds a `conversation` contract profile for agents that answer a person through
their catalog's flows, and `DoneText` for showing the answer while it streams.

- `CellTurn.Profile` is `"workspace" | "conversation"`. `CellTurn.teach` takes
  it as a fifth argument and `CellTurn.Input.profile` re-teaches it at each
  catalog refresh. `conversation` teaches the REPL and rules 1 to 6 byte for
  byte, without the bug-fix example, rules 7 to 9 or the history fact. The
  `workspace` contract, the default, is unchanged.
- `Agent.Options.profile` and `AgentAction.Options.profile` pass it through. A
  `conversation` run also leaves out the unpinned-tree fact and defaults
  `repeatCap` and `narrowingCap` to zero unless it sets them.
- `DoneText.project(reply)` returns the decoded prefix of the string or
  template literal passed to the last `ctx.done(` in a reply's cell blocks, or
  `Option.none()`.

```ts
const Respond = AgentAction.make("chat/Respond", {
  payload: { question: Schema.String },
  output: Schema.String,
  seat: "agent",
  profile: "conversation",
  prompt: ({ question }) => question
})
```
