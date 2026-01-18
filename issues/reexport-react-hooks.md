# Re-export Vercel AI SDK React Hooks from Smithers

<issue>
<summary>
Re-export 100% of the Vercel AI SDK React hooks (`@ai-sdk/react`) from Smithers to provide a unified API surface for AI-powered React applications. This enables developers to use both Smithers orchestration hooks and AI SDK streaming hooks from a single import.
</summary>

<motivation>
## Why This Matters

1. **Unified Developer Experience**: Developers using Smithers for AI orchestration shouldn't need to separately install and import `@ai-sdk/react`. A single `import { useChat, useSmithers } from 'smithers-orchestrator'` is cleaner.

2. **Ecosystem Compatibility**: The Vercel AI SDK is the de facto standard for AI streaming in React. Re-exporting these hooks signals that Smithers integrates seamlessly with the broader AI ecosystem.

3. **Reduced Dependency Management**: Users get AI SDK hooks "for free" with Smithers, reducing package.json complexity and version mismatch issues.

4. **Future Integration Path**: Re-exporting now enables future Smithers-specific wrappers (e.g., `useSmithersChat`) that enhance the base hooks with orchestration context.
</motivation>
</issue>

---

## Current State

### Smithers Hook Architecture

Smithers currently has two categories of hooks:

**1. Reconciler Hooks** (`src/reconciler/hooks.ts`):
```typescript
// Lifecycle hooks vendored from react-use
export const useMount = (fn: () => void) => void
export const useUnmount = (fn: () => void) => void
export const useMountedState = () => () => boolean
export const useEffectOnce = (effect: EffectCallback) => void
export const useFirstMountState = () => boolean
export const usePrevious = <T>(state: T) => T | undefined
export const useEffectOnValueChange = <T>(value: T, effect: () => void) => void
```

**2. Domain Hooks** (`src/hooks/`):
```typescript
// Smithers-specific hooks
export { useRalphCount } from './useRalphCount'
export { useHuman, useHumanInput, useHumanConfirmation } from './useHuman'
```

**3. Provider Hooks** (`src/components/SmithersProvider.tsx`):
```typescript
export function useSmithers(): SmithersContextValue
export function useRalph(): RalphContextType  // deprecated
```

**4. Reactive SQLite Hooks** (`src/reactive-sqlite/hooks/`):
```typescript
export { useQuery } from './useQuery'
export { useQueryOne } from './useQueryOne'
export { useQueryValue } from './useQueryValue'
export { useMutation } from './useMutation'
```

### AI SDK React Hooks (to be re-exported)

From `@ai-sdk/react` (see `reference/vercel-ai-sdk/packages/react/src/`):

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useChat` | Full chat interface | Message history, streaming, tool calls, status tracking |
| `useCompletion` | Text completion | Simple prompt/response, form helpers |
| `experimental_useObject` | Structured generation | Schema-based streaming, partial objects |
| `Chat` | Chat class | React-specific chat state management |

---

## Implementation Plan

<implementation>
### Phase 1: Add Dependency

Update `package.json`:

```json
{
  "dependencies": {
    "@ai-sdk/react": "^1.0.0",
    "ai": "^4.0.0"
  }
}
```

Note: `@ai-sdk/react` depends on `ai` for core types like `UIMessage`, `ChatInit`, etc.

### Phase 2: Create Re-export Module

Create `src/hooks/ai-sdk.ts`:

```typescript
/**
 * Re-exports from @ai-sdk/react
 *
 * These hooks provide streaming AI capabilities for React applications.
 * They can be used alongside Smithers orchestration hooks for full-stack AI apps.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react
 */

// ============================================================================
// CHAT HOOKS
// ============================================================================

export {
  useChat,
  type UseChatOptions,
  type UseChatHelpers,
} from '@ai-sdk/react';

export { Chat } from '@ai-sdk/react';

// ============================================================================
// COMPLETION HOOKS
// ============================================================================

export {
  useCompletion,
  type UseCompletionOptions,
  type UseCompletionHelpers,
} from '@ai-sdk/react';

// ============================================================================
// OBJECT/STRUCTURED OUTPUT HOOKS
// ============================================================================

