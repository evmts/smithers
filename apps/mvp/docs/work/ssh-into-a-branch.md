---
title: SSH into a branch's machine
status: idea
area: infra
owner: unassigned
updated: 2026-10-20
links: [branch-terminal.md, old-app-feature-gaps.md, sandboxes.md, connect-agents-sandboxes-forge.md, roles-and-labels.md, auth.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, ../decisions/0007-roles-and-tags.md, ../proposals/mvp-gaps.md]
---

## What

A person opens the branch's machine from their own editor or terminal over SSH.

Old app:
- `/ssh` copies the SSH line for a branch (`apps/app/src/mainview/flows/entries/branch.ts`), as does the Branch card's Copy SSH line (`cards/views/BranchView.tsx`).
- Presence shows "Maya via SSH" and the file being edited.
- Journeys: `apps/app/e2e/real/ssh-branch.spec.ts`, `apps/app/e2e/playwright/spec/A-SSH.spec.ts`.

Spec mvp.md §6.15: `ssh -p 2222 <branch>@<host>` or `smthrs ssh <branch>`. Keys come from the person's GitHub keys. VS Code, Cursor and Zed remote editing work, and port forwarding previews an app. Saves arrive in the live document as attributed edits.

Already planned, so not part of this gap:
- An interactive branch terminal and outside CLI agents (`mvp-gaps.md` items 14 and 15).
- Decision 0007 counts SSH as branch write authority and closes SSH sessions when access is revoked.

Not planned: any way into a sandbox over SSH. Decision 0005 closes outbound non-HTTP traffic and says nothing about inbound SSH.

## Why

- J3 and J6: teammates join a branch from the editors they already use.
- Port forwarding is how a person previews a running app on the branch.

## How it fits

- Cloudflare Containers reach the outside only through the Worker. So SSH goes over a tunnel: `smthrs ssh <branch>` as an SSH `ProxyCommand` that carries the session over an HTTPS WebSocket to the branch's `SandboxObject`.
- The person's device-flow session (decision 0008) authorizes it, checked against the branch's mode (decision 0007).
- Saves reach the live document through the same Yjs path as the file editor (decision 0005 §2).

## Size

L.

## State

- 06:10 on 2026-10-20: the old-app audit wrote this note as gap 16 (`status: idea`).
- 06:39:05: Will's priorities name the browser terminal ("ability to open terminal in an iframe is important"), not SSH. Panel B designs the [branch terminal](branch-terminal.md) in 0013; this note stays `idea` and follows it, as its question recommends.

## Questions for Will

- Is SSH in scope for the hosted app, or only the browser terminal? Recommended: `smthrs ssh` over an HTTPS tunnel, after the browser terminal ships.
