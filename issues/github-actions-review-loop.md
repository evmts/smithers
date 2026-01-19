# GitHub Actions PR Review Loop

<metadata>
  <priority>high</priority>
  <category>dogfood</category>
  <estimated-effort>2-3 days</estimated-effort>
  <status>blocked</status>
  <dependencies>
    - src/components/Review/Review.tsx
    - src/components/Claude.tsx
    - src/components/agents/ClaudeCodeCLI.ts
    - .github/workflows/ci.yml
  </dependencies>
  <blocked-by>
    - issues/while-component.md (provides <While> for review-fix loop)
  </blocked-by>
</metadata>

---

## Executive Summary

Automated PR review loop triggered by GitHub Actions. When roninjin10 opens a PR:
1. Run CI checks (typecheck, lint, test)
2. Pass check logs + PR diff to a review agent
3. Agent reads git notes (original prompts) for context
4. Agent leaves blocking/non-blocking review via structured output
5. If blocking → fix → re-review loop until approved

---

<section name="architecture">

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Trigger                         │
│   on: pull_request (author: roninjin10)                             │
│   → bun run smithers review --pr $PR_NUMBER                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Smithers Orchestration                          │
│                                                                      │
│   <Phase name="CI Checks">                                           │
│     <Parallel>                                                       │
│       <CICheck name="typecheck" cmd="bun run typecheck" />           │
│       <CICheck name="lint" cmd="bun run lint" />                     │
│       <CICheck name="test" cmd="bun test" />                         │
│     </Parallel>                                                      │
│   </Phase>                                                           │
│                                                                      │
│   <While id="review-loop" condition={changesRequested}>              │
│     <Phase name="Review">                                            │
│       <FallbackAgent>                                                │
│         <Codex />  <Claude />  <Gemini />                            │
│       </FallbackAgent>                                               │
│     </Phase>                                                         │
│     <Phase name="Fix">...</Phase>                                    │
│   </While>                                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                      ┌──────────┴──────────┐
                      ▼                     ▼
               ┌──────────┐          ┌──────────────┐
               │ Approved │          │ Changes Req  │
               └──────────┘          └──────────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │  Fix Agent      │
                                   │  (in worktree)  │
                                   └─────────────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │  Push fixes     │
                                   │  → re-trigger   │
                                   └─────────────────┘
```

</section>

---

<section name="components">

## New Components

### 1. `<CICheck>` - Run CI Command and Store Results

Runs a shell command, captures output/exit code, stores in SQLite for review agent to query.

```tsx
interface CICheckProps {
  /** Unique name for this check */
  name: string
  /** Command to run */
  cmd: string
  /** Working directory (default: cwd) */
  cwd?: string
  /** Timeout in ms (default: 300000 = 5min) */
  timeout?: number
  /** Callback on completion */
  onFinished?: (result: CICheckResult) => void
}

