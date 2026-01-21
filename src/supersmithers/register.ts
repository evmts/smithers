// Bun preload entrypoint.
// Side-effect import registers the Bun plugin at startup.
// 
// Usage in bunfig.toml:
//   preload = ["smithers-orchestrator/supersmithers/register"]
//
// Or for local development:
//   preload = ["./src/supersmithers/register.ts"]

import './plugin.js'

export {}
