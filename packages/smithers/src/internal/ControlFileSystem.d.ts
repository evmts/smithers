/**
 * The shared descriptor-relative filesystem for native control hosts.
 * @since 1.0.0
 */
import * as AtomicFileSystem from "@smthrs/platform-node/AtomicFileSystem";
/**
 * Bind native controls to the guarded filesystem layer.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layer: () => typeof AtomicFileSystem.layer;