interface CICheckResult {
  name: string
  passed: boolean
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}
```

**Implementation:**

```tsx
export function CICheck(props: CICheckProps): ReactNode {
  const { db } = useSmithers()
  const taskIdRef = useRef<string | null>(null)
  
  // Query result from DB
  const result = useQueryValue<CICheckResult>(
    db.db,
    "SELECT * FROM ci_checks WHERE name = ? AND execution_id = ?",
    [props.name, db.executionId]
  )
  
  useMount(() => {
    ;(async () => {
      taskIdRef.current = db.tasks.start('ci_check', props.name)
      const start = Date.now()
      
      try {
        const proc = Bun.spawn(['sh', '-c', props.cmd], {
          cwd: props.cwd,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        
        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()
        const exitCode = await proc.exited
        
        const checkResult: CICheckResult = {
          name: props.name,
          passed: exitCode === 0,
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - start,
        }
        
        // Store in SQLite
        db.db.run(`
          INSERT INTO ci_checks (execution_id, name, passed, exit_code, stdout, stderr, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [db.executionId, props.name, checkResult.passed, exitCode, stdout, stderr, checkResult.durationMs])
        
        props.onFinished?.(checkResult)
      } finally {
        db.tasks.complete(taskIdRef.current!)
      }
    })()
  })
  
  return (
    <ci-check
      name={props.name}
      status={result ? 'complete' : 'running'}
      passed={result?.passed}
      exit-code={result?.exitCode}
      duration-ms={result?.durationMs}
    />
  )
}
```

**Database Schema:**

```sql
CREATE TABLE ci_checks (
  id INTEGER PRIMARY KEY,
  execution_id TEXT NOT NULL,
  name TEXT NOT NULL,
  passed INTEGER NOT NULL,
  exit_code INTEGER NOT NULL,
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(execution_id, name)
);
```

**Usage in Review Loop:**

```tsx
<Phase name="CI Checks">
  <Parallel>
    <CICheck name="typecheck" cmd="bun run typecheck" />
    <CICheck name="lint" cmd="bun run lint" />
    <CICheck name="test" cmd="bun test" />
  </Parallel>
</Phase>
```

Review agent queries results:

```tsx
const ciResults = db.db.query(`
  SELECT name, passed, stdout, stderr 
  FROM ci_checks 
  WHERE execution_id = ?
`).all(executionId)

const failedChecks = ciResults.filter(c => !c.passed)
// Pass to review agent prompt
```

### 2. `<FallbackAgent>` - Multi-provider Failover

```tsx
interface FallbackAgentProps {
  children: ReactNode  // Agent components in priority order
  maxRetries?: number  // Retries per agent before failover
  onFallback?: (from: string, to: string, error: Error) => void
}

// Usage
<FallbackAgent maxRetries={2}>
  <Codex>{prompt}</Codex>
  <Claude model="sonnet">{prompt}</Claude>
  <Gemini model="2.5-pro">{prompt}</Gemini>
</FallbackAgent>
```

**Behavior:**
- Tries first child agent
- On error/timeout → log + try next child
- Propagates first successful result
- If all fail → aggregate error

### 3. `<Codex>` - OpenAI Codex CLI Agent

```tsx
interface CodexProps {
  children: ReactNode  // Prompt
  model?: string
  onFinished?: (result: AgentResult) => void
  onError?: (error: Error) => void
  // ... similar to ClaudeProps
}
```

**Implementation:**
- Wraps `codex` CLI (similar pattern to ClaudeCodeCLI.ts)
- Uses `OPENAI_API_KEY` from environment
- Structured output via JSON schema

### 4. `<Gemini>` - Google Gemini Agent

```tsx
interface GeminiProps {
  children: ReactNode
  model?: 'gemini-2.5-pro' | 'gemini-2.5-flash'
  onFinished?: (result: AgentResult) => void
  onError?: (error: Error) => void
}
```

**Implementation:**
- Uses Gemini API directly (Bun native fetch)
- Or wraps a CLI tool if available

### 5. Review-Fix Loop (uses `<While>`)

Uses the generic `<While>` component from [while-component.md](./while-component.md):

```tsx
// Usage - no custom ReviewLoop component needed
<While
  id="review-loop"
  condition={async () => {
    const review = await db.state.get('lastReview')
    return review?.decision === 'request_changes'
  }}
  maxIterations={3}
  onComplete={(n, reason) => {
    if (reason === 'condition') console.log('Approved!')
    else console.log('Max iterations reached')
  }}
>
  <Phase name="Review">
    <FallbackAgent>...</FallbackAgent>
  </Phase>
  <Phase name="Fix">
    <FallbackAgent>Fix issues from review</FallbackAgent>
  </Phase>
</While>
```

**State machine (handled by While):**
```
┌─────────┐     ┌──────────┐     ┌─────────┐
│ REVIEW  │────▶│ APPROVED │     │ BLOCKED │
└─────────┘     └──────────┘     └─────────┘
     │                                ▲
     │ changes_requested              │ max_iterations
     ▼                                │
┌─────────┐                           │
│   FIX   │───────────────────────────┘
└─────────┘
     │
     │ commit + push
     ▼
┌─────────┐
│ REVIEW  │ (loop via While)
└─────────┘
```

</section>

---

<section name="git-notes-integration">

## Git Notes Integration

### Reading Original Prompts

Commits made by smithers include git notes with the original prompt:

```sh
git notes show HEAD
# → "User prompt: Add feature X to the application"
```

**Review agent prompt injection:**

```tsx
async function getCommitContext(prNumber: string): Promise<string> {
  // Get all commits in PR
  const commits = await Bun.$`gh pr view ${prNumber} --json commits -q '.commits[].oid'`.text()
  
  const context: string[] = []
  for (const sha of commits.trim().split('\n')) {
    try {
      const note = await Bun.$`git notes show ${sha}`.text()
      context.push(`Commit ${sha.slice(0, 7)}: ${note}`)
    } catch {
      // No note for this commit
    }
  }
  
  return context.length > 0 
    ? `\n## Original Prompts\n${context.join('\n')}`
    : ''
}
```

### Prompt Template

```typescript
const reviewPrompt = `
You are reviewing PR #${prNumber} from ${author}.

## CI Results
${ciLogs}

## Git Notes (original prompts used to create these changes)
${gitNotesContext}

## PR Diff
${diff}

Review for:
1. Correctness relative to original intent (check git notes)
2. CI failures and how to fix them
3. Code quality, security, performance
4. Test coverage

Output JSON:
{
  "decision": "approve" | "request_changes",
  "blocking": boolean,
  "summary": "...",
  "issues": [...],
  "fix_instructions": "..." // only if request_changes
}
`
```

</section>

---

<section name="workflow">

## GitHub Actions Workflow

### `.github/workflows/smithers-review.yml`

CI checks run **inside Smithers** via `<CICheck>` components. GitHub Actions just triggers and provides secrets.

```yaml
name: Smithers Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    # Only run for roninjin10
    if: github.event.pull_request.user.login == 'roninjin10'
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git notes
          
      - name: Fetch git notes
        run: git fetch origin refs/notes/*:refs/notes/*
        
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
          
      - name: Install dependencies
        run: bun install --frozen-lockfile
          
      # Smithers runs CI checks internally via <CICheck> components
      - name: Smithers Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: bun run smithers review --pr $PR_NUMBER --max-iterations 3
```

**Why run CI inside Smithers?**
- Results stored in SQLite → queryable by review agent
- Parallel execution via `<Parallel>` component
- Unified observability (all in one DB)
- Easier to test Smithers itself

### CLI Entry Point

```typescript
// bin/smithers-review.ts
import { render } from '../src/reconciler'
import { 
  SmithersProvider, Phase, Parallel, While,
  CICheck, FallbackAgent, Codex, Claude, Gemini,
  Review
} from '../src'

const prNumber = process.env.PR_NUMBER!
const maxIterations = parseInt(process.argv.find(a => a.startsWith('--max-iterations='))?.split('=')[1] ?? '3')

function PRReviewOrchestration() {
  const { db } = useSmithers()
  
  // Build review prompt from CI results + git notes
  const buildReviewPrompt = async () => {
    const ciResults = db.db.query(`
      SELECT name, passed, stdout, stderr FROM ci_checks WHERE execution_id = ?
    `).all(db.executionId)
    
    const gitNotes = await getCommitNotes(prNumber)
    const diff = await Bun.$`gh pr diff ${prNumber}`.text()
    
    return `Review PR #${prNumber}
    
## CI Results
${ciResults.map(c => `${c.name}: ${c.passed ? 'PASS' : 'FAIL'}\n${c.passed ? '' : c.stderr}`).join('\n')}

## Git Notes (original prompts)
${gitNotes}

## Diff
${diff}
`
  }
  
  return (
    <>
      {/* Phase 1: Run CI checks in parallel */}
      <Phase name="CI Checks">
        <Parallel>
          <CICheck name="typecheck" cmd="bun run typecheck" />
          <CICheck name="lint" cmd="bun run lint" />
          <CICheck name="test" cmd="bun test" />
        </Parallel>
      </Phase>
      
      {/* Phase 2: Review loop */}
      <While
        id="review-loop"
        condition={async () => {
          const review = await db.state.get('lastReview')
          return review?.decision === 'request_changes'
        }}
        maxIterations={maxIterations}
      >
        <Phase name="Review">
          <FallbackAgent>
            <Codex schema={reviewSchema}>{buildReviewPrompt}</Codex>
            <Claude model="sonnet" schema={reviewSchema}>{buildReviewPrompt}</Claude>
            <Gemini schema={reviewSchema}>{buildReviewPrompt}</Gemini>
          </FallbackAgent>
        </Phase>
        
        <Phase name="Fix">
          <FallbackAgent>
            <Codex>Fix issues from review</Codex>
            <Claude model="sonnet">Fix issues from review</Claude>
          </FallbackAgent>
        </Phase>
      </While>
    </>
  )
}

await render(
  <SmithersProvider>
    <PRReviewOrchestration />
  </SmithersProvider>
)
```

</section>

---

<section name="structured-output">

## Structured Output Schema

```typescript
interface ReviewDecision {
  decision: 'approve' | 'request_changes'
  blocking: boolean
  summary: string
  issues: Array<{
    severity: 'critical' | 'major' | 'minor'
    file?: string
    line?: number
    message: string
    suggestion?: string
  }>
  fix_instructions?: string  // Present if decision === 'request_changes'
}

// JSON schema for agent
const reviewSchema = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['approve', 'request_changes'] },
    blocking: { type: 'boolean' },
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          message: { type: 'string' },
          suggestion: { type: 'string' }
        },
        required: ['severity', 'message']
      }
    },
    fix_instructions: { type: 'string' }
  },
  required: ['decision', 'blocking', 'summary', 'issues']
}
```

</section>

---

<section name="fix-phase">

## Fix Phase

When review requests changes:

```tsx
<Phase name="fix">
  <Worktree branch={`pr-${prNumber}-fixes`}>
    <FallbackAgent>
      <Codex>
        {`Fix the following issues from code review:
        
${reviewResult.fix_instructions}

Issues:
${reviewResult.issues.map(i => `- ${i.severity}: ${i.message}`).join('\n')}

After fixing:
1. Run: bun run typecheck && bun run lint && bun test
2. Commit with message: "fix: address review feedback"
3. Push to origin`}
      </Codex>
      <Claude model="sonnet">{/* same prompt */}</Claude>
      <Gemini>{/* same prompt */}</Gemini>
    </FallbackAgent>
  </Worktree>
