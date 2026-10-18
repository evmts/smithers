/**
 * Thread and message operations of the SQL memory store.
 *
 * @since 0.1.0
 */
import type * as Crypto from "effect/Crypto";
import type { DatabaseService } from "../Database.ts";
import type { Service } from "../MemoryStore.ts";
/**
 * Builds the thread and message operations.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (database: DatabaseService, crypto: Crypto.Crypto) => Pick<Service, "createThread" | "getThread" | "listThreads" | "deleteThread" | "appendMessage" | "listMessages" | "countMessages" | "messageStats" | "listThreadIds" | "deleteMessages" | "compactMessages">;
