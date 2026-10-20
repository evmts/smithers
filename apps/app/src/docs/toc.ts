/*
 * The docs' order: each section's label and its pages, by slug. A slug names
 * pages/<slug>.md. Every page is listed exactly once (Docs.test.ts), and a
 * bare /docs opens the first page listed.
 */
export interface DocsSection {
  readonly label: string
  readonly pages: ReadonlyArray<string>
}

export const TOC: ReadonlyArray<DocsSection> = [
  { label: "Get started", pages: ["welcome", "quickstart"] },
  { label: "On your own Mac", pages: ["local-quickstart", "self-host"] },
  { label: "Flows", pages: ["flows"] }
]
