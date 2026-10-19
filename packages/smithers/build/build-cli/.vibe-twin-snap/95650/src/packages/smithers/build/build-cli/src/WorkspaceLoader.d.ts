/**
 * WORKSPACE.ts module validation.
 *
 * The workspace module exports exactly one `Workspace` declaration under the
 * export name `Workspace`. It may import its `.smithers/agents.js` and
 * `.smithers/sandbox.js` siblings and the root Package for git hooks; the
 * relationship is one-way — no Package module may import WORKSPACE.ts, which
 * the loader's static import scan enforces.
 *
 * @since 0.1.0
 */
import * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
/**
 * Validates one evaluated workspace module namespace.
 *
 * @category loading
 * @since 0.1.0
 */
export declare const validateWorkspaceModule: (namespace: unknown, file: string) => WorkspaceDeclaration.WorkspaceDeclaration;
