# Rate-Limited Batch Processing Example

This example demonstrates processing large batches of items with rate limiting and usage tracking using ClaudeProvider.

## What It Does

1. Loads many items from files or directories
2. Processes each item with Claude in parallel
3. Enforces rate limits (requests/tokens per minute)
4. Tracks usage and costs
5. Writes results to JSON

## Key Concepts

### ClaudeProvider Component

Wraps multiple Claude components with shared configuration:

```tsx
<ClaudeProvider
  rateLimit={{
    requestsPerMinute: 50,
    tokensPerMinute: 50_000,
  }}
  usageLimit={{
    maxCost: 1.0,
    maxTokens: 100_000,
  }}
>
  {items.map(item => (
    <Claude key={item}>Process {item}</Claude>
  ))}
</ClaudeProvider>
```

### Rate Limiting

Prevents API quota exhaustion:

- **Token Bucket Algorithm** - Smooth rate limiting
- **Automatic Backoff** - Waits when limit reached
- **Configurable Limits** - Set per API tier

### Usage Tracking

Monitor costs in real-time:

```tsx
<ClaudeProvider
  onUsageUpdate={(stats) => {
    console.log(`Cost so far: $${stats.totalCost}`)
  }}
>
```

## Usage

### Process Text Files

```bash
bun run examples/11-rate-limited-batch/agent.tsx ./items.txt ./results
```

Where `items.txt` contains one item per line:

```
Analyze sentiment of user feedback
Summarize meeting notes
Extract key points from article
...
```

### Process Directory of Files

```bash
bun run examples/11-rate-limited-batch/agent.tsx ./documents ./results
```

Processes all `.md` and `.txt` files in `./documents/`.

## Example Output

```
📦 Rate-Limited Batch Processing
  Input: ./items.txt
  Output: ./results

  Items: 100

  Progress: 23% (23/100)
⏳ Rate limited (requestsPerMinute), waiting 1200ms...
  Progress: 54% (54/100)
⏳ Rate limited (tokensPerMinute), waiting 3400ms...
  Progress: 100% (100/100)

✅ Batch Processing Complete
  Time: 45.3s
  Processed: 100/100 items
  Input tokens: 25,430
  Output tokens: 12,850
  Total cost: $0.2689

Results written to: ./results/results.json
```

## Rate Limit Configuration

### API Tier Limits

Configure based on your Anthropic API tier:

**Tier 1 (Default)**
```typescript
rateLimit={{
  requestsPerMinute: 50,
  tokensPerMinute: 50_000,
}}
```

**Tier 2**
```typescript
rateLimit={{
  requestsPerMinute: 1_000,
  tokensPerMinute: 100_000,
}}
```

**Tier 3**
```typescript
rateLimit={{
  requestsPerMinute: 2_000,
  tokensPerMinute: 200_000,
}}
```

**Tier 4**
```typescript
rateLimit={{
  requestsPerMinute: 4_000,
  tokensPerMinute: 400_000,
}}
```

