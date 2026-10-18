/**
 * Loading an Agent Skills document through the public Markdown API.
 *
 * @since 1.0.0-rc.7
 */
import * as Markdown from "@smthrs/core/Markdown"

/**
 * Loads a skill as a flow declaration, returning a typed failure for invalid
 * frontmatter. The host supplies the implementation before execution.
 *
 * @param document - Complete SKILL.md text, including leading YAML frontmatter.
 * @returns A Result containing the declaration or a MarkdownError.
 * @category constructors
 * @since 1.0.0-rc.7
 */
export const loadSkill = (document: string) => Markdown.lowerSkill(document)

/**
 * A complete skill document with advisory collaborator names.
 *
 * @category models
 * @since 1.0.0-rc.7
 */
export const exampleSkill = `---
name: summarize-changes
description: Summarize repository changes
allowed-tools: Read Search
---
Summarize the changes and their validation results.
`
