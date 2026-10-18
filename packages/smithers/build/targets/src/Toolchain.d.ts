/**
 * Branded, inert workspace toolchain declarations.
 *
 * @since 0.1.0
 */
/** Runtime marker shared by every workspace toolchain declaration. */
export declare const TypeId: unique symbol;
/** */
export interface Declaration<Tag extends string = string> {
    readonly [TypeId]: typeof TypeId;
    readonly _tag: Tag;
}
/** */
export declare const declare: <A extends {
    readonly _tag: string;
}>(value: A) => A & Declaration<A["_tag"]>;
/** */
export declare const isDeclaration: (value: unknown) => value is Declaration;
