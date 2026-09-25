/*
 * Which relay a repository's flows go through.
 *
 * Every repository's runs are planned, launched and observed through the
 * workflow relay (`/api/workflow/*`), except on a single-owner host that
 * advertises the `organization` capability: there, the one repository its
 * operator configured is served by the organization Flow host through
 * `/api/organization/*`, with the same procedures and payloads. The host
 * names that repository only to its owner (`GET /api/organization`), so it is
 * asked once per account generation and never persisted; a 404 means this
 * account has no organization repository. A failed ask is not an answer: the
 * call that needed it fails and the next call asks again, so an organization
 * run is never silently sent to another host.
 */
import {
  ORGANIZATION_PATH,
  ORGANIZATION_PROVISION_PATH,
  ORGANIZATION_RPC_PATH,
  WORKFLOW_PROVISION_PATH,
  WORKFLOW_RPC_PATH
} from "@smthrs/rpc/AgentApiRoutes"

/** The two routes one relay serves. */
export interface FlowRelayPaths {
  readonly provision: string
  readonly rpc: string
}

/** Every repository's relay unless its host says otherwise. */
export const WORKFLOW_RELAY: FlowRelayPaths = { provision: WORKFLOW_PROVISION_PATH, rpc: WORKFLOW_RPC_PATH }

/** The organization Flow host's relay, for the one configured repository. */
export const ORGANIZATION_RELAY: FlowRelayPaths = { provision: ORGANIZATION_PROVISION_PATH, rpc: ORGANIZATION_RPC_PATH }

export interface FlowRelayOptions {
  /** The host advertised `organization` in its bootstrap. */
  readonly organization: boolean
  readonly baseUrl: string
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>
  /** The account generation; a new account asks the host again. */
  readonly epoch: () => number
}

export interface FlowRelay {
  /** The relay for this repository; rejects when the host could not say. */
  readonly pathsFor: (repo: string) => Promise<FlowRelayPaths>
}

export const createFlowRelay = (options: FlowRelayOptions): FlowRelay => {
  let known: { readonly epoch: number; readonly repo: Promise<string | undefined> } | undefined

  const ask = async (): Promise<string | undefined> => {
    const response = await options.fetch(`${options.baseUrl}${ORGANIZATION_PATH}`, { headers: { accept: "application/json" } })
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`organization relay answered ${response.status}`)
    const body = (await response.json().catch(() => undefined)) as { repo?: unknown } | undefined
    if (typeof body?.repo !== "string" || body.repo === "") throw new Error("organization relay answered without a repository")
    return body.repo
  }

  const organizationRepo = (): Promise<string | undefined> => {
    const epoch = options.epoch()
    if (known?.epoch === epoch) return known.repo
    const entry = { epoch, repo: ask() }
    known = entry
    entry.repo.catch(() => {
      if (known === entry) known = undefined
    })
    return entry.repo
  }

  return {
    pathsFor: async (repo) => {
      if (!options.organization) return WORKFLOW_RELAY
      const organization = await organizationRepo()
      return organization !== undefined && organization.toLowerCase() === repo.toLowerCase() ? ORGANIZATION_RELAY : WORKFLOW_RELAY
    }
  }
}
