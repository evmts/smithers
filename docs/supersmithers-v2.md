# SuperSmithers v2: CLI-Level God Agent

## Executive Summary

**What**: `smithers super <file>` - a CLI command that runs a god agent which spawns Smithers as a subprocess, monitors execution, rewrites TSX plan files, and restarts as needed.

**Why**: Simpler architecture than in-process rewriting. The god agent has full control over the process lifecycle and can observe/modify anything externally.

**How**: Claude (configurable) runs in a loop, spawning `smithers run <file>` as a subprocess, observing via SQLite/stdout/filesystem, rewriting TSX files, and restarting gracefully.

```
┌─────────────────────────────────────────────────────────────────┐
│                        GOD AGENT (Claude)                        │
│                                                                  │
│  Observes:                    Actions:                          │
│  - SQLite render frames       - Rewrite TSX files               │
│  - Agent outputs/errors       - Restart subprocess              │
│  - Process exit codes         - Modify SQLite state             │
│  - Filesystem changes         - Report Smithers bugs to GH      │
│                                                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ spawns/kills
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUBPROCESS: smithers run <file>               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  React Plan → Ralph Loop → Agent Execution → SQLite Store   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## CLI Interface

```bash
# Basic usage
smithers super workflow.tsx

# With options
smithers super workflow.tsx \
  --model opus \
  --max-restarts 10 \
  --restart-cooldown 30s \
  --db-path .smithers/data

# Resume existing execution
smithers super workflow.tsx --resume
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--model` | `sonnet` | Claude model for god agent (haiku/sonnet/opus) |
| `--max-restarts` | `10` | Max subprocess restarts before giving up |
| `--restart-cooldown` | `30s` | Min time between restarts |
| `--db-path` | `.smithers/data` | SQLite database path |

| `--report-bugs` | `true` | Report Smithers framework bugs to GitHub |
| `--dry-run` | `false` | Show what would happen without executing |

---

## God Agent Loop

```
┌──────────────────────────────────────────────────────────────────┐
│                        GOD AGENT LOOP                            │
│                                                                  │
│  1. Spawn subprocess: `smithers run <file>`                      │
│  2. Monitor loop:                                                │
│     - Poll SQLite for render frames, errors, metrics             │
│     - Tail subprocess stdout/stderr                              │
│     - Check process health (alive, exit code)                    │
│  3. On issue detection:                                          │
│     a. Analyze: Is this a plan bug or Smithers bug?              │
│     b. If plan bug: Rewrite TSX → graceful restart               │
│     c. If Smithers bug: Workaround → report to GitHub            │
│  4. On subprocess exit:                                          │
│     - If success: Done                                           │
│     - If failure: Analyze, fix, restart (if under max-restarts)  │
│  5. Loop until success or max-restarts exceeded                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Observation Methods

The god agent is not hardcoded to any observation method. Its system prompt explains available options:

### SQLite Queries

```sql
-- Recent render frames (React tree XML)
SELECT tree_xml, ralph_count, created_at 
FROM render_frames 
WHERE execution_id = ? 
ORDER BY sequence_number DESC LIMIT 10;

-- Agent errors
SELECT * FROM agents 
WHERE execution_id = ? AND status = 'error'
ORDER BY updated_at DESC;

-- Metrics
SELECT key, value FROM state WHERE key LIKE 'metrics.%';

-- Current execution state
SELECT * FROM executions WHERE id = ?;
```

### Process Observation

```bash
# Subprocess stdout/stderr captured to buffer
# Exit code available on termination
# Process alive check via pid
```

### Filesystem

```bash
# Watch for file changes in workspace
# Read TSX source files
# Check .smithers/ directory state
```

---

## TSX Rewriting

God agent can only modify `.tsx` files in the project. Constraints:

1. **Read original**: `cat workflow.tsx`
2. **Analyze issues**: Using SQLite data + stdout
3. **Generate fix**: Claude produces new TSX
4. **Validate**: Syntax check via `bun build --no-bundle`
5. **Write**: Overwrite TSX file
6. **Restart**: Graceful shutdown → fresh spawn

### Graceful Shutdown Sequence

```
1. Send SIGTERM to subprocess
2. Wait up to 5s for clean exit
3. If still running, SIGKILL
4. Wait for process termination
5. Spawn new subprocess with updated code
```

---

## Bug Detection & Reporting

### Classification