See [Anthropic API Rate Limits](https://docs.anthropic.com/en/api/rate-limits).

### Budget Limits

Prevent unexpected costs:

```typescript
usageLimit={{
  maxCost: 10.0,           // Stop after $10
  maxTokens: 1_000_000,    // Stop after 1M tokens
  maxRequests: 1000,       // Stop after 1000 requests
}}
```

## Advanced Patterns

### Chunked Processing

Process in smaller batches:

```tsx
function ChunkedBatch({ items, chunkSize = 10 }) {
  return (
    <>
      {chunk(items, chunkSize).map((chunk, i) => (
        <Phase key={i} name={`batch-${i}`}>
          <ClaudeProvider rateLimit={{...}}>
            {chunk.map(item => (
              <Claude key={item}>Process {item}</Claude>
            ))}
          </ClaudeProvider>
        </Phase>
      ))}
    </>
  )
}
```

### Priority Processing

Process high-priority items first:

```tsx
const prioritized = items.sort((a, b) => b.priority - a.priority)

<ClaudeProvider>
  {prioritized.map(item => (
    <Claude key={item.id}>Process {item.content}</Claude>
  ))}
</ClaudeProvider>
```

### Error Recovery

Retry failed items:

```tsx
<Claude
  onError={(error) => {
    console.error(`Failed: ${item}`)
    failedItems.push(item)
  }}
>
  Process {item}
</Claude>

// Later, retry failed items
{failedItems.length > 0 && (
  <Phase name="retry">
    {failedItems.map(item => (
      <Claude key={item}>Retry {item}</Claude>
    ))}
  </Phase>
)}
```

### Progress Dashboard

Real-time progress monitoring:

```tsx
<ClaudeProvider
  onUsageUpdate={(stats) => {
    const progress = {
      percent: (stats.totalRequests / items.length) * 100,
      cost: stats.totalCost,
      tokensUsed: stats.inputTokens + stats.outputTokens,
      avgLatency: stats.averageLatency,
    }

    updateDashboard(progress)
  }}
>
```

## Cost Estimation

Before processing, estimate costs:

```typescript
const estimatedCost = items.reduce((total, item) => {
  // Assume ~100 tokens input, ~200 tokens output per item
  const inputCost = (100 * 3) / 1_000_000  // $3 per 1M input tokens
  const outputCost = (200 * 15) / 1_000_000  // $15 per 1M output tokens
  return total + inputCost + outputCost
}, 0)

console.log(`Estimated cost: $${estimatedCost.toFixed(2)}`)

if (estimatedCost > budget) {
  console.error('Cost exceeds budget!')
  process.exit(1)
}
```

## Performance Optimization

### 1. Batch Size

Smaller batches = more predictable, but slower:

```typescript
// Fast but may hit rate limits
<ClaudeProvider>{items.map(...)}</ClaudeProvider>

// Slower but more controlled
{chunks.map(chunk => (
  <Phase>
    <ClaudeProvider>{chunk.map(...)}</ClaudeProvider>
  </Phase>
))}
```

### 2. Model Selection

Use smaller models for simple tasks:

```tsx
<Claude model="claude-haiku-4-20250514">  {/* Faster, cheaper */}
  Simple classification task
</Claude>

<Claude model="claude-sonnet-4-20250514">  {/* Balanced */}
  General analysis
</Claude>

<Claude model="claude-opus-4-20251101">  {/* Slower, expensive */}
  Complex reasoning required
</Claude>
```

### 3. Token Optimization

Reduce input tokens:

```tsx
<Claude maxTokens={500}>  {/* Limit output */}
  {item.slice(0, 1000)}  {/* Truncate input */}

  Provide a brief summary (max 2 sentences).
</Claude>
```

### 4. Caching

Cache results for duplicate items:

```typescript
const cache = new Map<string, string>()

const processItem = (item: string) => {
  if (cache.has(item)) {
    return cache.get(item)
  }

  // ... process with Claude ...
  cache.set(item, result)
  return result
}
```

## Troubleshooting

### Rate Limit Errors

If you see "Rate limit exceeded" errors:

1. Check your API tier limits
2. Reduce `requestsPerMinute` and `tokensPerMinute`
3. Add delays between batches

### Out of Budget

If processing stops due to budget:

1. Increase `maxCost` limit
2. Use cheaper model (Haiku vs Sonnet)
3. Reduce `maxTokens` per request
4. Optimize prompts to be more concise

### Slow Processing

If processing is too slow:

1. Increase rate limits (if your tier allows)
2. Process in larger batches
3. Use parallel Subagents for independent work
4. Consider using Haiku model for faster response

## Related Examples

- [04-parallel-research](../04-parallel-research) - Parallel execution
- [06-file-processor](../06-file-processor) - File transformation pipeline
- [09-parallel-worktrees](../09-parallel-worktrees) - Isolated parallel work

## Related Documentation

- [ClaudeProvider Component](../../docs/components/claude-provider.mdx)
- [Rate Limiting Guide](../../docs/guides/rate-limiting.mdx)
- [Usage Tracking](../../docs/api-reference/usage-tracker.mdx)
