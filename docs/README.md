# Smithers Documentation

Mintlify-powered documentation for the Smithers framework.

## Structure

```
docs/
├── mint.json                    # Mintlify configuration
├── introduction.mdx             # Getting started introduction
├── quickstart.mdx               # Quick start guide
│
├── concepts/                    # Core concepts
│   ├── ralph-wiggum-loop.mdx    # The execution model
│   └── state-management.mdx     # Zustand integration
│
├── components/                  # Component reference
│   ├── claude.mdx               # Claude component
│   ├── subagent.mdx             # Subagent component
│   ├── phase-step.mdx           # Phase and Step
│   └── prompt-structure.mdx     # Persona, Constraints, OutputFormat
│
├── cli/                         # CLI documentation
│   ├── run.mdx                  # smithers run command
│   ├── plan.mdx                 # smithers plan command
│   └── init.mdx                 # smithers init command
│
├── api-reference/               # API documentation
│   ├── render-plan.mdx          # renderPlan() function
│   ├── execute-plan.mdx         # executePlan() function
│   └── types.mdx                # TypeScript types
│
├── guides/                      # Advanced guides
│   ├── advanced-patterns.mdx    # Complex patterns
│   ├── debugging.mdx            # Debugging tips
│   └── migration.mdx            # Migration guide
│
└── examples/                    # Example walkthroughs
    ├── code-review.mdx          # Code review agent
    ├── multi-agent.mdx          # Multi-agent systems
    ├── data-pipeline.mdx        # Data processing
    └── ...more
```

## Development

### Local Preview

```bash
# Install Mintlify CLI
npm install -g mintlify

# Start local development server
cd docs
mintlify dev
```

### Building

```bash
# Check for issues
mintlify broken-links

# Validate configuration
mintlify check
```

## Configuration

The `mint.json` file controls:
- Navigation structure
- Theme colors
- Logo and branding
- External links
- Tab organization

## Writing Documentation

### MDX Format

All docs use MDX (Markdown + JSX):

```mdx
---
title: Component Name
description: Brief description
---

# Component Name

Introduction paragraph.

<Tabs>
  <Tab title="Basic">
    Basic example
  </Tab>
  <Tab title="Advanced">
    Advanced example
  </Tab>
</Tabs>

## Props

<ParamField name="prop" type="string" required>
  Description of the prop
</ParamField>
```

### Code Examples

Use fenced code blocks with language:

```mdx
```tsx
import { Claude } from 'smithers'

function Agent() {
  return <Claude>Hello</Claude>
}
```

### Callouts

```mdx
<Note>
  Important information
</Note>

<Warning>
  Critical warning
</Warning>

<Info>
  Helpful tip
</Info>
```

## Navigation

Update `mint.json` to add new pages:

```json
{
  "navigation": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "quickstart"]
    }
  ]
}
```

## Deployment

Documentation is auto-deployed via Mintlify when changes are pushed to main.

## Related Files

- `components.md` - Component reference (internal)
- `concepts.md` - Concepts overview (internal)
- `pludom-design.md` - Reconciler design notes
