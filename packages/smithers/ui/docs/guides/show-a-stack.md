---
title: "Show a stack"
description: "List a repository's TODOs with StackList, show one TODO with TodoCard, and let a person edit and commit a private draft with TodoDraftCard: numbers, pending chips, Drop's inline confirm and the keyboard."
---

A repository's stack is its TODOs in merge order. Three components draw it:

- `StackList` lists the TODOs, one row each, with a Drop button on each row a
  person may drop.
- `TodoCard` shows one TODO at full size: its prompt, acceptance criteria and
  Drop.
- `TodoDraftCard` is a private draft that a person edits and commits.

All three are controlled. The host reads the TODOs and owns every value and
write; the components fetch nothing and keep no text of their own.

```tsx
import { Button, StackList, TodoCard, TodoDraftCard } from "@smthrs/ui"

<StackList
  repo="octocat/hello"
  todos={todos}
  selected={openId}
  href={(todo) => (todo.number === null ? undefined : `/octocat/hello/stack/${todo.number}`)}
  onNavigate={(todo, href) => router.navigate({ to: href })}
  onDrop={(todo) => drop(todo.number)}
  loading={!synced}
  actions={<Button onClick={newTodo}>New TODO</Button>}
/>

<TodoCard
  number={4}
  title="Retry webhook delivery"
  state="working"
  prompt={prompt}
  acceptance={["Retries three times"]}
  onDrop={() => drop(4)}
/>

<TodoDraftCard
  repo="octocat/hello"
  title={draft.title}
  prompt={draft.prompt}
  onTitleChange={setTitle}
  onPromptChange={setPrompt}
  onCommit={commit}
  onDiscard={discard}
  committing={draft.committing}
  refused={draft.refused}
/>
```

## States and numbers

A TODO's `state` shows as a chip:

| `state` | Chip |
| --- | --- |
| `queued`, `starting` | Queued, Starting (outline) |
| `working` | Working (brand, with a status dot) |
| `needs_you` | Needs you (warning) |
| `in_review` | In review (brand) |
| `merged` | Merged (success) |
| `dropped` | Dropped (muted) |
| `failed` | Failed (destructive) |

`TODO_STATE_WORDS` holds these words. Merged and dropped rows are muted in the
list.

The stack numbers a TODO when it lands. Until then `number` is `null`, and the
TODO shows `T–`. `todoNumberText(number)` gives the same text.

## Pending chips

A commit or drop this device made that the stack hasn't shown yet takes
`pending`:

- `requested`: on its way, a muted `Requested` chip.
- `not_sent`: refused, a destructive `Not sent` chip.

`TODO_PENDING_WORDS` holds these words. Pass the stack's own rows plus this
device's pending ones, so a TODO committed offline shows `T–` and `Requested`
until the stack numbers it. Key each row by a stable `id`, so the row keeps its
element when it gets its number.

## Drop

With `onDrop`, Drop shows on each TODO that is numbered, not merged or dropped,
and has no pending chip. Drop confirms inline, once:

1. Drop becomes `Drop T4` and `Cancel`, and focus moves to `Cancel`.
2. `Cancel` or Escape puts Drop back and focuses it.
3. `Drop T4` calls `onDrop` and puts Drop back. Focus moves to the row's
   title, or the card's heading, since your next render may hide Drop.

`Cancel` sits where Drop was, so a double click cancels. In `StackList`, one row
confirms at a time.

## The draft

`TodoDraftCard` is a form named `TODO draft`. Its header reads `Draft` and
`Only you`, and the repository when you pass `repo`. It has a `Title` input, a
`Prompt` textarea, the acceptance criteria the agent drafted (read only), then
`Commit` and `Discard`.

Commit is disabled while `committing`, while the trimmed title or prompt is
empty, and while the title is longer than `maxTitleLength` (120 by default).
The `Commit` button, Enter in the title, and ⌘Enter or Ctrl+Enter in the prompt
call `onCommit` only while Commit is enabled. Each always prevents the
browser's own submission. `refused`, such as `Stack full`, shows as a
destructive chip beside the buttons.

## Keyboard

In `StackList`, ArrowDown and ArrowUp move focus between rows, and Home and End
to the first and last row. Focus lands on a row's title link, or on the row
itself when it has no link. Tab reaches every link, row without a link, and
button. A plain click or Enter on a title link calls `onNavigate`; a click with
⌘, Ctrl, Shift or Alt, or with the middle button, keeps the browser's behavior,
such as opening a new tab.

## Data attributes

Each `StackList` row is an `li` in an `ol` named `Stack`, with `data-todo` (its
`id`), `data-state`, `data-pending` and, for the TODO the page shows,
`aria-current="true"`. `TodoCard` sets `data-state` and `data-pending` on its
`article`. The roots carry `data-slot`: `stack-list`, `todo-card` and
`todo-draft-card`.

## Related

- [API reference](../api.md#todos-and-the-stack): the props and exports.
- [Test a component](./test-a-component.md): drive these components under
  happy-dom.
