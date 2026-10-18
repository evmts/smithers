import type { RuntimeCapability } from "@smthrs/rpc/AppBootstrap"
import type { RepositoryHome } from "@smthrs/rpc/RepositoryHome"
export interface SpecRepository {
  readonly name: string
  readonly files: Readonly<Record<string, string>>
  readonly home: RepositoryHome
  readonly issues: ReadonlyArray<{ number: number; title: string; state: "open" | "closed" }>
}
export interface World {
  readonly clock: string
  readonly seed: number
  readonly capabilities: ReadonlyArray<RuntimeCapability>
  readonly ahead: Readonly<Partial<Record<RuntimeCapability, string>>>
  readonly viewer: { readonly username: string } | null
  readonly repos: ReadonlyArray<SpecRepository>
  readonly variants: { readonly access?: "allowed" | "denied"; readonly as: "out" | "member"; readonly data: "full" | "empty"; readonly net: "ok" | "slow" | "error" }
}
export const world = (value: World): World => value