export {
  experimental_useObject,
  type Experimental_UseObjectOptions,
  type Experimental_UseObjectHelpers,
} from '@ai-sdk/react';

// ============================================================================
// TYPES (re-exported from 'ai' core)
// ============================================================================

export type {
  UIMessage,
  CreateUIMessage,
} from '@ai-sdk/react';
```

### Phase 3: Update Main Exports

Update `src/hooks/index.ts`:

```typescript
// Smithers hooks
export { useRalphCount } from './useRalphCount'
export * from './useHuman'

// AI SDK React hooks (re-exported)
export * from './ai-sdk'
```

Update `src/index.ts` to ensure hooks are exported:

```typescript
export * from "./core/index.js";
export * from "./reconciler/index.js";
export * from "./components/index.js";
export * from "./debug/index.js";

// Add hooks export
export * from "./hooks/index.js";
```

### Phase 4: Add Package.json Export Path

Update `package.json` exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./hooks": "./src/hooks/index.ts",
    "./hooks/ai-sdk": "./src/hooks/ai-sdk.ts",
    // ... existing exports
  }
}
```

### Phase 5: Create Smithers-Enhanced Wrapper (Optional)

Create `src/hooks/useSmithersChat.ts`:

```typescript
/**
 * useSmithersChat - Enhanced useChat with Smithers integration
 *
 * Extends the AI SDK's useChat hook with:
 * - Automatic database logging of conversations
 * - Integration with SmithersProvider context
 * - Task tracking for Ralph loops
 */

import { useChat, type UseChatOptions, type UseChatHelpers } from '@ai-sdk/react';
import { useSmithers } from '../components/SmithersProvider';
import { useMount, useMountedState } from '../reconciler/hooks';
import type { UIMessage } from '@ai-sdk/react';

export interface UseSmithersChatOptions<UI_MESSAGE extends UIMessage = UIMessage>
  extends UseChatOptions<UI_MESSAGE> {
  /**
   * Log messages to Smithers database
   * @default true
   */
  logToDb?: boolean;

  /**
   * Task name for Ralph tracking
   */
  taskName?: string;
}

export function useSmithersChat<UI_MESSAGE extends UIMessage = UIMessage>(
  options: UseSmithersChatOptions<UI_MESSAGE> = {}
): UseChatHelpers<UI_MESSAGE> {
  const { logToDb = true, taskName, ...chatOptions } = options;
  const { db, executionId } = useSmithers();
  const isMounted = useMountedState();

  const chat = useChat<UI_MESSAGE>({
    ...chatOptions,
    onFinish: async (result) => {
      if (!isMounted()) return;

      // Log to database if enabled
      if (logToDb && db) {
        // TODO: Implement conversation logging
        // await db.conversations.log(executionId, result.messages);
      }

      // Call user's onFinish
      await chatOptions.onFinish?.(result);
    },
    onError: (error) => {
      if (!isMounted()) return;

      // Log error to database
      if (logToDb && db) {
        // TODO: Implement error logging
        // db.errors.log(executionId, error);
      }

      chatOptions.onError?.(error);
    },
  });

  // Track as task if taskName provided
  useMount(() => {
    if (taskName && db) {
      // TODO: Register task with db.tasks.start()
    }
  });

  return chat;
}
```
</implementation>

---

## Complete Export List

<exports>
The following should be re-exported from `@ai-sdk/react`:

### Hooks
- `useChat` - Full chat interface with message history and streaming
- `useCompletion` - Simple text completion without history
- `experimental_useObject` - Structured object generation with streaming

### Classes
- `Chat` - React-specific chat state management class

### Types
```typescript
// From useChat
type UseChatOptions<UI_MESSAGE>
type UseChatHelpers<UI_MESSAGE>

// From useCompletion
type UseCompletionOptions
type UseCompletionHelpers

// From useObject
type Experimental_UseObjectOptions<SCHEMA, RESULT>
type Experimental_UseObjectHelpers<RESULT, INPUT>

// Message types (from 'ai' core, re-exported by @ai-sdk/react)
type UIMessage
type CreateUIMessage
```
</exports>

