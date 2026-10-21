---
title: CI parity: KVM, microVMs and privileged Linux settings
status: idea
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md]
---

## What

Run jobs that need KVM, Microsandbox microVMs, a user-namespace sysctl or bubblewrap.

## Why

Smithers' fault suites start Microsandbox with KVM (`release.yml:926-943`, `reliability.yml:336-353`), and its CI turns on unprivileged user namespaces for bubblewrap (`ci.yml:87-95`). Cloudflare containers have no KVM (0005 line 73) and no host sysctl.

## Repositories

Smithers.

## Smallest slice

A VM provider with KVM, such as a Latitude server, behind `CiJob`, for the `faults` and `faultsLong` targets and the bubblewrap tests.

## Disposition

Ticket only (Will, FLOW-8: advanced features are ticketed, not built now). Matrix row 45. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
