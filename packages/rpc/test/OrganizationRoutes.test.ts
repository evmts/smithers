import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  ORGANIZATION_PATH,
  ORGANIZATION_PROVISION_PATH,
  ORGANIZATION_RPC_PATH,
  WORKFLOW_RPC_PATH
} from "../src/AgentApiRoutes.ts"
import { AppBootstrapSchema, hasCapability, RuntimeCapabilitySchema } from "../src/AppBootstrap.ts"

const compose = (file: string): string =>
  readFileSync(join(import.meta.dirname, "../../backend/internal/compose", file), "utf8")

describe("organization relay contract", () => {
  test("the Go composition mounts every organization route the client calls", () => {
    const relay = compose("browser_flow.go")
    expect(relay).toContain(`Get("${ORGANIZATION_PATH}"`)
    expect(relay).toContain(`Post("${ORGANIZATION_PROVISION_PATH}"`)
    expect(relay).toContain(`Post("${ORGANIZATION_RPC_PATH}"`)
    expect(compose("main.go")).toContain("mountOrganizationRelay(")
    expect(ORGANIZATION_RPC_PATH).not.toBe(WORKFLOW_RPC_PATH)
  })

  test("the capability the Go bootstrap emits is one the client accepts", () => {
    expect(compose("bootstrap.go")).toContain(`"organization"`)
    expect(RuntimeCapabilitySchema.parse("organization")).toBe("organization")
    const bootstrap = AppBootstrapSchema.parse({
      apiVersion: 1,
      host: "local",
      version: "dev",
      buildSha: "abc",
      capabilities: ["identity", "cloud", "organization"],
      authFlow: "credentials",
      sandbox: { platform: "darwin", mode: "trusted-only" }
    })
    expect(hasCapability(bootstrap, "organization")).toBe(true)
  })
})
