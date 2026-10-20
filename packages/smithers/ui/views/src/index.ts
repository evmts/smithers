/**
 * Generated views as safe arbitrary output.
 *
 * A renderer agent writes a TSX module. {@link ViewCode} checks and compiles
 * it, {@link PresentationRealm} renders it to HTML inside a QuickJS realm with
 * a presentation bundle built from {@link Presentation}, and a trusted page
 * shows the HTML in a frame {@link ViewCsp} writes. The frame talks back over
 * the {@link Bridge}, sending only the events the module's
 * {@link Interactions} declare.
 *
 * @since 0.1.0
 */

/**
 * @category messaging
 * @since 0.1.0
 */
export { Bridge } from "@smthrs/view-frame"

/**
 * @category messaging
 * @since 0.1.0
 */
export { Interactions } from "@smthrs/view-frame"

/**
 * @category rendering
 * @since 0.1.0
 */
export * as Presentation from "./Presentation.ts"

/**
 * @category rendering
 * @since 0.1.0
 */
export * as PresentationRealm from "./PresentationRealm.ts"

/**
 * @category checking
 * @since 0.1.0
 */
export * as ViewCode from "./ViewCode.ts"

/**
 * @category framing
 * @since 0.1.0
 */
export { ViewCsp } from "@smthrs/view-frame"
