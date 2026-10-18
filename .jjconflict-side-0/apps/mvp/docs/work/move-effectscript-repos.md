---
title: Move effectscript repos to smithersai and make them public
status: blocked
area: process
owner: Will (GitHub permission)
updated: 2026-10-19
links: []
---

## What

Transfer `effectscript` and `effect` from `roninjin10` to the `smithersai` org and make them public.

## Why

Will: "Effect script effect and effectscript-ts are in roninjin10 scope. I want you to move those to smithersai org and I also want them all to be public not private".

## State

- A secret scan of `effectscript`'s full history found no real secrets: all 16,218 hits are generated compiler tables and Effect constants.
- `effect` is already public; it is Will's fork of Effect-TS/effect.
- `effectscript-ts` doesn't exist under that name.
- This Mac's GitHub login can't see the private repo. Not moved as of 2026-10-19.

## Next

Will transfers each repo in the browser (Settings, Danger Zone, Transfer), or runs `gh auth refresh -h github.com -s repo,admin:org` so an agent can.

## Questions for Will

- Which repo did "effectscript-ts" mean?
