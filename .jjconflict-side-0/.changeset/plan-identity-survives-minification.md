---
"@smthrs/crypto": major
"@smthrs/plan": patch
"@smthrs/flow": minor
"@smthrs/engine-store": patch
---

A run parked under one minified build now resumes under the next. A minifier
names bindings by how often the whole bundle uses each one, so a deploy that
changed unrelated code renamed every unchanged callback, and every parked run
failed its resume with `plan_changed`: in Cloudflare Durable Objects, and in
browsers resuming from OPFS after an app update.

A resume now compares each callback by its shape: its source with every
binding renamed by the order it is declared in, each use resolved through the
scopes it is read in, plus its captures. `FunctionIdentity.resumeDigest`
carries it and replaces `sourceDigest`, which compared exact source. Captured
callbacks carry one too, so a step key or build target key that includes a
captured callback moves once. A cache still keys on exact source.

We chose shape over identifying callbacks by their position in the plan with
an optional `version`. Position needs an author to bump a version for every
logic edit, or a changed callback resumes silently. Shape catches a changed
literal, operator, property, key, structure, or a swap of two parameters' or
two locals' uses, with no annotation. It runs on any host: a tokenizer with
scope tracking, no parser dependency, cached by source. Across esbuild,
Rolldown's Oxc and Terser, every one of 932 `effect` functions kept its shape
when unrelated code renamed it; Terser alone changed 3 by inlining differently.

What shape cannot see: which outer binding a name reads, beyond the pattern
of its reads, because a minifier may swap two outer names. A bound or native
function has no shape and refuses every resume. A run parked by an earlier
release compared callbacks by exact source and refuses its first resume once.

A refused run now says why. `Flow.Result` keeps an
`Interpreter.InterpreterError` defect whole, so `poll`, a browser engine's
`result` and any other process read the same `code`. The new
`Interpreter.refusalCode(cause)` reads it, and reads `plan_changed` from a
failure stored before the code was kept.