| Symptom | Classification | Action |
|---------|----------------|--------|
| Plan logic error (infinite loop, wrong phase order) | Plan bug | Rewrite TSX |
| Missing import, syntax error in plan | Plan bug | Rewrite TSX |
| Smithers component throws unexpected error | Smithers bug | Workaround + Report |
| SQLite corruption | Smithers bug | Workaround + Report |
| React reconciler crash | Smithers bug | Workaround + Report |
| CLI crash on valid input | Smithers bug | Workaround + Report |

### Bug Report Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     SMITHERS BUG DETECTED                        │
│                                                                  │
│  1. Attempt workaround in TSX (if possible)                      │
│  2. Check gh CLI: `gh auth status`                               │
│  3. If authenticated to evmts/smithers:                          │
│     a. Collect: error, stack trace, smithers version, TSX file   │
│     b. Create minimal repro if possible                          │
│     c. `gh issue create --repo evmts/smithers`                   │
│     d. Label: bug, supersmithers-reported                        │
│  4. Continue with workaround                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Issue Template

```markdown
## Bug Report (SuperSmithers Auto-Generated)

**Smithers Version**: {version}
**Environment**: {os, bun version}

### Error
```
{stack trace}
```

### Minimal Reproduction
```tsx
{minimal TSX that triggers bug}
```

### Context
- Execution ID: {id}
- Ralph count at failure: {count}
- Last render frame XML attached

### Workaround Applied
{description of workaround}

---
*This issue was automatically created by SuperSmithers god agent.*
```

---

## God Agent System Prompt

The prompt is structured for Claude CLI with clear sections and XML tags for parseability.

```markdown
<role>
SuperSmithers god agent. You monitor a Smithers orchestration subprocess, diagnose failures, rewrite TSX plan files to fix issues, and restart until success.
</role>

<context>
Plan file: {plan_file}
Database: {db_path}/smithers.db
Max restarts: {max_restarts}
Restart cooldown: {restart_cooldown}s
</context>

<subprocess_lifecycle>
START: `bun run smithers run {plan_file}`
MONITOR: Poll every 2-5s using strategies below
STOP: SIGTERM → wait 5s → SIGKILL if needed
RESTART: After rewriting TSX, start fresh subprocess
</subprocess_lifecycle>

<observation_strategies>
You choose how to observe. Use multiple strategies as needed.

1. SQLITE QUERIES (best for execution state)
   Database: {db_path}/smithers.db
   
   -- Current execution status
   SELECT * FROM executions ORDER BY started_at DESC LIMIT 1;
   
   -- Recent render frames (React tree XML)
   SELECT tree_xml, ralph_count, created_at 
   FROM render_frames WHERE execution_id = ?
   ORDER BY sequence_number DESC LIMIT 5;
   
   -- Agent status and errors
   SELECT id, task_id, status, error, output 
   FROM agents WHERE execution_id = ?
   ORDER BY updated_at DESC LIMIT 10;
   
   -- Key-value state
   SELECT key, value FROM state;

2. PROCESS OUTPUT (best for immediate errors)
   - stdout/stderr from subprocess
   - Exit code on termination

3. FILESYSTEM (best for code state)
   - Read TSX source: cat {plan_file}
   - Check smithers dir: ls -la .smithers/
</observation_strategies>

<diagnosis_rules>
When you detect a problem, classify it:

PLAN BUG (you fix by rewriting TSX):
- Logic errors: infinite loops, wrong phase order, missing conditions
- Syntax errors: import typos, JSX mistakes
- Runtime errors: undefined variables, type mismatches in plan code
- Agent prompt issues: unclear instructions, missing context

SMITHERS BUG (workaround + report to GitHub):
- Framework crashes on valid plan code
- SQLite corruption or schema errors
- React reconciler failures
- CLI crashes with valid arguments
- Components throw internal errors unrelated to plan

When uncertain, assume PLAN BUG first. Only classify as SMITHERS BUG if the error clearly originates in smithers-orchestrator internals.
</diagnosis_rules>

<rewrite_protocol>
1. READ current TSX: cat {plan_file}
2. ANALYZE using SQLite data + error messages
3. GENERATE fixed TSX preserving:
   - All imports
   - Component interface (props, exports)
   - Database/execution setup
4. VALIDATE: bun build {plan_file} --no-bundle (syntax check)
5. WRITE: Only if validation passes
6. RESTART: Kill subprocess gracefully, spawn fresh
</rewrite_protocol>

<bug_reporting>
Only for SMITHERS BUGS (not plan bugs):

1. First, attempt a workaround in the TSX
2. Check GitHub auth: gh auth status
3. If authenticated to evmts/smithers:
   
   gh issue create --repo evmts/smithers \
     --title "SuperSmithers: {brief description}" \
     --label "bug,supersmithers-reported" \
     --body "$(cat <<'EOF'
   ## Bug Report (SuperSmithers Auto-Generated)
   
   **Smithers Version**: {version}
   **Environment**: {os}, bun {bun_version}
   
   ### Error
   ```
   {stack_trace}
   ```
   
   ### Minimal Reproduction
   ```tsx
   {minimal_tsx}
   ```
   
   ### Workaround Applied
   {workaround_description}
   
   ---
   *Auto-generated by SuperSmithers god agent*
   EOF
   )"

4. Continue execution with workaround applied
</bug_reporting>

<constraints>
- ONLY modify .tsx files (never .ts, .js, .json, etc.)
- ALWAYS attempt graceful shutdown before SIGKILL
- RESPECT max_restarts limit: {max_restarts}
- WAIT restart_cooldown between restarts: {restart_cooldown}s
- For Smithers bugs: ALWAYS try workaround before reporting
- NEVER modify files in node_modules/ or smithers internals
</constraints>

<success_criteria>
1. Subprocess exits with code 0
2. Execution status in SQLite shows 'completed'
3. No unhandled errors in agent outputs
</success_criteria>

<failure_modes>
- MAX_RESTARTS: Exceeded {max_restarts} restarts → report final state, exit
- UNRECOVERABLE: Cannot workaround Smithers bug → report bug, exit
- MANUAL_STOP: User sends SIGINT → graceful shutdown, exit
</failure_modes>

<output_format>
As you work, emit status updates:

[SUPER] Starting subprocess: smithers run {plan_file}
[SUPER] Observing... (ralph_count: N, agents: M running)
[SUPER] Issue detected: {description}
[SUPER] Diagnosis: PLAN BUG | SMITHERS BUG
[SUPER] Rewriting {file}...
[SUPER] Restarting subprocess (attempt {n}/{max})
[SUPER] Success: Execution completed
[SUPER] Failed: {reason}
</output_format>
```

