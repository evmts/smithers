# File-route pending screens preserve the mounted strip

2026-10-23. Repair the existing keyboard behavior; no new product interface.

Production's blob route rendered `BranchPendingScreen` after the router's
pending deadline. Its strict `useParams` lookup named only the tree route,
throwing an invariant and replacing the Suspense subtree. The surviving file
had the right URL, selection and lines, but its new DOM link had no focus.
The isolated Chromium fixture's pending component was a plain div, so it never
executed that lookup. Awaiting the device write made the production ordering
visible; neither persistence ordering nor the service worker needs changing.

Read the current route's parameters in the shared pending screen, as
`BranchHeader` already does. Keep the existing SDK focus behavior and persist
before navigation. `FileTabs.onFocusLifecycle` reports content-free requests,
consumption and drops; the app records their log, span and counter through its
captured Effect services. App views gain no state or effects. Catalog entries:
`@smthrs/ui`, `@smthrs/effect-tanstack-db`.

The regression runs real file-close flows, SQLite, repository loaders,
TanStack Router and the actual pending screen. Holding the persistence host
and route continuation exposes their ordering without replacing dependencies.
It failed with focus on the body before this fix and passes with the same
remaining DOM link focused afterward. Existing Chromium tests separately cover
browser focus loss on Suspense hide/reveal and respecting outside focus.