---

## Verification Checklist

<verification>
After implementation, verify:

1. **Import works from main entry**:
   ```typescript
   import { useChat, useSmithers, useMount } from 'smithers-orchestrator';
   ```

2. **Import works from hooks subpath**:
   ```typescript
   import { useChat } from 'smithers-orchestrator/hooks';
   import { useChat } from 'smithers-orchestrator/hooks/ai-sdk';
   ```

3. **Types are properly exported**:
   ```typescript
   import type { UseChatHelpers, UIMessage } from 'smithers-orchestrator';
   ```

4. **No bundle size regression**: Tree-shaking should work - unused hooks shouldn't be bundled.

5. **TypeScript compiles**: Run `bun run typecheck`

6. **Tests pass**: Run `bun test`
</verification>

---

## Documentation Updates

<documentation>
### README.md Addition

Add a section on AI SDK integration:

```markdown
## AI SDK React Hooks

Smithers re-exports all React hooks from `@ai-sdk/react` for convenience:

\`\`\`tsx
import { useChat, useCompletion, useSmithers } from 'smithers-orchestrator';

function ChatUI() {
  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
  });

  const { db } = useSmithers();

  return (
    <div>
      {messages.map(m => <Message key={m.id} message={m} />)}
      <input onKeyDown={e => {
        if (e.key === 'Enter') sendMessage(e.currentTarget.value);
      }} />
    </div>
  );
}
\`\`\`

For Smithers-specific integration, use `useSmithersChat`:

\`\`\`tsx
import { useSmithersChat } from 'smithers-orchestrator';

function TrackedChat() {
  // Automatically logs to database and tracks as task
  const chat = useSmithersChat({
    api: '/api/chat',
    taskName: 'user-conversation',
    logToDb: true,
  });

  // ...
}
\`\`\`
```

### JSDoc Comments

Ensure all re-exports have JSDoc pointing to AI SDK docs:

```typescript
/**
 * React hook for building chat interfaces with streaming support.
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-react/use-chat
 * @example
 * ```tsx
 * const { messages, sendMessage, status } = useChat({
 *   api: '/api/chat',
 * });
 * ```
 */
export { useChat } from '@ai-sdk/react';
```
</documentation>

---

## Migration Notes

<migration>
### For Existing Smithers Users

No breaking changes. This is purely additive.

### For Users Coming from AI SDK

If you were previously using:
```typescript
import { useChat } from '@ai-sdk/react';
```

You can now use:
```typescript
import { useChat } from 'smithers-orchestrator';
```

Both work - choose based on whether you need other Smithers exports in the same file.
</migration>

---

## Dependencies to Add

<dependencies>
```json
{
  "dependencies": {
    "@ai-sdk/react": "^1.0.0",
    "ai": "^4.0.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  }
}
```

Note: Check the latest versions at:
- https://www.npmjs.com/package/@ai-sdk/react
- https://www.npmjs.com/package/ai
</dependencies>

---

## Files to Create/Modify

<files>
| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `@ai-sdk/react` and `ai` dependencies |
| `src/hooks/ai-sdk.ts` | Create | Re-export all AI SDK React hooks |
| `src/hooks/index.ts` | Modify | Add `export * from './ai-sdk'` |
| `src/hooks/useSmithersChat.ts` | Create | Optional Smithers-enhanced wrapper |
| `src/index.ts` | Modify | Add `export * from "./hooks/index.js"` |
</files>

---

## Acceptance Criteria

<acceptance>
- [ ] `@ai-sdk/react` added as dependency
- [ ] All hooks (`useChat`, `useCompletion`, `experimental_useObject`) re-exported
- [ ] `Chat` class re-exported
- [ ] All associated types re-exported
- [ ] TypeScript compiles without errors
- [ ] Imports work from `'smithers-orchestrator'`
- [ ] Imports work from `'smithers-orchestrator/hooks'`
- [ ] Tree-shaking verified (unused exports don't bloat bundle)
- [ ] JSDoc comments added with links to AI SDK docs
- [ ] Optional: `useSmithersChat` wrapper implemented
</acceptance>
