# 0011: The agent runs in the browser, on a durable browser engine

Status: accepted (Will, 2026-10-19). It replaces the placement in [0003](0003-flows-and-the-agent.md) question 1 (the agent loop on Cloudflare) and answers its question 2.

## Decision

1. **The agent loop runs in the browser, and the browser is durable.**
   - The agent is a `@smthrs/flow` flow on a durable engine hosted by `@smthrs/platform-browser`.
   - Its step record lives in SQLite in the origin's private file system (OPFS), so closing the tab or a crash resumes the run when the app opens again.
   - If a Smithers flow can't run in the browser today, that is a bug in the SDK, fixed in `@smthrs/platform-browser`.
2. **Flows run locally first.** Where a flow runs depends on what it needs, never on how long it takes.
   - A flow runs remotely (on Cloudflare or a sandbox) only when it needs something the local host doesn't have:
     - a key the person must not hold, such as the model key or the Code Storage organization key;
     - a machine to run code on;
     - something that must happen while every device is off, such as a webhook or a schedule.
3. **Every model call goes through our server.** A model call is a durable step in the browser's engine. It calls a metered Cloudflare endpoint that holds the key, checks sign-in and the budget, and picks the model, so the model can change in one place.
   - A crash during a call re-runs that one call on resume, as `ModelStep` does on any host. A sealed result is never fetched again.
4. **One tab runs the engine; the others follow.**
   - The engine runs in a dedicated Web Worker in one tab, chosen with the Web Locks API.
   - The other tabs follow through a `BroadcastChannel`, and send their requests to the leader.
   - When the leader tab closes, another tab takes the lock and resumes from the step record.
5. **The app is a PWA.** It is installable, with a web app manifest. Its service worker serves the app offline (decision [0002](0002-local-first.md)), but it does not run the engine.
6. **The code stays host-agnostic** (`sdk.host-agnostic-flows` in [rules.md](../rules.md)). The same agent and flows run in the browser, in the native app ([0010](0010-web-first-desktop-later.md)), on Cloudflare or in a sandbox. Only the injected host layers change.

## Why

Will:
- "A syncronous change to storage is by default durable yea. In fact this kinda explains why we maybe should reconsider where the agent runs. The agent should run on frontend and the frontend itself should be durable."
- "If smithers doesn't work in browser yet that's a bug it should work in browser via platform-browser."
- "All model calls are proxied through server yea that's the entire reason we set it up that way plus it allows us to quicklly and easiuly change that."
- "The app should be a pwa to go along with it's local-firstness."
- "Long work isn't what decides if it's remote or not. We prefer things to be local first actaully."

**Why the agent belongs in the browser:**
- The agent is one more local actor. It calls the same actions a person does, against the same TanStack DB collections, so anything a person can do, the agent can do.
- UI tools such as opening a file, highlighting lines or switching the theme need no round trip.
- The native app later runs the identical code.

**Why a leader tab's dedicated worker, not the service worker** (Will left this choice to the lead):

| Need | Dedicated worker in a leader tab | Service worker |
|---|---|---|
| Fast SQLite on OPFS | yes; `createSyncAccessHandle` exists only in dedicated workers | no; no synchronous access handle |
| Stays alive while a model streams | yes, for as long as its tab is open | no; browsers stop an idle service worker after about 30 seconds |
| One runner across tabs | yes, through Web Locks | it is one instance, but it is stopped when idle |
| Works offline | through the service worker's cached app | yes |

So the service worker serves the PWA offline, and the leader tab's dedicated worker runs the engine.

## Consequences

- **A new SDK workstream: the durable browser engine.** It lives in `@smthrs/platform-browser`:
  - a SQLite-on-OPFS store for the engine, through Effect SQL;
  - the leader election and follower channel;
  - a wake-up on load that resumes due runs.
  
  It's proven by a test that kills the tab mid-flow and reopens it.
- **Answering changes.** In the durable-answering plan [HOST-PLAN], W5 no longer moves chat answering into a Cloudflare flow. Answering becomes the browser agent. The server keeps:
  - the model endpoint;
  - the write path for messages.
  
  `waitUntil`, the sweep and the `attempts` table are still deleted. `ModelProxy`, added to `@smthrs/model` in commit `fadb89048fc8` and later deleted as unused, is the starting point for the endpoint.
- **The Cloudflare engine work still matters** (W1, W4: `@smthrs/platform-cloudflare`). It runs the remote flows, such as cloning into Code Storage.
- **HOST-PLAN W5 (c) wires `@smthrs/platform-cloudflare`'s flow host into `worker/`** for remote flows such as `repo/Clone` ([0006](0006-repo-clone-and-view.md) R3).
- **A run belongs to one browser profile.** Other devices see its results through sync but cannot take over a running task. Closing every tab pauses the agent until the app opens again. The app requests persistent storage, because Safari may clear a site's storage after 7 days without a visit.
- **Signed-out people still can't ask Smithers** (decision [0008](0008-auth.md) §11). The model endpoint enforces it.
