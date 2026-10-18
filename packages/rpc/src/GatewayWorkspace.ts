/**
 * Shared Plue gateway workspace identity validation.
 *
 * @since 1.0.0
 */

import { z } from "zod"

/**
 * Canonical hosted UUID or local serve workspace hash.
 *
 * @category guards
 * @since 1.0.0
 */
export const isGatewayWorkspaceId = (value: unknown): value is string =>
  typeof value === "string" && (/^[0-9a-f]{16}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) &&
  value !== "00000000-0000-0000-0000-000000000000")

/**
 * The persisted UI and Worker use the same workspace identity.
 *
 * @category schemas
 * @since 1.0.0
 */
export const GatewayWorkspaceIdSchema = z.string().refine(isGatewayWorkspaceId, "Invalid gateway workspace ID")
