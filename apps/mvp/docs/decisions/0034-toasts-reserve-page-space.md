# 0034: Page notices reserve space

2026-10-22. Implements M-48 and decision 0009's requirement that unrelated controls remain usable.

Page notices use `@smthrs/ui`'s existing inline ToastStack above the routed screen, with room for the floating bell. Empty stacks take no space. The existing three-card cap and `+N` panel action remain. The app shell's conversation stack remains under its header. This is shell infrastructure shared by plugins; no new library or product copy is needed. Catalog entries used: render UI (`@smthrs/ui`), route notifications (`@smthrs/notifications`), and durable flows (`@smthrs/flow`).
