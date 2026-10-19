import type { Store } from "@livestore/livestore"
import { Store as EffectStore } from "@livestore/livestore/effect"
import { schema } from "../features/chat/schema"

// One shared store for now, so every device that opens the app syncs the same conversation.
export const STORE_ID = "smithers-chat"

export type AppStoreInstance = Store<typeof schema>

// The app's store as an Effect service. Platform-neutral: each host injects the store it opened, the browser
// in livestore/store.ts, tests with LiveStore's Node adapter.
export class AppStore extends EffectStore.Tag(schema, STORE_ID) {}

// The service value for a store a host has already opened.
export const running = (store: AppStoreInstance) => ({ stage: "running" as const, store })
