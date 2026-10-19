import type * as Rule from "../RuleContract.vibe";
type Selection = Extract<Rule.Selection, {
    readonly rule: "Docs.Check";
}> & {
    readonly writeSet: ReadonlyArray<string>;
};
/** `contract.execute`: writes or judges the planned stamp. */
export declare const execute: (node: Rule.Planned<Selection>, { root, signal }: Rule.ExecutionContext) => Promise<{
    readonly output?: unknown;
    readonly note?: string;
}>;
export {};
