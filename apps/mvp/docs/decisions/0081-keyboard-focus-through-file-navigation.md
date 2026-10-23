# 0081: Keep keyboard focus through file navigation

2026-10-23. Implements the existing file-tab keyboard requirement; no new UI copy.

Delete and Backspace already focus the neighboring file tab before dispatching
`file/close`. Persisting deletion before navigation remains required. Two later
view transitions can undo that focus: branch tracking remounts the composer,
and navigation past the router's pending delay hides the strip under Suspense.

Opening Chat sets `focusRequested` in the existing, memory-only composer
collection. The input's callback ref dispatches `takeComposerFocus` and focuses
the DOM element only if that action consumes a pending request. Closing Chat
cancels a pending request. Repeated opens while already open do not request it
again. The component has no state hooks, refs used as state, or effects.
Remounting after branch tracking or Suspense creates no request, even if focus
is temporarily on the body. The strip retains its focused link across Suspense only while it owned
focus at hide time; on reveal it restores a connected link only if focus is on
the document body. Focus moved outside the strip before or during the wait wins.

Keep this in the existing UI primitives and chat actions (library catalog:
`@smthrs/ui`, `@smthrs/effect-tanstack-db`). The composer row is never persisted;
there is no stored schema migration, new plugin interface or durable flow. This
repairs existing focus behavior without changing navigation completion.
Component tests cover the real composer and app services. A local Chromium
component test uses the installed router and a held navigation to cover the
browser's loss of focus when Suspense hides a route; happy-dom does not model
that browser behavior.
