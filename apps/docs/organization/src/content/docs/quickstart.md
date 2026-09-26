---
title: "Quickstart"
description: "Load the example organization, validate it, and compose one role prompt."
sidebar:
  order: 1
editUrl: "https://github.com/smithersai/smithers/edit/main/packages/smithers/agent/organization/docs/quickstart.md"
---

This page loads the example organization shipped with the package, validates
it, and composes the builder's prompt for one task. It needs Node 26.4 or
later and runs without a model.

## Load and validate

```ts
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { Prompt, Roster, Skills } from "@smthrs/organization"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const program = Effect.gen(function*() {
  const roster = yield* Roster.load("example/Org")
  const pack = yield* Skills.loadPack("example/Org/Skills")
  const violations = Roster.validate([...roster.profiles.values()], {
    weeklyMeeting: true,
    skills: [...pack.skills.keys()]
  })
  if (violations.length > 0) return yield* Effect.fail(violations)

  const builder = roster.profiles.get("builder")!
  const skills = yield* Effect.fromResult(Skills.select(pack, builder.skills))
  return yield* Effect.fromResult(Prompt.compose({
    common: { id: "common", version: "1", text: "Follow your charter." },
    profile: builder,
    task: {
      id: "task-1",
      objective: "Make slugify keep digits between words.",
      inputs: ["src/slug.js"],
      acceptance: ["slugify('Release 2 Notes') returns 'release-2-notes'"],
      evidence: ["test command output"],
      requestedBy: "lead"
    },
    skills,
    context: []
  }))
})

const composed = await Effect.runPromise(
  program.pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))
)
console.log(composed.digest, composed.system.length)
```

`composed.system` holds the common instructions, the rendered charter, and
each skill; `composed.prompt` holds the task. `composed.digest` pins the
exact parts, so the same inputs always give the same digest.

## Your own organization

Copy `example/Org` to a private repository, edit the roles, and run the same
validation. Keep credentials out of profiles: a profile names connections
and identities by reference, and a value shaped like a provider token is
refused.
