# Mintlify Documentation Setup

This directory contains the Smithers documentation, configured for [Mintlify](https://mintlify.com).

## Quick Start

### Install Mintlify CLI

```bash
npm install -g mintlify
```

### Run Development Server

```bash
# From the project root (mint.json must be in current directory)
mintlify dev
```

This will start a local server at `http://localhost:3000` with hot-reload.

## Project Structure

```
smithers/
├── mint.json                    # Mintlify configuration (at project root)
├── docs/
├── introduction.mdx             # Landing page
├── quickstart.mdx               # Getting started guide
├── concepts/                    # Core concepts
│   ├── ralph-wiggum-loop.mdx
│   ├── state-management.mdx
│   └── workflows.mdx
├── components/                  # Component reference
│   ├── claude.mdx
│   ├── subagent.mdx
│   └── ...
├── guides/                      # How-to guides
│   ├── mcp-integration.mdx
│   ├── testing.mdx
│   └── ...
├── api-reference/              # API documentation
│   ├── render-plan.mdx
│   ├── execute-plan.mdx
│   └── ...
├── cli/                        # CLI reference
│   ├── init.mdx
│   ├── plan.mdx
│   └── run.mdx
└── examples/                   # Code examples
    ├── hello-world.mdx
    ├── code-review.mdx
    └── ...
```

## Configuration

The `mint.json` file (located at the project root, not in docs/) configures:
- Site name, logo, and branding colors
- Navigation structure
- Tabs and anchors
- Analytics integration
- Social links

### Key Sections

- **navigation**: Defines sidebar structure
- **tabs**: Top-level navigation tabs
- **anchors**: Quick links in the header
- **colors**: Brand color scheme
- **analytics**: Google Analytics integration

## Writing Documentation

### MDX Format

All documentation uses MDX (Markdown + JSX):

```mdx
---
title: "Page Title"
description: "Page description for SEO"
---

# Heading

Regular markdown content.

<Card title="Callout" icon="lightbulb">
  Special component from Mintlify
</Card>
```

### Mintlify Components

Mintlify provides special components:

- `<Card>` - Highlighted cards
- `<CardGroup>` - Grid of cards
- `<CodeGroup>` - Tabbed code examples
- `<Tabs>` - Content tabs
- `<Accordion>` - Collapsible sections
- `<Note>`, `<Warning>`, `<Info>` - Callout boxes

See [Mintlify Components](https://mintlify.com/docs/content/components) for full list.

### Code Blocks

Use fenced code blocks with language identifiers:

````mdx
```tsx
import { Claude } from '@evmts/smithers'

export default function Agent() {
  return <Claude>Hello, world!</Claude>
}
```
````

## Deployment

Mintlify can be deployed in multiple ways:

### 1. Mintlify Hosting (Recommended)

Connect your GitHub repo to Mintlify:
1. Go to https://mintlify.com
2. Sign in with GitHub
3. Import the repository
4. Mintlify auto-deploys on push to main

### 2. Self-Hosted

Build static site:
```bash
mintlify build
```

This generates a static site in `.mintlify/` that can be hosted anywhere.

### 3. GitHub Pages

Add to `.github/workflows/docs.yml`:

```yaml
name: Deploy Docs

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'mint.json'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Mintlify
        run: npm install -g mintlify

      - name: Build docs
        run: mintlify build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./.mintlify
```

## Tips

### Auto-linking

Mintlify automatically creates links between pages:
- Link to other pages: `[Link Text](path/to/page)`
- No need for `.mdx` extension
- Relative paths work: `../concepts/workflows`

### Search

Mintlify provides built-in search across all documentation.

### Dark Mode

Dark mode is automatically supported. Provide dark/light logo variants in `mint.json`.

### Custom Domain

Configure custom domain in Mintlify dashboard or via CNAME file.

## Troubleshooting

### Port Already in Use

If port 3000 is taken:
```bash
mintlify dev --port 3001
```

### Changes Not Reflecting

1. Restart dev server
2. Clear browser cache
3. Check `mint.json` syntax with JSON validator

### Missing Page

1. Ensure page is listed in `navigation` in `mint.json`
2. Check file path matches navigation entry
3. Verify MDX frontmatter is valid

## Resources

- [Mintlify Documentation](https://mintlify.com/docs)
- [MDX Documentation](https://mdxjs.com/)
- [Component Examples](https://mintlify.com/docs/content/components)
