---
title: "Host commands"
description: "Commands for the self-hosted install."
---

| Command | Purpose |
| --- | --- |
| `smthrs host backup` | Back up the installation |
| `smthrs host restore <directory>` | Restore the installation from a verified backup |
| `smthrs host start [--bundle <bundle>] [--bind <bind>] [--origin <origin>]` | Start the bundled host service |
| `smthrs host status` | Show launchd, bundle and process health |
| `smthrs host stop` | Stop the host service |
| `smthrs host upgrade` | Upgrade the installation after a verified backup |

Repeat `--origin` for each public origin. All commands accept `--verbose`.

Install, stop and restore share a process lock that the OS releases after a
crash. Restore holds it from the stopped-state check through backend completion;
a concurrent operation refuses with `host_service_busy`. The lock database
stores no application data and remains in place between commands. Install uses
the verified canonical bundle directory in its executable path and environment.

Completion and failure counters (`cli.host.<operation>.completed` and
`cli.host.<operation>.failed`), debug logs and spans cover all three operations.
