import type * as LocalRepository from "@smthrs/targets/LocalRepository";
import * as RepoTarget from "@smthrs/targets/RepoTarget";
import * as Target from "@smthrs/targets/Target";
import type * as PackageIndex from "./PackageIndex.vibe";
import { type execute as Execute, type GitState, type Resolution, type Resolver } from "./RepoResolution.vibe";
/** RepoResolution.vibe's private helpers. */
export interface Helpers {
    readonly tail: (value: string) => string;
    readonly kindNames: ReadonlySet<string>;
    readonly repositoryOf: (index: PackageIndex.PackageIndex, value: string | LocalRepository.Declaration) => {
        readonly name: string;
        readonly path: string;
    } | undefined;
    readonly refused: (index: PackageIndex.PackageIndex, attrs: RepoTarget.TargetAttrs, message: string) => Resolution;
}
/** `query`, unchanged. */
export declare const query: (resolver: Resolver, target: Target.AnyTarget, signal: AbortSignal | undefined, { kindNames, refused, repositoryOf, tail }: Helpers) => Promise<Resolution>;
/** `effectiveKinds`, unchanged. */
export declare const effectiveKinds: (resolver: Resolver, target: Target.AnyTarget, signal?: AbortSignal | undefined) => Promise<ReadonlyArray<Target.Kind>>;
/** `gitState`, unchanged. */
export declare const gitState: (resolver: Resolver, resolution: Resolution, signal: AbortSignal | undefined, { tail }: Helpers) => Promise<GitState>;
/** `execute`, unchanged. */
export declare const execute: (resolver: Resolver, resolution: Resolution, options: Parameters<typeof Execute>[2] & {}, { tail }: Helpers) => Promise<void>;
