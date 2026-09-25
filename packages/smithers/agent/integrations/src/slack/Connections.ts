/**
 * Which Slack connection an action reaches the workspace through.
 *
 * A durable Slack action names a `connectionId` and a channel in its payload,
 * and both are journal-safe data. The host decides what they mean: it builds
 * one {@link Resolved} per configured `Connection`, each with a client whose
 * tokens come from the credential broker, and provides them as
 * {@link SlackConnections}. Resolution is where the connection's container
 * allowlist is enforced: an action may only post to a channel the connection
 * lists, and an unknown connection or an unlisted channel is refused
 * `permission-denied` before any request is made. An empty container list
 * admits nothing.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer } from "effect"
import type { Connection } from "../core/Connection.ts"
import { IntegrationError, isIntegrationError } from "../core/IntegrationError.ts"
import type { SlackConfig } from "./Config.ts"
import { make as makeClient, type SlackClient, type Tokens } from "./SlackClient.ts"

/**
 * One configured connection and the client that acts for it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Resolved {
  readonly connection: Connection
  readonly client: SlackClient
}

/**
 * The resolver a Slack action asks for its client.
 *
 * @category services
 * @since 0.1.0
 */
export interface SlackConnections {
  /** The client for `connectionId`, once `channel` is in the connection's containers. */
  readonly resolve: (connectionId: string, channel: string) => Effect.Effect<SlackClient, IntegrationError>
}

/**
 * Service tag for the Slack connection resolver.
 *
 * @category services
 * @since 0.1.0
 */
export const SlackConnections: Context.Service<SlackConnections, SlackConnections> = Context.Service(
  "@smthrs/integrations/SlackConnections"
)

const denied = (message: string, details: Record<string, unknown>): IntegrationError =>
  new IntegrationError("permission-denied", message, { ...details, retryable: false, outcomeUnknown: false })

/**
 * Builds the resolver over configured connections.
 *
 * Throws `IntegrationError` with reason `invalid-config` for a connection
 * whose provider is not `slack` and for a duplicated connection id.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (entries: ReadonlyArray<Resolved>): SlackConnections => {
  const byId = new Map<string, Resolved>()
  for (const entry of entries) {
    const id = entry.connection.id
    if (entry.connection.provider !== "slack" || byId.has(id)) {
      throw new IntegrationError("invalid-config", `Slack connection ${id} is not a distinct Slack connection.`, {
        connectionId: id,
        provider: entry.connection.provider,
        retryable: false
      })
    }
    byId.set(id, entry)
  }
  return SlackConnections.of({
    resolve: (connectionId, channel) => {
      const entry = byId.get(connectionId)
      if (entry === undefined) {
        return Effect.fail(denied(`Slack connection ${connectionId} is not configured.`, { connectionId }))
      }
      return entry.connection.containers.includes(channel)
        ? Effect.succeed(entry.client)
        : Effect.fail(denied(`Slack connection ${connectionId} does not grant channel ${channel}.`, {
          connectionId,
          channel
        }))
    }
  })
}

/**
 * Layer for the resolver. A config error is a typed layer failure.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (entries: ReadonlyArray<Resolved>): Layer.Layer<SlackConnections, IntegrationError> =>
  Layer.effect(SlackConnections)(Effect.suspend(() => {
    try {
      return Effect.succeed(make(entries))
    } catch (error) {
      if (isIntegrationError(error)) return Effect.fail(error)
      throw error
    }
  }))

/**
 * A client for one connection: pinned to the connection's API origin, with
 * tokens only from `tokens`, never from the environment.
 *
 * Throws `IntegrationError` with reason `invalid-config` for a bad limit or
 * API origin.
 *
 * @category constructors
 * @since 0.1.0
 */
export const clientFor = (
  connection: Connection,
  tokens: Tokens,
  config: Omit<SlackConfig, "botToken" | "appToken" | "signingSecret" | "apiBaseUrl"> = {}
): SlackClient => makeClient({ ...config, apiBaseUrl: connection.apiBaseUrl }, {}, tokens)
