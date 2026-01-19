# Complexity Review: src/utils/capture.ts

## File Path
[src/utils/capture.ts#L149-L165](file:///Users/williamcory/smithers/src/utils/capture.ts#L149-L165)

## Current Code

```typescript
// Build reasoning
if (maxType === 'review') {
  if (PATTERNS.review.commitHash.test(content)) reasoning.push('Commit hash detected in content')
  if (PATTERNS.review.fileRefs.test(content)) reasoning.push('File:line references found')
  if (PATTERNS.review.negativeWords.test(content)) reasoning.push('Negative/bug language present')
} else if (maxType === 'issue') {
  if (PATTERNS.issue.futureVerbs.test(content)) reasoning.push('Future-tense verbs detected')
  if (PATTERNS.issue.featureWords.test(content)) reasoning.push('Feature/enhancement language')
  if (!PATTERNS.review.commitHash.test(content)) reasoning.push('No commit references')
} else if (maxType === 'todo') {
  if (PATTERNS.todo.checkbox.test(content)) reasoning.push('Checkbox pattern detected')
  if (PATTERNS.todo.urgentWords.test(content)) reasoning.push('Urgent language present')
  if (PATTERNS.todo.imperative.test(content)) reasoning.push('Imperative mood detected')
} else if (maxType === 'prompt') {
  reasoning.push('Explicit Prompt.md request detected')
}
```

## Suggested Simplification

Use a **reasoning rules map**:

```typescript
type ReasoningRule = { pattern: RegExp | null; message: string; negate?: boolean }

const REASONING_RULES: Record<CaptureType, ReasoningRule[]> = {
  review: [
    { pattern: PATTERNS.review.commitHash, message: 'Commit hash detected in content' },
    { pattern: PATTERNS.review.fileRefs, message: 'File:line references found' },
    { pattern: PATTERNS.review.negativeWords, message: 'Negative/bug language present' },
  ],
  issue: [
    { pattern: PATTERNS.issue.futureVerbs, message: 'Future-tense verbs detected' },
    { pattern: PATTERNS.issue.featureWords, message: 'Feature/enhancement language' },
    { pattern: PATTERNS.review.commitHash, message: 'No commit references', negate: true },
  ],
  todo: [
    { pattern: PATTERNS.todo.checkbox, message: 'Checkbox pattern detected' },
    { pattern: PATTERNS.todo.urgentWords, message: 'Urgent language present' },
    { pattern: PATTERNS.todo.imperative, message: 'Imperative mood detected' },
  ],
  prompt: [
    { pattern: null, message: 'Explicit Prompt.md request detected' },
  ],
}

// Usage:
const rules = REASONING_RULES[maxType] ?? []
for (const rule of rules) {
  if (rule.pattern === null) {
    reasoning.push(rule.message)
  } else {
    const matches = rule.pattern.test(content)
    if (rule.negate ? !matches : matches) {
      reasoning.push(rule.message)
    }
  }
}
```

## Benefits
- Declarative reasoning configuration
- All rules for each type visible at a glance
- Easy to add new capture types or rules
- DRY - pattern test logic is centralized