</Phase>
```

**Push triggers new workflow run → loops until approved or max iterations.**

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Phase 1: CICheck Component + Schema
- [ ] Add `ci_checks` table to DB schema
- [ ] Create `src/components/CICheck.tsx`
- [ ] Run shell command via `Bun.spawn`
- [ ] Store stdout/stderr/exitCode in SQLite
- [ ] Unit tests with mock commands

### Phase 2: FallbackAgent Component
- [ ] Create `src/components/FallbackAgent.tsx`
- [ ] Implement child iteration with error handling
- [ ] Add `onFallback` callback for observability
- [ ] Unit tests with mocked agents

### Phase 3: Codex Agent
- [ ] Create `src/components/Codex.tsx`
- [ ] Implement codex CLI wrapper (similar to ClaudeCodeCLI.ts)
- [ ] Add structured output support
- [ ] Integration tests

### Phase 4: Gemini Agent  
- [ ] Create `src/components/Gemini.tsx`
- [ ] Implement Gemini API client (or CLI wrapper if available)
- [ ] Add structured output support
- [ ] Integration tests

### Phase 5: Git Notes Utility
- [ ] Create `src/utils/git-notes.ts`
- [ ] `getCommitNotes(prNumber)` - fetch notes for all PR commits
- [ ] Parse "User prompt: ..." format

### Phase 6: GitHub Actions Integration
- [ ] Create `.github/workflows/smithers-review.yml`
- [ ] Create `bin/smithers-review.ts` CLI entry
- [ ] Test with actual PR from roninjin10
- [ ] Document secrets required

### Phase 7: Polish
- [ ] Add GitHub PR comment posting
- [ ] Add review summary as PR status check
- [ ] Metrics/observability via db.vcs.addReport

</section>

---

<section name="files-to-create">

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/CICheck.tsx` | Run CI command, store results in SQLite |
| `src/components/FallbackAgent.tsx` | Multi-provider failover |
| `src/components/Codex.tsx` | OpenAI Codex CLI wrapper |
| `src/components/Gemini.tsx` | Google Gemini API wrapper |
| `src/utils/git-notes.ts` | Read/parse git notes from commits |
| `src/db/schema.ts` | Add `ci_checks` table |
| `.github/workflows/smithers-review.yml` | GH Actions workflow |
| `bin/smithers-review.ts` | CLI entry point |

</section>

---

<section name="open-questions">

## Open Questions

1. **Worktree reuse**: Should fix phase use existing PR branch or create new worktree?
   - Recommendation: Push directly to PR branch to trigger re-run

2. **Rate limiting**: How to handle API rate limits across providers?
   - Recommendation: Add backoff in FallbackAgent

3. **Cost tracking**: Should we track API costs per review?
   - Recommendation: Yes, add to db.vcs reports

4. **Notification**: Notify roninjin10 when review loop completes/fails?
   - Recommendation: GitHub PR comment + optional Slack

5. **Expand to other authors later?**
   - Recommendation: Start with roninjin10, add allowlist later

</section>

---

## Success Criteria

- [ ] PR from roninjin10 triggers automated review
- [ ] CI logs are passed to review agent
- [ ] Git notes (original prompts) are included in review context
- [ ] Review produces structured blocking/non-blocking decision
- [ ] Blocking issues trigger fix phase
- [ ] Fix phase commits and pushes, triggering re-review
- [ ] Loop terminates on approval or max iterations
- [ ] Fallback chain works: Codex → Claude → Gemini
