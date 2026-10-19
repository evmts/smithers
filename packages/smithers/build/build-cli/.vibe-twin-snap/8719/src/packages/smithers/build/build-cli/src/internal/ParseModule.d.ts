/**
 * Syntax-only parsing with TypeScript's native compiler.
 *
 * The compiler sees a closed, two-file virtual project, never the caller's
 * tsconfig, imports, libraries, or filesystem. It does not check types or emit.
 * Each call owns and closes its compiler process; the returned tree is backed
 * by the already transferred source buffer and survives closing the session.
 *
 * @since 1.0.0-rc.0
 * @private
 */
import type { SourceFile } from "typescript/unstable/ast";
/**
 * Parses one module without granting the compiler a real filesystem view.
 *
 * @since 1.0.0-rc.0
 * @private
 */
export declare const parseModule: (path: string, text: string) => SourceFile;
