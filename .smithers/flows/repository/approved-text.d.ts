import type { Event, Record, SourceStatus } from "./schema.ts";
type Approved = NonNullable<typeof Event.Type["approvedText"]>;
/** The event's snapshot, or nothing when its revision does not name its text. */
export declare const approvedText: (event: typeof Event.Type) => Approved | undefined;
/** The subject with its title and body replaced by the snapshot. */
export declare const pinApprovedSubject: (approved: Approved | undefined, live: Readonly<globalThis.Record<string, unknown>>) => globalThis.Record<string, unknown>;
/** History records with the subject's record pinned to the snapshot. */
export declare const pinApprovedRecords: (event: typeof Event.Type, records: ReadonlyArray<typeof Record.Type>) => {
    readonly records: ReadonlyArray<typeof Record.Type>;
    readonly sources: ReadonlyArray<typeof SourceStatus.Type>;
    readonly drift: boolean;
};
export {};
