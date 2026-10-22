---
"@smthrs/platform-cloudflare": minor
---

`SandboxObject.run(container, argv, { user, env })` runs a command in the
container for its exit code alone, its output ignored. workerd's exec pipes
hold no bytes: a command writing to a pipe nobody reads, even one line of
warning on stderr, blocks and its exit code never comes, so an exit code
awaited over the default pipes can hang forever.
