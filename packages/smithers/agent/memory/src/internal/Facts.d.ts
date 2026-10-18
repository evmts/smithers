/**
 * Fact operations of the SQL memory store.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import type { DatabaseService } from "../Database.ts";
import type { MemoryError } from "../MemoryError.ts";
import type { Fact, ListFactsInput, Service } from "../MemoryStore.ts";
type ReadFacts = (input: ListFactsInput & {
    readonly keys?: ReadonlyArray<string> | undefined;
}, recentFirst: boolean, after?: Fact) => Effect.Effect<ReadonlyArray<Fact>, MemoryError>;
/**
 * Builds the fact operations, plus the filtered reader search pages through.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (database: DatabaseService) => {
    readonly readFacts: ReadFacts;
    readonly service: Pick<Service, "putFact" | "getFact" | "deleteFact" | "listFacts" | "listAllFacts" | "deleteExpiredFacts">;
};
export {};
