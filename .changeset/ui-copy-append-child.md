---
"@smthrs/ui": patch
---

The clipboard fallback attaches its hidden field with `appendChild`, which typechecks under both DOM's and
`@cloudflare/workers-types`' declarations, so a Worker that renders generated views with `@smthrs/ui`'s presentation
bundle can compile the package's root.
