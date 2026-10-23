import { Window } from "happy-dom"

// A DOM host for React, retaining Node's real fetch, streams, AbortSignal,
// EventTarget and Web Locks for the app's SQL/Electric services. Vitest's full
// happy-dom environment replaces fetch, whose stream cancellation can throw.
export const dom = new Window({ url: "http://localhost" })
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  HTMLElement: dom.HTMLElement,
  HTMLIFrameElement: dom.HTMLIFrameElement,
  HTMLInputElement: dom.HTMLInputElement,
  HTMLTextAreaElement: dom.HTMLTextAreaElement,
  Node: dom.Node,
  Element: dom.Element,
  KeyboardEvent: dom.KeyboardEvent,
  MouseEvent: dom.MouseEvent,
  getComputedStyle: dom.getComputedStyle.bind(dom),
  IS_REACT_ACT_ENVIRONMENT: true,
})
