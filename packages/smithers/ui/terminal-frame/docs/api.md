---
title: "API reference"
description: "Every export of @smthrs/terminal-frame: TerminalFrame, its props and handle, the generated frame runtime, and the messages between the frame and the page."
sidebar:
  order: 1
---

Everything below is exported from the package root, `@smthrs/terminal-frame`.
The package has no other entry point.

## Terminal frame

xterm.js and its fit addon run in an opaque-origin frame; the page bundles
them only as the frame runtime's text.

```ts
function TerminalFrame(props: TerminalFrameProps): JSX.Element

type TerminalFrameProps = Omit<ComponentProps<"div">, "children" | "title" | "onInput" | "onResize" | "ref"> & {
  title: string
  theme: TerminalFrameTheme
  readOnly?: boolean
  stream: TerminalFrameStream
  onInput: (data: string) => void
  onResize: (cols: number, rows: number) => void
  onKey?: (key: TerminalFrameKey) => void
  onLink?: (url: string) => void
  runtime?: string
  ref?: Ref<TerminalFrameHandle>
}
type TerminalFrameStream = (write: TerminalFrameWriter) => () => void
type TerminalFrameWriter = { readonly output: (bytes: Uint8Array | string) => void }
type TerminalFrameHandle = { readonly focus: () => void }
type TerminalFrameKey = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
type TerminalFrameTheme = "light" | "dark"

const terminalFrameRuntime: string
```

`TerminalFrame` shows `<iframe sandbox="allow-scripts" srcdoc
referrerPolicy="no-referrer">` with the document `ViewCsp.frameDocument`
writes: the frame runtime is its only script, pinned by hash, and
`connect-src 'none'` leaves the frame no network. `style-src 'unsafe-inline'`
stays, because xterm.js injects `<style>` elements and writes 24-bit colors
as `style` attributes. The frame mounts only while it is within 200 px of the
screen, with a new nonce and document each time.

The frame asks with `terminal/initialize` and its nonce. The page answers
only its own frame's `contentWindow`, only with this mount's nonce and only
once, and transfers a `MessagePort`; everything after uses the port.

| Message | Direction | Params |
| --- | --- | --- |
| `terminal/initialize` | frame to page, window | `{ nonce }`; the answer's `result` is `{ theme, colors, readOnly }` |
| `terminal/output` | page to frame | `{ bytes }`, a transferred `Uint8Array` |
| `terminal/options` | page to frame | `{ theme, colors, readOnly }`, after any changes |
| `terminal/focus` | page to frame | `{}` |
| `terminal/input` | frame to page | `{ data }`, at most 1 MiB |
| `terminal/resize` | frame to page | `{ cols, rows }`, first and after each fit that changes them |
| `terminal/key` | frame to page | a `TerminalFrameKey`, for ⌘K and Ctrl+K only |
| `terminal/link` | frame to page | `{ url }`, an `http:` or `https:` URL of at most 2048 characters |

`stream` runs each time the frame connects; its teardown runs when the frame
unmounts or leaves the screen. `output` transfers a `Uint8Array` that spans
its whole buffer, so the caller must not reuse it; anything else is copied,
and a string is sent as UTF-8. `colors` is the terminal palette for `theme`
from the document's `data-palette`.

`readOnly` sets xterm's `disableStdin` and removes the frame's input listener,
and the page drops any `terminal/input` while it is set. ⌘K and Ctrl+K reach
`onKey` and never the shell; Esc stays in the shell. A link is posted only for
a person's click on an OSC 8 link or a URL in the text, and the page acts on
it only while it has the person's activation: `onLink`, or by default
`window.open(url, "_blank", "noopener,noreferrer")`. The frame loads no
clipboard (OSC 52) addon and follows no link itself. `ref.focus()` focuses the
terminal.
