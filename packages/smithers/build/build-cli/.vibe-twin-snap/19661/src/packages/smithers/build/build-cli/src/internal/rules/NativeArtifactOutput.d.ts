/**
 * Confined publication shared by the native artifact writers.
 * @since 1.0.0
 */
/**
 * Produces a private sibling file, then publishes it after rechecking its
 * parent. The producer must create the temporary exclusively and close it
 * before returning. Cleanup never traverses a parent that failed admission.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const publish: <A>(workspaceRoot: string, output: string, produce: (temporary: string, checkParent: () => Promise<void>) => Promise<A>, signal?: AbortSignal) => Promise<A>;
