---
title: "API authentication"
description: "How the backend handles API credentials and authentication errors."
---

## Authorization header

Use `Bearer` or `token` with a `smithers_` personal token or `smithers_oat_` OAuth token;
Basic accepts the token as its password. Malformed headers return HTTP 401 with
`WWW-Authenticate: Bearer error="invalid_token"` and `code: "invalid_token"`, without cookie fallback.
Expired or missing well-formed tokens keep `unauthorized`. Model and legacy `jjhub_` credentials
cannot authenticate as a user. LFS, Worker, OAuth client and build-cache grants use their own gates.

## Install sign-in

Open the Setup URL printed by the backend and sign in with GitHub. Password routes are removed.
Environment or configuration bootstrap tokens are ignored. Each backend-minted token exchanges once
for a host-only, HttpOnly, SameSite=Lax setup cookie. PostgreSQL holds only digests; setup sessions
expire with 24 hours idle. Restart before claim rotates the token and retains sessions.

One claim transaction writes the singleton owner, admin collaborator, OAuth account and person
session, then deletes the token and all setup sessions. Concurrent/replayed claims get
`401 setup_closed`; invalid cookies are cleared. Only unmatched `/setup` and assets bypass scope;
other live setup requests outside the allowlist get `403 permission`.

Until GitHub confirms push access, only install status, App setup and GitHub sign-in are allowed;
other requests get `403 owner_unverified`. App-JWT lookup binds the installation, ignoring redirect IDs.
`owner.access_checked` records `last_access_check_at`; `setup.owner_access` records refusals.
Later sign-ins require an unsuspended owner and live push access; GitHub failures refuse sign-in.
HTTP, Git and SSE share the member boundary. Credential minting cannot inherit setup scope.

### Upgrade recovery

Migration 0106 keeps `self_host_owners`, reuses admin collaborators and drops `local_credentials`.
An unlinked owner opens a fresh Setup URL and signs in with GitHub, retaining its `users` row.
Membership uses `collaborators.id`; sessions and tokens use `users.id`.

Set `SMITHERS_GITHUB_APP_REPOSITORY=owner/name`, install the App, grant the linked account push
access, and run `smithers-backend owner verify-access` on the Mac using the existing database and
sealed App credentials. Linked owners skip the setup-link step. The permission response must match
the stored GitHub user ID. If a login was renamed, sign in with the linked account before retrying.
