/* Quiet count; pass a number as children (or count). Zero remains visible. */
export const Counter = ({ children, count }: { children?: number; count?: number }) => <span className="repo-ui-counter">{children ?? count ?? 0}</span>
