import type { Event } from "./schema.ts";
export declare const sourceEvent: (event: typeof Event.Type) => {
    ignored: boolean;
    payload: import("effect/Schema").Json;
    sourceRevision?: never;
} | {
    ignored: boolean;
    sourceRevision: string;
    payload: typeof Event.Type["payload"];
};
