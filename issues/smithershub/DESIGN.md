# SmithersHub Design

## Design Philosophy

**Apple-style single focus.** One task, done well.

- Don't port desktop paradigms to mobile
- Clean, distraction-free primary view
- Power features accessible but not visible
- Challenge any product requirement that clutters the UX

**Build many small apps, not one big app.**

Each permission tier gets its own app:
- Admin app
- Maintainer app
- Contributor/Reader app

Apps may share components but are designed separately. UI is cheap to build—don't force one-size-fits-all.

## Visual Style

**Brutalist. Terminal aesthetic. Black and white.**

```
┌─────────────────────────────────────────────────────────────────┐
│  Background: #000 or #fff (dark/light mode)                     │
│  Text: inverse of background                                     │
│  Colors: ONLY when they convey information                      │
│  No decorative colors. No gradients. No shadows.                │
└─────────────────────────────────────────────────────────────────┘
```

### Color Usage (intentional only)
- Red: errors, destructive actions
- Green: success, additions
- Yellow: warnings, pending
- Blue: links, interactive elements
- Syntax highlighting in code blocks

### Typography
- Monospace everywhere
- Looks like Markdown rendered in terminal
- No custom fonts (system monospace)

## Layout

### Splash Page
- Static Astro page
- Explains what Smithers is (enhanced README)
- "Open App" button → SolidJS app

### Main App
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Focused View (Chat, Code, Frames, etc.)                        │
│  One thing at a time. Full screen.                              │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  [Input: Chat composer with slash command autocomplete]          │
├─────────────────────────────────────────────────────────────────┤
│  [Bottom Nav: Chat | Browse | More]                              │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation

**Mobile (primary):**
- Main view = chat, full screen
- Bottom nav: Chat | Browse | More
- View switcher as modal (Safari-style grid)
- Edge swipe between recent views

**Desktop:**
- Keyboard shortcuts available (tmux-style bindings)
- Same clean UI as mobile
- Power features via command palette, not always-visible chrome

**Context awareness:**
- Chat is aware of what you're browsing
- Multiple chats can exist, all share context

### Information Architecture

| Nav Item | Contains |
|----------|----------|
| Chat | Primary chat, slash command input |
| Browse | File tree, frames viewer, issues list |
| More | Settings, identity, notifications (maintainer inbox) |

### Maintainer Inbox (in "More")
- List of pending approvals
- Filter by: type (answer, issue, queue injection)
- Sort by: age, user tier
- Actions: Approve / Reject / Edit
- Bulk approve supported

### Chat Widget
- The primary UI — looks like ChatGPT landing page but minimal/brutalist
- Rich input with slash command autocomplete
- Vim mode by default
- Reference: Zig TUI from plue project

### Message Rendering
- All chat is Markdown (rendered as HTML)
- Code blocks: syntax highlighted, copyable
- Smithers can also render rich HTML using component library (skills)
- File links, images, interactive widgets all supported

### Code Viewer
- Monaco (read-only)
- Syntax highlighting
- LSP support (Zig, Rust, TypeScript)
- No editing — to change code, chat with Smithers

**Implementation constraints (lazy loading):**
1. Viewer first (syntax highlighting only)
2. Then LSP (on-demand)
3. Then Zig→WASM compile (on-demand)
- Fallback mode if WASM fails to load

### Frames Viewer

**MVP Acceptance Criteria:**
- View React tree at any tick
- Click into component (e.g., Claude) → see chat log
- Click further → see thinking, tool calls
- Scrub timeline forward/backward
- Deep-link to specific frame (shareable URL)

**Post-MVP:**
- Diff between two frames
- Search within tree
- Map frame to JJ changeset

## Mobile-First, Keyboard-First

**Mobile-first:** Responsive, touch-friendly, works on phones.

**Keyboard-first (desktop):** When keyboard is available:
- Vim bindings in editor/chat
- Tab switching (tmux-style)
- Command palette (`Ctrl+K` or `/`)
- No mouse required for core workflows

Both modes must work. Mobile users get touch, desktop users get keyboard shortcuts.

## Performance Requirements

### Bundle Size
- Astro static pages: minimal JS
- Chat widget: lazy load
- Monaco: lazy load, only when viewing code
- Target: <100KB initial JS

### Loading
- Splash page: instant (static HTML)
- App shell: <1s
- Chat ready: <2s
- Monaco ready: on-demand
- Zig WASM: on-demand

### Local-First = Snappy
- SQLite in browser (OPFS)
- Offline-capable for reading history
- User preferences stored locally
- Command search works offline
- Everything local feels instant

### LLM Responses = Slow
- Always assume LLM calls take time
- Non-blocking: user can keep navigating, browsing
- Pleasant loading states (streaming text, subtle animation)
- Never freeze the UI waiting for LLM
- Show partial results as they stream

### Theme
- Default: system preference (dark or light)
- Dark: black background, white text
- Light: white background, black text
- User can override

### Error Handling
- Handle each error case individually (no one-size-fits-all)
- No toasts (not accessible)
- Errors should be inline, contextual
- Goal: errors shouldn't happen (engineering responsibility)

### Accessibility
Follow best practices:
- Semantic HTML
- ARIA labels where needed
- Focus management
- Color contrast (black/white makes this easy)
- Reduced motion support
- Screen reader friendly

## Component Library

None. Raw CSS. Minimal classes.

```css
/* Example: the entire button style */
button {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--fg);
  padding: 0.25rem 0.5rem;
  font-family: monospace;
  cursor: pointer;
}
button:hover {
  background: var(--fg);
  color: var(--bg);
}
```

## Reference UIs
- ChatGPT (chat flow)
- T3 Chat (chat flow)
- Plue Zig TUI (terminal aesthetic, slash commands)
- GitHub CLI output (command results formatting)

## Two Zones: Chrome vs LLM Content

**App Chrome (our UI):**
- Brutalist, black/white
- No component libraries
- Plain and minimal

**LLM-Generated Content:**
- Can use shadcn, rich widgets, forms
- LLM invokes "skills" to render interactive UI
- Full creative freedom

The LLM can do whatever it wants inside the chat. The surrounding app stays stupid simple.

## Anti-Patterns (for app chrome)
- Rounded corners
- Box shadows
- Gradients
- Animations (except loading indicators)
- Custom fonts
- Colorful themes

(LLM content is exempt from these constraints)
