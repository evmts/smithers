/**
 * Note, status, and supersession operations of the SQL memory store.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import type { DatabaseService } from "../Database.ts";
import type { MemoryError } from "../MemoryError.ts";
import type { ListNotesInput, Note, Service } from "../MemoryStore.ts";
type ReadNotes = (input: ListNotesInput & {
    readonly ids?: ReadonlyArray<string> | undefined;
}, recentFirst?: boolean) => Effect.Effect<ReadonlyArray<Note>, MemoryError>;
/**
 * Builds the note operations, plus the filtered reader search pages through.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (database: DatabaseService) => {
    readonly readNotes: ReadNotes;
    readonly service: Pick<Service, "putNote" | "getNote" | "setNoteStatus" | "supersede" | "listNotes">;
};
export {};
