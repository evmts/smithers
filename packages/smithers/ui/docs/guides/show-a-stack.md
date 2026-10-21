---
title: "Show a stack"
description: "Show a repository's TODOs as GitHub's issue list with IssuesView, one TODO as GitHub's issue page with ItemConversation, Drop behind a menu or a confirming button, and a private draft with TodoDraftCard."
---

A repository's stack is its TODOs in merge order. It draws with the components
an issue list and an issue page use, so a stack reads like GitHub:

- `IssuesView` lists the TODOs: `ordered` keeps the stack's order as an `ol`,
  `numberPrefix="T"` numbers them `T4`, and `filter` adds the Open and Closed
  tabs. Each row's `status` draws its state icon, and its `menu` holds Drop.
- `ItemConversation` shows one TODO: its prompt as the body, a timeline of
  `events`, and an `aside` with its links and Drop.
- `TodoDraftCard` is a private draft that a person edits and commits.

All are controlled. The host reads the TODOs and owns every value and write;
the components fetch nothing and keep no text of their own.

```tsx
import { Button, ConfirmButton, IssuesView, ItemAsideSection, ItemConversation, TodoDraftCard } from "@smthrs/ui"

<IssuesView
  repo="octocat/hello"
  aria-label="octocat/hello stack"
  size="full"
  ordered
  numberPrefix="T"
  emptyTitle="No TODOs"
  unknown={!synced && todos.length === 0}
  issues={todos.map((todo) => ({
    id: todo.id,
    number: todo.number,
    title: todo.title,
    state: todo.open ? "open" : "closed",
    status: { kind: "queued", label: "Queued" },
    author: todo.login,
    updatedAt: todo.createdAt,
    links: [{ label: "#12", href: "/octocat/hello/issues/12" }],
    menu: [{ label: "Drop", destructive: true, confirm: { title: `Drop T${todo.number}?`, action: "Drop" }, onSelect: () => drop(todo.number) }],
  }))}
  filter={{ state: tab, href: (state) => `/octocat/hello/stack${state === "closed" ? "?state=closed" : ""}`, onSelect: (_, href) => router.navigate({ href }) }}
  href={(todo) => (todo.number === null ? undefined : `/octocat/hello/stack/${todo.number}`)}
  onNavigate={(_, href) => router.navigate({ href })}
  actions={<Button onClick={newTodo}>New TODO</Button>}
/>

<ItemConversation
  title="Retry webhook delivery"
  number={4}
  numberPrefix="T"
  state="open"
  status={{ kind: "running", label: "Working" }}
  author="maya"
  body={prompt}
  events={[{ id: "committed", kind: "queued", author: "maya", text: "committed", createdAt }]}
  comments={[]}
  aside={
    <>
      <ItemAsideSection title="Issue" links={[{ label: "#12", href: "/octocat/hello/issues/12" }]} onNavigate={(href) => router.navigate({ href })} />
      <ConfirmButton variant="ghost" size="sm" destructive confirm={{ title: "Drop T4?", action: "Drop" }} onConfirm={() => drop(4)}>
        Drop
      </ConfirmButton>
    </>
  }
/>

<TodoDraftCard
  repo="octocat/hello"
  source="#12"
  title={draft.title}
  prompt={draft.prompt}
  acceptance={draft.acceptance}
  committing={draft.committing}
  onTitleChange={setTitle}
  onPromptChange={setPrompt}
  onCommit={commit}
  onDiscard={discard}
/>
```

## States and icons

A TODO's state is the row's icon and the page's pill: pass `status` with the
kind to draw and the word it stands for.

| TODO state | `kind` |
|---|---|
| Requested (not numbered yet) | `requested` |
| Queued | `queued` |
| Starting, Working | `running` |
| Needs you | `needs_you` |
| In review | `in_review` |
| Merged | `merged` |
| Dropped | `dropped` |
| Failed | `failed` |

A merged or dropped TODO has left the stack: pass it with `state: "closed"`, so
it lists under Closed.

## Drop

Drop is quiet: an item in a row's `⋯` menu, and a ghost `ConfirmButton` on the
page. Both ask in a dialog first, with `Cancel` focused, and drop only on the
dialog's action.

## Keyboard

In the list, ArrowDown and ArrowUp move focus between the rows' links, and Home
and End go to the first and last. A row's `⋯` opens with Enter on its first
item; Escape closes it. In the draft, Enter in the title and ⌘Enter or
Ctrl+Enter in the prompt commit.

## Related

- [API reference](../api.md#todos-and-the-stack): every prop.
- [Show a generated view](./show-a-generated-view.md): `IssuesView` as the
  `issues` template.
