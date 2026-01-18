/**
 * Re-exports from @ai-sdk/react.
 *
 * These hooks provide streaming AI capabilities for React applications.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react
 */

// ============================================================================
// CHAT HOOKS
// ============================================================================

/**
 * React hook for building chat interfaces with streaming support.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react/use-chat
 */
export { useChat, Chat } from '@ai-sdk/react'
export type { UseChatOptions, UseChatHelpers } from '@ai-sdk/react'

// ============================================================================
// COMPLETION HOOKS
// ============================================================================

/**
 * React hook for text completion with streaming support.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react/use-completion
 */
export { useCompletion } from '@ai-sdk/react'
export type { UseCompletionOptions, UseCompletionHelpers } from '@ai-sdk/react'

// ============================================================================
// OBJECT/STRUCTURED OUTPUT HOOKS
// ============================================================================

/**
 * React hook for structured object generation with streaming support.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react/use-object
 */
export { experimental_useObject } from '@ai-sdk/react'
export type {
  Experimental_UseObjectOptions,
  Experimental_UseObjectHelpers,
} from '@ai-sdk/react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Core message types from the AI SDK.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react/use-chat
 */
export type { UIMessage, CreateUIMessage } from '@ai-sdk/react'
