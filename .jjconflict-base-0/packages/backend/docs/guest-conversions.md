# Sponsored repository conversions

The `convert.v1` guest action extends [guest chat](guest-chat.md). Access stays
**off by default**: no repository is added to the operator allowlist here.
The fake compiler and prompt are fixtures, not evidence about Effeck's compiler.

## Repository contract

At one pinned `main` tip the repository supplies:

- `.smithers/flows/convert/flow.ts`: an exact copy (apart from outer whitespace)
  of `internal/guest/testdata/convert/flow.ts`, the typed `Flow.make("convert")`
  declaration of the host's `guest/convert.v1` activity.
- `.smithers/flows/convert/prompt.md`: UTF-8 prompt text, no NUL, at most 24 KiB.

The declaration names `effeck.compile`; its address is **operator configuration**.
The backend reads the declaration as data and compares it with the shipped
version. It never imports repository TypeScript, executes a repository command,
or accepts repository URLs, flags, model selections or tools. Changing the
fixed sequence requires a platform change, not a repository override. The app's
`/convert` and signed-in agent door submit this same typed request to that action;
they do not add a tool to guest chat. The standalone repository declaration needs
the host implementation of `guest/convert.v1`; an arbitrary local flow runner
without that binding cannot invoke sponsored compute.

## HTTP and persistence

First `GET /api/repos/{owner}/{repo}/guest` establishes the existing scoped guest
capability. Then submit:

```http
POST /api/repos/{owner}/{repo}/guest/conversions
Content-Type: application/json

{"idempotencyKey":"example-1","input":"import { Effect } from \"effect\";","sourceLabel":"direct"}
```

Keys are 1–128 ASCII letters, digits, `-`, `_` or `.`. Labels are `hn`, `x`,
`discord`, `telegram`, `share`, `direct`, `other`. Source is one UTF-8 file,
at most 8 KiB, no NUL. Static imports of `effect` qualify; quoted examples,
comments and dynamic imports do not. Validation is free, without a model.
Refusals include `not_effect`, `too_large`, `invalid_source`.

The conversion claim is inserted before external work. A completed request
returns its persisted `ConversionResult`; a concurrent duplicate returns 202
with `Retry-After: 1`. Poll
`GET /api/repos/{owner}/{repo}/guest/conversions/{idempotencyKey}`. A completed
duplicate, reconnect or router restart returns the first result even if a new
input was supplied. Another guest capability cannot read it. A process interrupted
before persistence becomes `failed/conversion_interrupted` after 70 seconds;
it never reissues a model call. A database failure never claims success.

Admission uses the existing guest principal, sponsor, IP HMAC, global lock,
request/day/window caps, persisted kill switch and 50% notification record.
Conversions reserve $0.10 in **the same pool as chat**. A priced model maximum
that exceeds the allowance is refused. Since worker usage has no authoritative
price receipt, the complete $0.10 remains accounted conservatively after the
conversion; verified model usage alone does not release worker allowance.
Uncertain model outcomes keep their reservation. No guest becomes a member.

One non-streaming model call uses the configured guest model, only the pinned
prompt and source, 4096 completion tokens, no tools, retries, fallback or repair.
The 128 KiB response must contain exactly one choice, finish reason `stop` and
one fenced code block. The fixed compile activity sends only `{"code":"…"}`
to the operator endpoint. It follows no redirects, carries no credentials and
bounds the response to 64 KiB and 15 seconds (inside a 60-second execution limit).
The worker contract is:

```json
{"exitCode":0,"diagnostics":[],"effeckVersion":"0.0.1","compilerDigest":"sha256:<64 lowercase hex>","dependenciesDigest":"<64 lowercase hex>"}
```

Nonzero exit is `diagnostics`, never `compiled`. Missing exit, malformed identity,
oversized output, excessive diagnostics, timeout or transport failure is `failed`.
Diagnostics are plain text `{line:number,column:number,code:string,message:string}`,
at most 100 entries, 2048 bytes per message. Nothing runs the generated program.
The Effeck-owned worker must enforce fresh directories, pinned compiler and
lockfile, no network, 1 CPU, 512 MiB, 10 seconds, fixed project and flags; the HTTP
client cannot enforce those worker-side sandbox rules.

## Receipts and offline shares

`ConversionResult` uses `state`, optional `effeck`, `diagnostics`, `refusal`,
`receipt`, and `effeckVersion` (empty when no compiler evidence exists).
Successful compiler responses carry an Ed25519 receipt. Publish the pinned public
key obtained from `GET …/guest/conversions/key` with the share page. Never put
the private seed in repository content or a browser.

Signature input is these UTF-8 lines, each ending in LF, including the last:

```text
smithers.convert.v1
<state>
<effeckVersion>
<inputSha>
<outputSha>
<compilerDigest>
<dependenciesDigest>
```

Content hashes are lowercase SHA-256 of the exact UTF-8 strings. Signature and
raw Ed25519 public key use standard Base64. The app's
`runtime/ConversionReceipt.ts` verifier checks both content hashes and all signed
fields locally. An altered input, output, state, version or digest fails. A valid
`diagnostics` signature cannot become a `compiled` receipt. Share fragments and
real converter layout belong to Effeck; this lane's transcript projection is a
placeholder. Verification makes no HTTP/model/compiler call.

## Evidence and diagnostics

`conversion_integration_test.go` uses the composed product router, real isolated
PostgreSQL databases and fake provider/worker HTTP servers on lane ports. It
covers refusals, replay, concurrent reconnect, abandoned claims, compiler errors,
timeouts, response bounds, signatures, isolation, shared caps, kill switch,
proxy admission and content-free diagnostic output. App flow tests exercise
person and agent doors and persisted reload. No live provider is called.

Logs contain correlation IDs, pinned revision, stage durations and stable codes.
They exclude source, output, prompts, credentials, capability values and raw IPs.
Persisted conversion results necessarily contain output and diagnostics; they are
scoped to the guest capability, not log data. Retention operations must preserve
reservation accounting and must not turn an uncertain claim into a redispatch.
