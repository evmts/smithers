/**
 * Shared Plue gateway workspace identity validation.
 *
 * @since 1.0.0
 */

import { z } from "zod"

/**
 * Canonical hosted workspace UUID.
 *
 * @category guards
 * @since 1.0.0
 */
export const isGatewayWorkspaceId = (value: unknown): value is string =>
  typeof value === "string" && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) &&
    value !== "00000000-0000-0000-0000-000000000000")

/**
 * The persisted UI and Worker use the same workspace identity.
 *
 * @category schemas
 * @since 1.0.0
 */
export const GatewayWorkspaceIdSchema = z.string().refine(isGatewayWorkspaceId, "Invalid gateway workspace ID")

/** A local gateway names its workspace by the first 16 hex digits of the root's SHA-256.
 * @category schemas
 * @since 1.0.0
 */
export const LocalGatewayWorkspaceIdSchema = z.string().regex(/^[0-9a-f]{16}$/, "Invalid local gateway workspace ID")

/** Local hashes are accepted only by an explicitly local card payload.
 * @category schemas
 * @since 1.0.0
 */
export const GatewayCardWorkspaceIdSchema = z.union([GatewayWorkspaceIdSchema, LocalGatewayWorkspaceIdSchema])

/** Marked local payloads retain their transport across persistence.
 * @category schemas
 * @since 1.0.0
 */
export const gatewayCardPayload = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, localGateway: z.literal(true).optional() }).superRefine((payload, context) => {
    const bound = payload as Record<string, unknown>
    const check = (value: unknown, path: Array<string | number>) => {
      if (!value || typeof value !== "object") return
      const id = (value as Record<string, unknown>).workspaceId
      if (typeof id === "string" && /^[0-9a-f]{16}$/.test(id) && bound.localGateway !== true) {
        context.addIssue({
          code: "custom",
          message: "A local workspace requires a local gateway card.",
          path: [...path, "workspaceId"]
        })
      }
    }
    check(bound, [])
    check(bound.listRequest, ["listRequest"])
    if (Array.isArray(bound.preparations)) {
      bound.preparations.forEach((row, index) => check(row, ["preparations", index]))
    }
  })
