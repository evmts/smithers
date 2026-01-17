/**
 * Test helpers
 *
 * These helpers allow us to create elements without using JSX syntax,
 * bypassing Bun's JSX transformation issues.
 */
// Simple createElement helper that mimics JSX but returns a function for rendering
export function h(type, props, ...children) {
    if (typeof type === 'function') {
        return () => type({ ...(props || {}), children: children.length === 1 ? children[0] : children });
    }
    // For intrinsic elements, return a function that creates the element
    return () => {
        const element = { type, props: props || {}, children: [] };
        return element;
    };
}
