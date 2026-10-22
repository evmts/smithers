---
title: TODO run admission and durable drop
status: in-progress
area: todos
owner: Codex SOLC todo-run-start
updated: 2026-10-22
links: [../decisions/0026-watching-a-todo-run.md]
---

Trace remote admission from writer through Durable Object to engine, reproduce admission delays, and cancel dropped attempts through the engine. Use the catalog's @smthrs/platform-cloudflare host and @smthrs/flow durable runtime; no application retry loop. Local commits only per SOLC brief.
