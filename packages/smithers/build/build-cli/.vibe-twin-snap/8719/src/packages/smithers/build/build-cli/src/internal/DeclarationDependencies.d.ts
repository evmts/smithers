/**
 * Checks the physical runtime selected by ordinary Node package resolution.
 *
 * `findPackageJSON` uses Node's default resolver on the supported runtimes,
 * independently of installed resolve hooks. A bootstrap alias therefore cannot
 * hide a conflicting workspace installation from this check. This is a physical
 * installation check, not proof of identity across arbitrary loader namespaces.
 *
 * @since 1.0.0
 */
/**
 * Refuses a declaration closure that would select another physical runtime.
 *
 * Missing packages remain admissible only when the caller explicitly requests
 * the existing dependency-free bootstrap contract. Installed conflicts and
 * resolution errors always fail, including in bootstrap mode.
 *
 * @category validation
 * @since 1.0.0
 */
export declare const assertDeclarationDependencies: (files: ReadonlyArray<string>, options: {
    readonly bootstrap: boolean;
}) => void;
