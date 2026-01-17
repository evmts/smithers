/**
 * Test helpers
 *
 * These helpers allow us to create elements without using JSX syntax,
 * bypassing Bun's JSX transformation issues.
 */
export declare function h(type: string | Function, props: any, ...children: any[]): () => any;
