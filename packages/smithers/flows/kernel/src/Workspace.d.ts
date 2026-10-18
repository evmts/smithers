/**
 * The workspace root used to make filesystem capability resources stable.
 *
 * It lives beside the closed host list rather than in a platform package: a
 * workspace root is a policy decision the kernel needs before it can name a
 * filesystem capability, not something a platform can answer.
 *
 * Governing design:
 * `docs/specs/Concepts/Effect Taxonomy.md` and
 * `docs/specs/Concepts/Permission Kernel.md`.
 *
 * @since 1.0.0-rc.0
 */
import { Context, Layer } from "effect";
/**
 * Workspace-root configuration.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Service {
    readonly root: string;
}
declare const Workspace_base: Context.ServiceClass<Workspace, "@smthrs/kernel/Workspace", Service>;
/**
 * The workspace-root service tag.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export declare class Workspace extends Workspace_base {
}
/**
 * Constructs workspace-root configuration.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const make: (root: string) => Service;
/**
 * Provides a workspace root.
 *
 * @category layers
 * @since 1.0.0-rc.0
 */
export declare const layer: (root: string) => Layer.Layer<Workspace>;
/**
 * Constructs a relative workspace-root stub for tests.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const makeNoop: Service;
/**
 * Provides a relative workspace-root stub for tests.
 *
 * @category layers
 * @since 1.0.0-rc.0
 */
export declare const layerNoop: Layer.Layer<Workspace>;
export {};
