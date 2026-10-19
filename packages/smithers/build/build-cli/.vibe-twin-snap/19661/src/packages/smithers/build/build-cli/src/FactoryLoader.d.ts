/**
 * FACTORY.ts module validation.
 *
 * The factory module sits beside `WORKSPACE.ts` (`.smithers/FACTORY.ts`, or
 * the root `FACTORY.ts` beside a root `WORKSPACE.ts`) and exports exactly one
 * factory declaration under the export name `factory`, and at most one home
 * declaration under the export name `home`. It may import `WORKSPACE.ts`
 * and its siblings; it never imports a `PACKAGE.ts`, which the loader's
 * static import scan enforces, because a factory names the targets it needs
 * by label (`S.label("//:ci")`) and never by value. `Smithers.Flow` values
 * exported beside the factory are plain data and pass through.
 *
 * @since 1.0.0
 */
import * as Factory from "@smthrs/targets/Factory";
import * as Home from "@smthrs/targets/Home";
/**
 * One evaluated, validated FACTORY.ts module.
 *
 * @category models
 * @since 1.0.0
 */
export interface LoadedFactory {
    /** The workspace-relative module path, `.smithers/FACTORY.ts`. */
    readonly file: string;
    /** The validated factory declaration. */
    readonly factory: Factory.Declaration;
    /** The validated home declaration, when the module exports one. */
    readonly home: Home.Declaration | undefined;
}
/**
 * The factory declaration file beside one workspace declaration file:
 * `.smithers/FACTORY.ts` beside `.smithers/WORKSPACE.ts`, `FACTORY.ts`
 * beside a root `WORKSPACE.ts`.
 *
 * @category discovery
 * @since 1.0.0
 */
export declare const factoryFileBeside: (workspaceFile: string) => string;
/**
 * Validates one evaluated factory module namespace.
 *
 * @category loading
 * @since 1.0.0
 */
export declare const validateFactoryModule: (namespace: unknown, file: string) => LoadedFactory;
