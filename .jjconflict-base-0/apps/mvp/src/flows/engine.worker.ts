import wasmUrl from "@journeyapps/wa-sqlite/dist/wa-sqlite.wasm?url"
import { BrowserRuntime } from "@smthrs/platform-browser"
import { ENGINE_NAME } from "./contract"
import { clientFlows } from "./declarations"
import { engineTelemetry } from "./engine"
import { workerRegistrations } from "./registrations"

// The engine worker each tab starts (src/flows/engine.ts `tabEngine`): a program boundary, like src/main.tsx, which
// hands the host's capabilities to the program. It, not the tab, imports every client flow's declaration and steps, the
// agent's included. The worker whose tab holds the engine's Web Lock runs every client flow over SQLite in OPFS
// (decision 0011); the others wait their turn. It reaches ChatApi on the page's origin, and this device's collections
// through its own tab. Its logs, spans and metrics go to ChatApi's relay, as the tab's do.

BrowserRuntime.run({
  name: ENGINE_NAME,
  // The SQLite build loads only once this worker leads, and only in this worker's bundle.
  sqlite: {
    module: () => import("@journeyapps/wa-sqlite/dist/wa-sqlite.mjs"),
    wasm: () => fetch(wasmUrl).then((response) => response.arrayBuffer()),
  },
  flows: clientFlows,
  registerFlows: workerRegistrations(self, { origin: self.location.origin }),
  telemetry: engineTelemetry(self.location.origin),
})