---

## Implementation Plan

### Phase 1: CLI Command

**Files:**
- `src/commands/super.ts` - Main command implementation
- `bin/cli.ts` - Add `super` subcommand

**Deliverables:**
- `smithers super <file>` spawns subprocess
- Basic process lifecycle (spawn, monitor, kill)
- Exit code handling

### Phase 2: God Agent Integration

**Files:**
- `src/supersmithers-cli/god-agent.ts` - God agent orchestrator
- `src/supersmithers-cli/prompts.ts` - System prompts
- `src/supersmithers-cli/tools.ts` - Custom tools for god agent

**Deliverables:**
- Claude integration (API or Claude Code CLI)
- Tool definitions (bash, read, write, sqlite)
- Observation loop

### Phase 3: Rewrite & Restart

**Files:**
- `src/supersmithers-cli/rewriter.ts` - TSX validation/writing
- `src/supersmithers-cli/process.ts` - Process management

**Deliverables:**
- TSX validation before write
- Graceful shutdown sequence
- Restart with cooldown

### Phase 4: Bug Reporting

**Files:**
- `src/supersmithers-cli/bug-reporter.ts` - GitHub integration

**Deliverables:**
- `gh` CLI detection and auth check
- Issue creation with template
- Minimal repro generation

---

## SQLite Schema Additions

No additional schema needed. The god agent uses existing tables:

- `executions` - Track subprocess execution status
- `render_frames` - Observe React tree state
- `agents` - Monitor agent status/errors
- `state` - Key-value execution state

The god agent itself doesn't persist state between `smithers super` runs. Each invocation is fresh.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent harness | Claude CLI | Uses user's existing auth, simpler integration |
| Observation | Sequential poll loop | Simple, predictable, sufficient for process monitoring |
| State persistence | None across `smithers super` restarts | Each run is a fresh instance, SQLite state from subprocess persists |

---

## Comparison: v1 vs v2

| Aspect | SuperSmithers v1 (in-process) | SuperSmithers v2 (CLI god agent) |
|--------|-------------------------------|----------------------------------|
| Architecture | Bun plugin + React component | External process wrapper |
| Rewrite scope | Single managed module | Any TSX file |
| Observation | React context + hooks | SQLite + stdout + filesystem |
| Restart | Hot reload via dynamic import | Full process restart |
| Complexity | High (plugin, branding, overlays) | Lower (just process management) |
| Isolation | Shared memory space | Full process isolation |
| Recovery | Limited by JS runtime state | Clean slate each restart |

v2 is simpler and more powerful because it operates at the process level rather than trying to hot-reload within a running React app.
