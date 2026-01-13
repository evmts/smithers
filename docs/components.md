# Components

## `<Claude>`

The core component. Wraps Claude Code SDK.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `tools` | `Tool[]` | Tools to connect as MCP servers |
| `onFinished` | `(output: T) => void` | Called when Claude completes |
| `onError` | `(error: Error) => void` | Called on error |
| `...rest` | | Passed through to Claude Code SDK |

### Usage

```tsx
<Claude
  tools={[fileTool]}
  onFinished={(result) => console.log(result)}
>
  Analyze the codebase and summarize the architecture.
</Claude>
```

### Children

Children become the prompt. Can be:
- Plain text
- Markdown
- Nested JSX components
- Other `<Claude>` components (sub-agents)

## `<Phase>`

Defines a named phase in a multi-step plan.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Phase identifier |

### Usage

```tsx
<Phase name="research">
  <Claude>Gather information.</Claude>
</Phase>

<Phase name="write">
  <Claude>Draft the document.</Claude>
</Phase>
```

## `<Step>`

Defines an individual step within a phase.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `JSX.Element` | Step description |

### Usage

```tsx
<Phase name="implement">
  <Step>Read existing tests</Step>
  <Step>Write the new feature</Step>
  <Step>Update tests</Step>
</Phase>
```

## `<Persona>`

Sets the agent's persona/role.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `role` | `string` | The persona role |
| `children` | `JSX.Element` | Additional persona details |

### Usage

```tsx
<Persona role="senior engineer">
  You have 10 years of experience in distributed systems.
</Persona>
```

## `<Constraints>`

Defines constraints/rules for the agent.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `JSX.Element` | Constraint list |

### Usage

```tsx
<Constraints>
  - Keep responses under 100 words
  - Use only standard library functions
  - No external API calls
</Constraints>
```

## `<OutputFormat>`

Specifies expected output structure.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `schema` | `object` | JSON schema for output |
| `children` | `JSX.Element` | Human-readable format description |

### Usage

```tsx
<OutputFormat schema={{ type: 'object', properties: { summary: { type: 'string' } } }}>
  Return a JSON object with a "summary" field.
</OutputFormat>
```

## Composition

Components compose naturally:

```tsx
<Claude tools={[fileTool]}>
  <Persona role="code reviewer" />

  <Constraints>
    - Focus on security issues
    - Suggest fixes for each issue
  </Constraints>

  <Phase name="review">
    <Step>Read the diff</Step>
    <Step>Identify issues</Step>
    <Step>Write feedback</Step>
  </Phase>

  <OutputFormat>
    Return a list of issues with severity and suggested fixes.
  </OutputFormat>
</Claude>
```
