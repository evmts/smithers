/**
 * Re-exports from @ai-sdk/react (optional dependency).
 *
 * These hooks provide streaming AI capabilities for React applications.
 * Currently commented out due to module resolution issues.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react
 */

// @ai-sdk/react is listed in package.json but TypeScript cannot resolve the module.
// This may be due to:
// - Missing/corrupted node_modules (run `bun install`)
// - Package export map incompatibility with current TypeScript/Bun config
//
// Uncomment the exports below once the module resolves correctly:

export {}

// ============================================================================
// CHAT HOOKS
// ============================================================================

// export { useChat, Chat } from '@ai-sdk/react'
// export type { UseChatOptions, UseChatHelpers } from '@ai-sdk/react'

// ============================================================================
// COMPLETION HOOKS
// ============================================================================

// export { useCompletion } from '@ai-sdk/react'
// export type { UseCompletionOptions, UseCompletionHelpers } from '@ai-sdk/react'

// ============================================================================
// OBJECT/STRUCTURED OUTPUT HOOKS
// ============================================================================

// export { experimental_useObject } from '@ai-sdk/react'
// export type {
//   Experimental_UseObjectOptions,
//   Experimental_UseObjectHelpers,
// } from '@ai-sdk/react'

// ============================================================================
// TYPES
// ============================================================================

// export type { UIMessage, CreateUIMessage } from '@ai-sdk/react'
