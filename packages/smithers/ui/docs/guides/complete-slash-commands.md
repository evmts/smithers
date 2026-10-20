---
title: "Complete slash commands"
description: "List a composer's slash commands as the person types, complete their arguments from a payload schema, and read a submitted line as a command run, a refusal, or a prompt."
---

A composer that runs commands needs three things: what a draft lists, what the
keys do with that list, and what a submitted line means. This package splits
them the same way. `slashMenu` and `slashSubmit` are pure functions over your
commands, and `ChatComposer` renders the list through its `completions` prop,
which you control.

## Describe the commands

A `SlashCommand` is a name without the slash, a one-line description, and the
command's arguments as `formFieldsFor` derives them from the payload schema:

```ts
import { formFieldsFor, type SlashCommand } from "@smthrs/ui"
import { Schema } from "effect"

const theme: SlashCommand = {
  name: "theme",
  description: "Set this device's theme to light or dark.",
  fields: formFieldsFor(Schema.Struct({ mode: Schema.Literals(["light", "dark"]) })),
}
```

A field whose schema is a union of literals lists its values. Any other field
is free text and lists nothing. Pass only the commands this person may run:
both functions treat a command they weren't given as absent.

## List what the draft completes to

`slashMenu(draft, commands)` answers what to show:

| Draft | `kind` | Rows |
|---|---|---|
| `/`, `/th` | `commands` | the commands that match: the exact name, then names that start with the text, then names that contain it, then descriptions that contain it |
| `/theme `, `/theme d` | `values` | the next argument's values that match, with its `field` |
| prose, an unknown command, a free-text argument, a second line | `none` | none |

Each row carries `draft`, the composer's text once the row is chosen, and
`runs`, whether that text names every required argument. A command with
arguments completes to `/theme ` with a trailing space, so the next menu lists
its values.

## Render the list

`ChatComposer` takes the rows and owns the keys:

```tsx
<ChatComposer
  value={draft}
  onValueChange={type}
  onSubmit={submit}
  completions={{
    label: menu.kind === "values" ? menu.field.label : "Commands",
    items: menu.items,
    highlighted,
    onHighlight: setHighlighted,
    onChoose: (index, how) => (how === "accept" && menu.items[index].runs ? submit(menu.items[index].draft) : type(menu.items[index].draft)),
    onDismiss: close,
  }}
/>
```

While `items` is non-empty, ArrowDown and ArrowUp call `onHighlight` (wrapping),
Enter calls `onChoose(index, "accept")`, Tab calls `onChoose(index, "complete")`
and Escape calls `onDismiss`, each with `preventDefault`, before the composer's
own Enter and Escape. Shift+Enter, Shift+Tab, a key held with a modifier, and
keys during an IME composition stay the composer's. A click accepts a row
without taking focus from the input.

The input stays a textbox. It declares `aria-autocomplete="list"` and
`aria-haspopup="listbox"` whenever `completions` is set, and while rows show it
names the list with `aria-controls` and the highlighted row with
`aria-activedescendant`. The list is a `listbox` named by `label`.

Because Escape is prevented when the list handles it, a host shortcut that
hides the composer on Escape should listen in the bubble phase and skip an
event whose default was prevented.

## Read a submitted line

`slashSubmit(text, commands)` answers what the line means:

| `kind` | When | Then |
|---|---|---|
| `run` | a command with every required argument | run `command` with `payload`, keyed by field name |
| `missing` | required arguments absent | keep the line; `fields` names them |
| `invalid` | an argument that isn't one of its field's values | keep the line; `field` names it |
| `unknown` | command syntax naming no command given | keep the line; never hand it to a model |
| `prompt` | anything else, `/etc/hosts` included | send `text` as prose |
| `empty` | blank, or a bare `/` | nothing |

Arguments fill the fields in schema order, the last text field takes the rest
of the line, and `--name` sets a boolean field. The `command` in the answer is
the object you passed, so your own fields on it, such as the flow it runs, come
back with it.
