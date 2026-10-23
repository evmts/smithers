# 0092 — Flow editors survive a page reload

2026-10-23. Production bug-bash follow-up to the PWA update review.

An automatic service-worker update reloads open pages. The New flow form,
unsent answers, and code editor therefore keep their text in this device's
persisted TanStack DB collections before a reload. Opening New flow without
a name resumes the unfinished form. A Draft or Answer admission clears only
the input that was accepted. An untouched name supplied by an Edit link is
cleared when the person opens an unnamed New flow; a typed form is preserved
even if they follow a different Edit link. They may clear the request to use
that link's name.
Each tab claims an editor id in session storage and holds a Web Lock for that
id; a duplicated tab gets a new id. Form, answer and code rows use that id,
so two tabs cannot overwrite each other's unfinished edits. The service
worker waits for accepted editor writes to reach SQLite before reloading. A
rejected persistence receipt prevents that page's automatic update reload;
the page records a finite `editor_unpersisted` outcome and keeps its visible
text until the person chooses to leave or reload. It
also waits while chat marks an open or hidden draft unsaved or a secret value
remains in a password field; secrets are never persisted to make an update
possible. If the tab id cannot be retained across reloads, flow editors refuse
edits and the rest of the app remains available.

The code editor keeps its source revision and unsaved text together. Switching
to another flow keeps an unsaved edit in this tab's persisted code collection;
opening the first flow again restores it. On
reopening the route it reads the server's current revision: a matching
revision keeps the edit, and a changed revision keeps the text while adopting
the current revision and showing a stale warning. The existing Save control
then says "Overwrite newer revision" and the action requires that explicit
choice before it writes. An unreadable revision keeps the text with a refusal.
The server's revision check still fences other stale writes; a `409 stale`
re-reads the latest revision and leaves the edit visible for that choice. A
save that finishes after the person opens another flow updates neither that
flow's editor nor the route. Sign-out's
device wipe removes these local rows with the rest of the person's data.
If an editor store cannot restore within five seconds, the flow editor says
"Device storage unavailable" and refuses edits. Other app pages still open,
and the failed store's rows remain untouched for a later reload.

This uses `@smthrs/effect-tanstack-db`'s persisted collections and
`Migrations.local`, as the library catalog prescribes. It adds no second
storage path or retry loop.
