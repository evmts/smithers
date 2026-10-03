---
title: Workspace creation
description: Create and reuse named repository workspaces.
---

## Named workspaces

`POST /api/repos/{owner}/{repo}/workspaces` accepts `name`, optional
`source_bookmark`, and optional `kind` (`container` or `vm`).
An omitted bookmark uses the repository default. An omitted kind uses
`container`. Optional `resources` requests CPU, memory and writable disk.
Optional `image` selects a public OCI image; `network` selects guest egress.
Unsupported fields, such as `idle_timeout_seconds` or `services`, are refused with `400 unknown field`
before provisioning. The route never drops a setting silently.

```json
{"name":"issue-2924","source_bookmark":"main","kind":"vm"}
```

Reuse is scoped to the requesting user, repository, name, bookmark, and kind.
Different names can run concurrently on the same repository and bookmark.
Repeating the same identity returns its pending, starting, running, or suspended
workspace. Names are trimmed; an omitted name reserves the empty-name identity.
Concurrent requests for one identity share one workspace row before provisioning.
Explicit forks and snapshot restores create independent resources.

A repository with no commits yet still gets a workspace: its checkout has an
unborn branch named after the bookmark and a colocated Jujutsu repository, so
the first change can be committed there. A repository that has commits but
lacks the bookmark fails provisioning.

## From a pushed ref

`source_ref` names one of your refs pushed with `smithers repo push --name`
(`refs/smithers/users/<your id>/<name>`). The workspace checks out that commit
without starting a run; `source_commit` in the response is the commit. The ref
resolves only in your own namespace, so another user's ref name fails with
404 `user_ref_missing`. The commit is pinned under the workspace's own
`refs/smithers/workspaces/<id>/sources/<commit>`, so the checkout survives the
ref's expiry. A repository that lands through its mythical stack refuses it
with 409 `user_ref_stack`, and `source_ref` cannot be combined with
`snapshot_id`. Each request creates a new workspace: like a fork, it reserves
no named identity.

```json
{"name":"spike","source_ref":"spike"}
```

## Provisioning

Creation returns before provisioning completes. Poll the workspace until
`status` is `running` or `failed`. The per-user limit is 100 live workspaces;
reuse consumes no extra slot. Delete a workspace to release its name and slot.
Failed workspaces also release their identity and quota slot.

## Resources

```json
{"name":"sized","resources":{"vcpu":4,"memory_mib":8192,"disk_gib":40}}
```

Resource fields must be positive integers. Memory is in MiB and disk in GiB.
Omitted fields in a sized request use the server defaults; the resolved size
is persisted and returned in `resources`, including after recovery and fork.
A snapshot restore keeps its source size and refuses a new resource request.
The runtime must declare support for requested resources before creation.

The server caps requests with `SMITHERS_SANDBOX_WORKSPACE_MAX_VCPU_COUNT`,
`SMITHERS_SANDBOX_WORKSPACE_MAX_MEMORY_MB`, and
`SMITHERS_SANDBOX_WORKSPACE_MAX_DISK_MB`. Both `*_MB` settings are MiB;
`disk_gib` is converted to MiB before provisioning. Without an explicit cap,
the CPU and memory defaults and 32 GiB disk are the caps. Invalid configured
caps refuse startup. Over-max requests return `400 workspace_resources_exceeded`
with the field, minimum, maximum and requested value, before creating a row or VM.

A create with the same name and a different resolved size returns `409 conflict`;
choose a different name or delete the existing workspace.

## OCI images and egress

Caller-selected images, network modes and root SSH require
`SMITHERS_FEATURE_FLAGS_WORKSPACE_CUSTOM_IMAGES=true`. The server defaults to
false. A create carrying `image` or `network`, or a root SSH request, returns
HTTP 403 `workspace_custom_images_disabled` when disabled. Omitted settings
keep the existing workspace behavior. Hosted operators opt in explicitly.

```json
{"name":"trial","image":"python:3.13-slim","network":{"mode":"none"}}
```

`image` requires `kind: "container"` (the default). Docker Hub,
`public.ecr.aws`, and `ghcr.io` are resolved anonymously at admission. The
server downloads the manifest, verifies its SHA-256 digest, and persists the
requested reference and digest before creating a guest. Inaccessible images,
invalid references, and invalid manifests return HTTP 400 with user fault
`workspace_image_unresolvable`. No image layers are downloaded by admission.
Tags are pinned; subsequent boots use the admitted digest.

Custom images bypass repository environment layers and coding toolchain
installation. The repository clone uses plain Git when present and is
best-effort. A guest without Git or an unavailable Git host can still run.
The local microVM adapter requires `/bin/sh` and Python 3 for its guest helper;
commands using Bash require `/bin/bash` in the image.

`network` accepts `mode` only:

- `proxy` is the default and uses the runtime's egress proxy.
- `none` permits no outbound traffic, including the proxy and backend listeners.
  Repository cloning is skipped.

The image and network policy survive restart and recovery. Forks and snapshot
restores inherit the source policy; a restore refuses image/network overrides.
Repeating a named create with a different admitted image or network returns
HTTP 409. A moved tag cannot silently change an existing workspace.

Create, list and view responses include `image: {ref, digest}` and
`network: {mode}`. `image.booted_digest` is present only after runtime
observation of the actual booted image. The local adapter checks the
Microsandbox inventory and refuses missing or mismatched digest receipts.
An admission digest alone is not a boot receipt.
Existing rows retain nullable settings without a backfill; omitted settings use
the existing runtime defaults. Host filtering is deferred to a separate change.

```sh
smthrs workspace create --repo owner/repo --name trial \
  --image python:3.13-slim --network none --cpus 2 --memory 2048 --disk 8 \
  --wait --format json
smthrs workspace exec trial --repo owner/repo --user root \
  --command 'cat /etc/os-release; id -u' --timeout 0 --format json
```

Plans own idle policy. Workspace creation exposes no `--idle-timeout` or
`--service` flag; start services through the workspace service commands.
