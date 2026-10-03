import type { Extension } from "@smthrs/ui/adapters/code-editor"
import { authorRanges } from "./CoEditing"
import type { CodeEditorViewProps } from "@smthrs/rpc/FileCard"
import { fixtures } from "@smthrs/rpc/fixtures/File"
import { CodeEditorView } from "./CodeEditorView"
import type { ViewStory } from "./stories"
// T-UI-11 S1 and T-UI-19 S3 visual fixtures; no product mount.
export const fileStories = {
  one_mib: { ...fixtures.text, expect: ["0123456789ab"], model: { ...fixtures.text.model, content: { kind: "text" as const, text: "// 0123456789ab\n".repeat(65_536) } } },
  live: { ...fixtures.live, binding: { extensions: [authorRanges.of([{ from: 0, to: 14, author: 0 }, { from: 15, to: 24, author: 1 }])] } },
  live_separate: { ...fixtures.live_separate, binding: { extensions: [authorRanges.of([{ from: 6, to: 9, author: 0 }, { from: 20, to: 23, author: 1 }, { from: 34, to: 39, author: 2 }])] } },
  unsaved_one: fixtures.unsaved_one,
  saved: { ...fixtures.saved, binding: { extensions: [] } },
  unsaved: { ...fixtures.unsaved, binding: { extensions: [] } },
  outside: fixtures.outside,
  no_binding: fixtures.live,
  disabled_reapply: { ...fixtures.unsaved, actions: [{ ...fixtures.unsaved.actions[0]!, disabled: { reason: "Reconnect first" } }] },
  text: fixtures.text, diagnostics: fixtures.diagnostics, hover: fixtures.hover, reveal: fixtures.reveal,
  too_large: fixtures.too_large, binary: fixtures.binary,
  binary_mb: { ...fixtures.binary, expect: ["Binary file · 1.2 MB", "on GitHub ↗"], model: { ...fixtures.binary.model, content: { kind: "binary" as const, bytes: 1_200_000 } } },
  too_large_mb: { ...fixtures.too_large, expect: ["Too large to co-edit · 4.1 MB", "on GitHub ↗"], model: { ...fixtures.too_large.model, content: { kind: "too_large" as const, bytes: 4_100_000, text: "hidden" } } },
  no_gestures: { ...fixtures.text, gestures: {} },
  hostile: { ...fixtures.hover, expect: ['<script>alert("code")</script>', '<img src=x onerror=alert("hover")>'], model: { ...fixtures.hover.model, content: { kind: "text" as const, text: '<script>alert("code")</script>\n' }, diagnostics: [{ line: 1, severity: "error" as const, message: '<script>alert("diagnostic")</script>' }], hover: { line: 1, col: 0, markdown: '<img src=x onerror=alert("hover")>' } } },
  typescript: { ...fixtures.text, expect: ["const answer: number = 42"], model: { ...fixtures.text.model, language: "typescript", content: { kind: "text" as const, text: "const answer: number = 42\n" } } },
  javascript: { ...fixtures.text, expect: ["export const answer = 42"], model: { ...fixtures.text.model, language: "javascript", content: { kind: "text" as const, text: "export const answer = 42\n" } } },
  go: { ...fixtures.text, expect: ["package main"], model: { ...fixtures.text.model, language: "go", content: { kind: "text" as const, text: 'package main\n\nfunc main() { println("hello") }\n' } } },
  rust: { ...fixtures.text, expect: ["fn main()"], model: { ...fixtures.text.model, language: "rust", content: { kind: "text" as const, text: 'fn main() { println!("hello"); }\n' } } },
  python: { ...fixtures.text, expect: ["def hello():"], model: { ...fixtures.text.model, language: "python", content: { kind: "text" as const, text: 'def hello():\n    print("hello")\n' } } },
} satisfies Record<string, Omit<CodeEditorViewProps<Extension>, "onAction" | "onView"> & { expect: readonly string[] }>
export const stories: ViewStory[] = Object.entries(fileStories).map(([name, story]) => ({
  name, expect: story.expect, actions: story.actions, gestures: story.gestures,
  interactions: [
    ...(story.model.unsaved ? [{ selector: ".code-recovery button", action: null }] : []),
    ...(story.model.content.kind === "text" ? [
    ...(("hover" in story.gestures && story.gestures.hover) ? [{ selector: ".cm-content", gesture: "hover", event: "keydown" as const, key: " ", action: { tag: "code.hover", args: { path: "flows/todo/flow.ts", line: "1", col: name === "reveal" ? "70" : "0" } } }] : []),
    ...(("definition" in story.gestures && story.gestures.definition) ? [{ selector: ".cm-content", gesture: "definition", event: "keydown" as const, key: "F12", action: { tag: "code.definition", args: { path: "flows/todo/flow.ts", line: "1", col: name === "reveal" ? "70" : "0" } } }] : []),
  ] : Object.keys(story.gestures).map(gesture => ({
    selector: ".code-file-view", gesture, event: "keydown" as const,
    key: gesture === "hover" ? " " : "F12", action: null,
  }))),
  ],
  render: (callbacks, actions) => <CodeEditorView {...story} actions={actions ?? story.actions} {...callbacks} />,
}))
