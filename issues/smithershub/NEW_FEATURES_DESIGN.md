# New Smithers Features Design

These features must be designed and implemented before the SmithersHub workflow can run.

---

## 1. Agent-as-Tool-Call

**Problem:** Need to invoke Gemini/Claude/Codex as tool calls from within an agent.

**Requirements:**
- Agent can call another agent as a tool
- Pass prompt, receive structured response
- Support all three: Gemini, Claude, Codex
- Not CLI-based, native tool call

**Proposed API:**
```tsx
<Claude>
  {/* Claude can invoke Gemini via tool */}
  Use the invoke_agent tool to call Gemini for CSS work.
</Claude>
```

**Tool Definition:**
```typescript
{
  name: "invoke_agent",
  input: {
    agent: "gemini" | "claude" | "codex",
    prompt: string,
    context?: string[],  // files to include
  },
  output: {
    response: string,
    structured?: unknown,
  }
}
```

**Design Questions:**
- How does the inner agent get Smithers context?
- Does inner agent have tool access?
- How do we handle nested agent calls?
- Token/cost tracking across agents?

---

## 2. JJ Snapshot on Tool Calls

**Problem:** Every file change Claude makes should be JJ-snapshotted.

**Requirements:**
- Wrap Claude component with JJ integration
- After every tool call that modifies files, create JJ snapshot
- Snapshots are automatic, not agent-triggered
- Enable time-travel debugging

**Proposed API:**
```tsx
<JJWrapper>
  <Claude>Do something</Claude>
</JJWrapper>
```

Or built into Claude component:
```tsx
<Claude jjSnapshot={true}>
  Do something
</Claude>
```

**Implementation:**
- Hook into tool call lifecycle
- After `edit_file`, `create_file`, `Bash` (with file writes) → JJ snapshot
- Store mapping: tool_call_id → jj_change_id

**Design Questions:**
- Snapshot after every tool call, or batch?
- How to name/tag snapshots?
- Performance impact of frequent snapshots?
- How to expose snapshots in frames viewer?

---

## 3. Dynamic Phases via XML

**Problem:** Hardcoded phases/steps limit agent autonomy. Agent should decide flow.

**Requirements:**
- Pass available phases/steps as XML context
- Agent returns structured response to transition
- No `<Phase>` or `<Step>` components in script
- Agent-driven flow control

**Proposed API:**

Instead of:
```tsx
<Phase name="implement">
  <Step name="code">...</Step>
</Phase>
```

Do:
```tsx
<DynamicFlow 
  phases={["plan", "implement", "review", "commit"]}
  agent={<Claude />}
  onTransition={(from, to, reason) => log(from, to, reason)}
/>
```

**Structured Response:**
```typescript
{
  action: "transition",
  from_phase: "plan",
  to_phase: "implement",
  reason: "Planning complete, ready to code",
  next_prompt?: string,
}
```

**Design Questions:**
- How does agent know available phases?
- Can agent create new phases dynamically?
- How to handle invalid transitions?
- How to visualize in frames viewer?

---

## 4. Clean Repo Check

**Problem:** After commit, verify repo is clean before continuing.

**Requirements:**
- After every commit, check `jj status` or `git status`
- If not clean, fail loudly
- Hardcoded check (not agent-controlled)

**Proposed API:**
```tsx
<CommitAndVerify message="feat: add feature">
  <Claude>Implement feature</Claude>
</CommitAndVerify>
```

Or as a hook:
```tsx
const { commit } = useJJ();
await commit("feat: add feature");
// Automatically verified
```

**Implementation:**
- Run `jj status` after commit
- Parse output, fail if working copy has changes
- Provide clear error message

---

## 5. Round-Robin Executor

**Problem:** Alternate between Codex and Claude for fairness and diversity.

**Requirements:**
- Configurable agent list
- Alternate on each iteration
- Track which agent is next
- Persist across restarts (SQLite)

**Proposed API:**
```tsx
<RoundRobin agents={["codex", "claude"]} timeout={10000}>
  {(agent) => (
    <Agent type={agent}>
      Implement the next task
    </Agent>
  )}
</RoundRobin>
```

Or:
```tsx
const agent = useRoundRobin(["codex", "claude"]);
return <Agent type={agent}>...</Agent>;
```

**State:**
```sql
CREATE TABLE round_robin (
  id TEXT PRIMARY KEY,
  current_index INTEGER,
  agents TEXT -- JSON array
);
```

---

## 6. Iteration Timeout

**Problem:** Throttle Ralph loop to avoid runaway costs.

**Requirements:**
- Configurable timeout between iterations
- Default 10 seconds
- Simple delay, not complex rate limiting

**Proposed API:**
```tsx
<SmithersProvider iterationTimeout={10000}>
  ...
</SmithersProvider>
```

**Implementation:**
- After each render cycle completes, wait `iterationTimeout` ms
- Simple `await sleep(timeout)` in Ralph loop

---

## Implementation Priority

1. **Iteration Timeout** — Simplest, enables safe testing
2. **Clean Repo Check** — Safety mechanism
3. **Round-Robin Executor** — Core loop requirement
4. **Agent-as-Tool-Call** — Enables delegation
5. **JJ Snapshot on Tool Calls** — Enables debugging
6. **Dynamic Phases via XML** — Most complex, do last

## Next Steps

For each feature:
1. Write unit tests
2. Write integration tests
3. Implement
4. Write E2E Playwright test
5. Review
6. Commit
