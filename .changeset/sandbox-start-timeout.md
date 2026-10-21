---
"@smthrs/platform-cloudflare": minor
---

`SandboxObject.wake` takes `startTimeoutMs`: a stopped container's start that
runs past it is abandoned and fails `SandboxObject.StartTimedOut`, a typed
error a caller can settle on (a timeout around the whole call would be a
defect), counted in `smithers_cloudflare_sandbox_start_timeouts`.
