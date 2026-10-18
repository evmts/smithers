/**
 * Raw row search and FTS5 operations of the SQL memory store.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import type { DatabaseService } from "../Database.ts";
import type { MemoryError } from "../MemoryError.ts";
import type { Fact, ListFactsInput, ListNotesInput, Note, Service } from "../MemoryStore.ts";
/**
 * The domain readers search pages through.
 *
 * @category models
 * @since 0.1.0
 */
export interface Readers {
    readonly readFacts: (input: ListFactsInput & {
        readonly keys?: ReadonlyArray<string> | undefined;
    }, recentFirst: boolean, after?: Fact) => Effect.Effect<ReadonlyArray<Fact>, MemoryError>;
    readonly readNotes: (input: ListNotesInput & {
        readonly ids?: ReadonlyArray<string> | undefined;
    }, recentFirst?: boolean) => Effect.Effect<ReadonlyArray<Note>, MemoryError>;
}
/**
 * Builds the raw row search and FTS5 operations over the fact and note readers.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (database: DatabaseService, { readFacts, readNotes }: Readers) => Pick<Service, "searchRows" | "enableFts" | "searchFts">;
