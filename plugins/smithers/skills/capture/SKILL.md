---
name: capture
description: Capture conversation content to reviews/, issues/, TODO.md, or Prompt.md with auto-classification
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
user-invocable: true
---

# /capture - Content Classification and Capture

Automatically classify and save conversation content to the appropriate location.

## When to Trigger

Invoke when user wants to:
- Save a code review
- Create an issue/feature request
- Add TODO items
- Save content to Prompt.md
- Capture important conversation context for later

**Keywords:** "capture", "save this", "add to", "record", "log this"

## Targets

| Target | Directory | Description |
|--------|-----------|-------------|
| review | `reviews/` | Code reviews of commits/changes |
| issue | `issues/` | Planned future features/enhancements |
| todo | `TODO.md` | Immediate action items (appended) |
| prompt | `Prompt.md` | Context/prompts for future sessions |

## Classification Algorithm

### Priority Order

1. **Prompt** (explicit): "put this in Prompt.md"
2. **Review**: commit hash + (issue|bug|broken) + file:line refs
3. **Issue**: "add feature", "implement", future tense, no commit refs
4. **TODO**: "must do", "fix now", checkbox patterns, urgent language

### Decision Flow

```
Content Analysis
      │
      ├── Explicit "Prompt.md" mention? ──────────────→ PROMPT
      │
      ├── Commit hash present?
      │     └── Yes + negative language ──────────────→ REVIEW
      │
      ├── Feature/implement keywords + no commits? ──→ ISSUE
      │
      ├── Urgent/checkbox/imperative patterns? ──────→ TODO
      │
      └── Default (confidence < 0.6) ─────────────────→ ASK USER
```

## Usage Patterns

### Pattern 1: Auto-classify

```bash
# User provides content, let classification decide
bun scripts/capture.ts "Commit abc1234 has a bug in auth.ts:45"
# → Classified as REVIEW (commit hash + bug + file ref)
```

### Pattern 2: Force type

```bash
# Override classification with explicit type
bun scripts/capture.ts --type issue "Add WebSocket support"
```

### Pattern 3: From conversation context

When the user says "capture this" or "save the above", extract relevant content from the conversation and run:

```bash
bun scripts/capture.ts "extracted content here"
```

### Pattern 4: With metadata

```bash
bun scripts/capture.ts --type review --commit abc1234 "Review content"
bun scripts/capture.ts --type todo --priority high "Fix auth bug"
bun scripts/capture.ts --type issue --title "WebSocket Support" "description..."
```

## Template Formats

### Review (`reviews/YYYYMMDD_HHMMSS_<hash>.md`)

```markdown
# Code Review for Commit [hash]

**Date:** YYYY-MM-DD HH:MM:SS
**Commit Message:** [message]

---

### Summary
[extracted summary]

### Issues Found
[extracted issues]

### Suggested Improvements
[extracted suggestions]
```

### Issue (`issues/<kebab-case-title>.md`)

```markdown
# [Title]

<metadata>
  <priority>critical|high|medium|low</priority>
  <category>feature|bugfix|enhancement</category>
  <status>draft</status>
</metadata>

---

## Executive Summary
[1-3 sentences]

## Problem Statement
[detailed problem]

## Proposed Solution
[solution design]

## Acceptance Criteria
- [ ] [criteria]
```

### TODO (appended to `TODO.md`)

Items appended under appropriate priority section (High/Medium/Low).

### Prompt (`Prompt.md`)

User formatting preserved. Create or append based on context.

## CLI Options

```
--type <review|issue|todo|prompt>  Force target type
--commit <hash>                    Associate with commit (for reviews)
--priority <high|medium|low>       Set priority (for TODO)
--title <title>                    Override title (for issues)
--stdin                            Read content from stdin
--dry-run                          Preview without writing
```

## Edge Cases

### Low Confidence (< 60%)

When classification confidence is low:
1. Report all scores with reasoning
2. Ask user: "Which type? (review/issue/todo/prompt)"
3. Use user's choice

### File Conflicts

- **Reviews/Issues:** Add counter suffix (`-1`, `-2`, etc.)
- **TODO.md:** Always append (never conflict)
- **Prompt.md:** Append if exists, create if not

### Missing Git Context

If not in git repo:
- Warn user
- Continue without commit context
- Use timestamp-based filenames for reviews

## Example Session

```
User: Capture this review - commit f691852 has poor commit hygiene...

Claude: I'll capture this as a code review.

[Runs: bun scripts/capture.ts --type review --commit f691852 "poor commit hygiene..."]

✅ Captured to reviews/20260118_143000_f691852.md

Classification: review (confidence: 92%)
Reasoning:
  - Commit hash detected: f691852
  - Negative language: "poor"

Preview:
────────────────────────────────────────────────────
# Code Review for Commit f691852

**Date:** 2026-01-18 14:30:00
**Commit Message:** test commit
...
────────────────────────────────────────────────────
```

## Implementation

Shared utilities: `src/utils/capture.ts`
Script: `scripts/capture.ts`

Functions:
- `classifyContent(ctx)` - Pattern matching and confidence scoring
- `generateReviewTemplate(content, meta)` - Review markdown
- `generateIssueTemplate(content, meta)` - Issue markdown
- `generateTodoItem(content, priority)` - TODO append logic
- `generatePromptMd(content)` - Prompt.md content
- `writeCapture(generated)` - File I/O
