import { readFileSync } from "node:fs"
import { mergeConfig } from "vitest/config"
import base from "./vitest.config.ts"
export default mergeConfig(base, {
  plugins: [{
    name: "s142-head-agent-session",
    enforce: "pre",
    load(id: string) {
      if (id.split("?")[0]!.endsWith("/agent/src/AgentSession.ts")) return readFileSync("/private/tmp/claude-501/-Users-williamcory-smithers/ae401ad3-ba4e-43bc-b6c8-e85e320dcf11/scratchpad/s142/AgentSession.head.ts", "utf8")
    }
  }]
})
