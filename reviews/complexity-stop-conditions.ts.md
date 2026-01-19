# Complexity Review: src/components/agents/claude-cli/stop-conditions.ts

## File Path
[src/components/agents/claude-cli/stop-conditions.ts#L17-L55](file:///Users/williamcory/smithers/src/components/agents/claude-cli/stop-conditions.ts#L17-L55)

## Current Code

```typescript
for (const condition of conditions) {
  switch (condition.type) {
    case 'token_limit': {
      const totalTokens =
        (partialResult.tokensUsed?.input ?? 0) +
        (partialResult.tokensUsed?.output ?? 0)
      if (typeof condition.value === 'number' && totalTokens >= condition.value) {
        return {
          shouldStop: true,
          reason: condition.message ?? `Token limit ${condition.value} exceeded`,
        }
      }
      break
    }

    case 'time_limit': {
      if (
        typeof condition.value === 'number' &&
        (partialResult.durationMs ?? 0) >= condition.value
      ) {
        return {
          shouldStop: true,
          reason: condition.message ?? `Time limit ${condition.value}ms exceeded`,
        }
      }
      break
    }

    case 'turn_limit': {
      if (
        typeof condition.value === 'number' &&
        (partialResult.turnsUsed ?? 0) >= condition.value
      ) {
        return {
          shouldStop: true,
          reason: condition.message ?? `Turn limit ${condition.value} exceeded`,
        }
      }
      break
    }
    // ... more cases
  }
}
```

## Suggested Simplification

Use a **condition evaluator map**:

```typescript
type ConditionEvaluator = (
  condition: StopCondition,
  result: Partial<AgentResult>
) => { exceeded: boolean; defaultMessage: string }

const EVALUATORS: Record<string, ConditionEvaluator> = {
  token_limit: (c, r) => ({
    exceeded: (r.tokensUsed?.input ?? 0) + (r.tokensUsed?.output ?? 0) >= (c.value as number),
    defaultMessage: `Token limit ${c.value} exceeded`,
  }),
  time_limit: (c, r) => ({
    exceeded: (r.durationMs ?? 0) >= (c.value as number),
    defaultMessage: `Time limit ${c.value}ms exceeded`,
  }),
  turn_limit: (c, r) => ({
    exceeded: (r.turnsUsed ?? 0) >= (c.value as number),
    defaultMessage: `Turn limit ${c.value} exceeded`,
  }),
}

// Usage:
for (const condition of conditions) {
  const evaluator = EVALUATORS[condition.type]
  if (!evaluator) continue
  
  if (typeof condition.value !== 'number') continue
  
  const { exceeded, defaultMessage } = evaluator(condition, partialResult)
  if (exceeded) {
    return { shouldStop: true, reason: condition.message ?? defaultMessage }
  }
}

return { shouldStop: false }
```

## Benefits
- Eliminates switch statement
- Each condition type is independently testable
- Easy to add new condition types
- Common pattern (value type check, return structure) is centralized
