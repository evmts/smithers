/** Immutable native commit capture, without moving the editing checkout. */
import { Effect, Path } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { type ImmutableSourceOptions } from "../coding/immutable-source.ts";
import { CodingError, type Revision } from "../coding/schema.ts";
/** Check every ancestor before creating a directory or opening a destination. */
export declare const admitSourcePath: (options: ImmutableSourceOptions, root: string, relative: string) => Effect.Effect<string, CodingError, Path.Path>;
export declare const withCapturedCommit: <A, E, R>(options: ImmutableSourceOptions, commitId: string, operationId: string, use: (root: string, revision: Revision) => Effect.Effect<A, E, R>) => Effect.Effect<A, CodingError, ChildProcessSpawner.ChildProcessSpawner | Path.Path | Exclude<R, import("effect/Scope").Scope>>;
