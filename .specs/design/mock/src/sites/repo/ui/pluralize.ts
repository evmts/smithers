/** Shared count grammar for repository and configured product views. */
export const pluralize = (count: number, singular: string, plural = `${singular}s`) => count === 1 ? singular : plural
