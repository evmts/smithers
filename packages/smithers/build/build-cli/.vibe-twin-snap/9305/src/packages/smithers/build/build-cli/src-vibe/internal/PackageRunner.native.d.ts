import type * as Target from "@smthrs/targets/Target";
import * as Effect from "effect/Effect";
import * as NodeFsModule from "node:fs";
import type * as Executor from "../Executor.vibe";
import type * as GitCommit from "../GitCommit.vibe";
import type { ExecuteOptions, PackagePlan } from "./PackageOptions.vibe";
/** Promise-only I/O must settle its cleanup before its Effect releases ownership. */
export declare const joined: <A>(run: (signal: AbortSignal) => Promise<A>) => Effect.Effect<A, unknown>;
/** The node:fs/promises calls, unchanged. */
export declare const Fs: {
    realpath: (path: string) => Promise<string>;
    mkdir: (path: string, options: {
        readonly recursive: true;
    }) => Promise<string | undefined>;
    writeFile: (path: string, data: string, encoding: "utf8") => Promise<void>;
    readFile: (path: string, encoding: "utf8") => Promise<string>;
    stat: (path: string) => Promise<NodeFsModule.Stats>;
    lstat: (path: string) => Promise<NodeFsModule.Stats>;
    rm: (path: string, options: {
        readonly recursive?: boolean;
        readonly force?: boolean;
    }) => Promise<void>;
    chmod: (path: string, mode: number) => Promise<void>;
    readdir: (path: string) => Promise<string[]>;
};
/** `JSON.parse(await Fs.readFile(path, "utf8"))`: a rejection or a parse error rejects. */
export declare const readJson: (path: string) => Promise<unknown>;
/** The node:fs calls, unchanged. */
export declare const NodeFs: {
    realpathSync: (path: string) => string;
    existsSync: (path: string) => boolean;
};
/** The node:path calls, unchanged. */
export declare const NodePath: {
    join: (...paths: Array<string>) => string;
    normalize: (path: string) => string;
    dirname: (path: string) => string;
    basename: (path: string) => string;
    relative: (from: string, to: string) => string;
    isAbsolute: (path: string) => boolean;
    delimiter: ":" | ";";
    sep: "/" | "\\";
    posix: {
        dirname: (path: string) => string;
        join: (...paths: Array<string>) => string;
    };
};
/** `randomUUID()` from node:crypto. */
export declare const randomUUID: () => string;
/** `process.env`. */
export declare const processEnv: () => NodeJS.ProcessEnv;
/** Writes to this process's own stdout or stderr pipe. */
export declare const writeProcess: (stream: "stdout" | "stderr", text: string) => void;
/** `restore(Effect.suspend(() => body(scratch)))`, as PackageRunner.ts `inScratch` writes it. */
export declare const restoreSuspended: <A, E, R>(restore: <A1, E1, R1>(effect: Effect.Effect<A1, E1, R1>) => Effect.Effect<A1, E1, R1>, body: (scratch: string) => Effect.Effect<A, E, R>, scratch: string) => Effect.Effect<A, E, R>;
/** The gates' program for one commit candidate: its failures and the paths it escaped through. */
type CommitGates = (gates: ReadonlyArray<Target.AnyTarget>, candidate: GitCommit.CandidateTree) => Effect.Effect<{
    readonly outcome: ReadonlyArray<GitCommit.GateFailure>;
    readonly escaped: ReadonlyArray<string>;
}, unknown>;
/** PackageRunner.ts `commitGateRunner`'s Promise boundary, unchanged. */
export declare const commitGateRunner: (label: string, signal: AbortSignal | undefined, program: CommitGates) => GitCommit.GateRunner;
/** The composition program for one staged diff. */
type Compose = (agent: string, stagedDiff: string) => Effect.Effect<string, unknown>;
/** PackageRunner.ts `agentMessageComposer`'s Promise boundary, unchanged. */
export declare const agentMessageComposer: (signal: AbortSignal | undefined, program: Compose) => GitCommit.AgentMessage;
/** PackageRunner.ts `execute`, unchanged. */
export declare const execute: (planned: PackagePlan, options: ExecuteOptions) => Promise<Executor.Summary>;
export {};
