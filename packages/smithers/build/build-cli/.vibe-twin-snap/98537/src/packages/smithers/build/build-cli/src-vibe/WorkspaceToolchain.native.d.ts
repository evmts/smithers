import * as PackageManager from "@smthrs/targets/PackageManager";
import * as Runtime from "@smthrs/targets/Runtime";
import type * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
import type { ResolvedWorkspaceToolchain } from "./WorkspaceToolchain.vibe";
/** WorkspaceToolchain.vibe's private helpers. */
export interface Helpers {
    readonly runtimeOf: (declared: unknown) => Runtime.Runtime | undefined;
    readonly managerOf: (workspace: WorkspaceDeclaration.WorkspaceDeclaration, runtime: Runtime.Runtime | undefined) => PackageManager.PackageManager | undefined;
    readonly requirement: (value: unknown, what: string) => string;
    readonly isRecord: (value: unknown) => value is Record<string, unknown>;
}
/** `resolve`, unchanged. */
export declare const resolve: (workspace: WorkspaceDeclaration.WorkspaceDeclaration, options: {
    readonly root: string;
    readonly signal?: AbortSignal | undefined;
}, { isRecord, managerOf, requirement, runtimeOf }: Helpers) => Promise<ResolvedWorkspaceToolchain>;
