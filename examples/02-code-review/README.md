# Code Review Agent

A code review agent that uses tools to analyze code and returns structured JSON output.

## What This Example Shows

- Defining and using **Tools** with the Claude component
- Using **Constraints** to guide agent behavior
- Using **Phase** and **Step** for structured workflows
- Using **OutputFormat** for structured JSON responses
- Parsing and displaying structured agent output

## Key Components

### Tools

Tools give Claude the ability to interact with external systems:

```tsx
const fileSystemTool: Tool = {
  name: 'fileSystem',
  description: 'Read and write files in the repository',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'list'] },
      path: { type: 'string' },
    },
    required: ['action', 'path'],
  },
  execute: async (args) => {
    // Implementation
  },
}
```

Pass tools to Claude via the `tools` prop:

```tsx
<Claude tools={[fileSystemTool, grepTool]}>
  ...
</Claude>
```

### Constraints

Define rules and guidelines for the agent:

```tsx
<Constraints>
  - Focus on bugs and security issues
  - Always provide specific line numbers
  - Be constructive in feedback
</Constraints>
```

### Phases and Steps

Structure the agent's workflow:

```tsx
<Phase name="analysis">
  <Step>Read each changed file</Step>
  <Step>Search for vulnerability patterns</Step>
</Phase>
```

### OutputFormat

Specify the expected response format:

```tsx
<OutputFormat schema={reviewSchema}>
  Return your review as a JSON object with issues, summary, and recommendation.
</OutputFormat>
```

## Running

```bash
# Review current directory
bun run examples/02-code-review/agent.tsx

# Review a specific path
bun run examples/02-code-review/agent.tsx ./src/components
```

## Sample Output

```
--- Review Summary ---
The code is generally well-structured with good type safety.

Recommendation: request_changes

Issues found: 2

--- Issues ---

[HIGH] src/auth.ts:45
  Category: security
  Password stored in plain text without hashing
  Suggestion: Use bcrypt or argon2 to hash passwords before storage

[MEDIUM] src/api.ts:78
  Category: performance
  N+1 query pattern in user list endpoint
  Suggestion: Use a single query with JOINs instead of loop
```

## How Tools Work

When you pass tools to `<Claude>`, Smithers:

1. Registers each tool as an MCP (Model Context Protocol) server
2. The tool definitions become available to Claude during execution
3. Claude can invoke tools and receive their results
4. The `execute` function is called when Claude uses the tool

## Next Steps

See [03-research-pipeline](../03-research-pipeline/) to learn about multi-phase agents with state management.
