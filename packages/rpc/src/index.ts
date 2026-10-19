/**
 * The root entry point of @smthrs/rpc. Consumers import this entry, never a deep path.
 * Each module is a namespace, so names stay qualified (`ConfiguredModel.planModelBinding`).
 *
 * @since 1.0.0
 */
export * as AgentInstructions from "./AgentInstructions.ts"
export * as ConfiguredModel from "./ConfiguredModel.ts"
