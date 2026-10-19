import { Effect, Schema } from "effect";
import { type ImmutableSourceOptions } from "../coding/immutable-source.ts";
import { NativeCoding } from "../coding/native.ts";
import { CodingError } from "../coding/schema.ts";
import type { Event } from "./schema.ts";
export declare const sourceRequest: (event: typeof Event.Type, capturedPayload: Schema.Json) => Effect.Effect<{
    readonly kind: "pull_request";
    readonly number: number;
    readonly head: string;
    readonly base: string;
} | {
    readonly kind: "push";
    readonly head: string;
    readonly base: string;
    readonly ref: string;
    readonly delivery_key: string;
} | undefined, CodingError, never>;
/** Retention imports what the lookup could not find and what it could not read. */
export declare const hasSourceCommits: (options: ImmutableSourceOptions, commits: ReadonlyArray<string>, operationId: string) => Effect.Effect<boolean, CodingError, import("effect/process/ChildProcessSpawner").ChildProcessSpawner>;
/** Absence is proven only by a lookup that answered; the rest keeps its fault class. */
export declare const heldSourceCommits: (options: ImmutableSourceOptions, commits: ReadonlyArray<string>, operationId: string) => Effect.Effect<boolean, CodingError, import("effect/process/ChildProcessSpawner").ChildProcessSpawner>;
/** Retention may populate object storage during eval/trial, but cannot edit or publish source. */
export declare const ensureSource: (options: ImmutableSourceOptions, event: typeof Event.Type, capturedPayload: Schema.Json, executionId: string) => Effect.Effect<undefined, CodingError, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | NativeCoding>;
/** The expected main comes from native bookmark authority, never an event SHA.
 * Every retained/imported source is rechecked against current main before use. */
export declare const ensureMainSource: (options: ImmutableSourceOptions, expectedMain: string) => Effect.Effect<undefined, CodingError, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | import("../coding/landing.ts").Landing | NativeCoding>;
