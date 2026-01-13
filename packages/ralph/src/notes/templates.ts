import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getCommitMessage, getCommitShortHash } from '../utils/git.js'

export const noteTemplates = {
  conversation: `## Conversation Context

**User Request:**
[What the user asked for]

**Discussion:**
[Key points discussed]
- Decision point 1
- Decision point 2

**Alternatives Considered:**
- Alternative A: [Why rejected]
- Alternative B: [Why rejected]

**Final Decision:**
[What was implemented and why]

**Related Commits:**
- [commit hash]: [description]
`,

  decision: `## Design Decision

**Problem:**
[What problem needed solving]

**Solution:**
[What was implemented]

**Trade-offs:**
- Pro: [advantage]
- Con: [disadvantage]

**Context:**
[Additional context that influenced the decision]
`,

  context: `## Context

**Summary:**
[Brief summary of this commit]

**Background:**
[Relevant background information]

**Impact:**
[What this change affects]

**Notes:**
[Additional notes]
`,
}

export type NoteTemplate = keyof typeof noteTemplates

export async function fillTemplate(templateName: NoteTemplate, commit: string): Promise<string> {
  const template = noteTemplates[templateName]

  if (!template) {
    throw new Error(`Template not found: ${templateName}`)
  }

  // Get commit info
  const message = getCommitMessage(commit)
  const shortHash = getCommitShortHash(commit)

  // Open editor with template
  const tmpFile = path.join(os.tmpdir(), `ralph-note-${shortHash}.md`)
  fs.writeFileSync(tmpFile, template)

  const editor = process.env.EDITOR || process.env.VISUAL || 'vim'

  try {
    execSync(`${editor} ${tmpFile}`, { stdio: 'inherit' })
  } catch (error) {
    fs.unlinkSync(tmpFile)
    throw new Error(`Editor exited with error: ${error}`)
  }

  const content = fs.readFileSync(tmpFile, 'utf-8')
  fs.unlinkSync(tmpFile)

  return content
}

export async function openEditorForNote(commit: string): Promise<string> {
  const shortHash = getCommitShortHash(commit)
  const message = getCommitMessage(commit)

  const initialContent = `# Git Note for ${shortHash}

Commit message: ${message.split('\n')[0]}

---

[Add your context here]
`

  const tmpFile = path.join(os.tmpdir(), `ralph-note-${shortHash}.md`)
  fs.writeFileSync(tmpFile, initialContent)

  const editor = process.env.EDITOR || process.env.VISUAL || 'vim'

  try {
    execSync(`${editor} ${tmpFile}`, { stdio: 'inherit' })
  } catch (error) {
    fs.unlinkSync(tmpFile)
    throw new Error(`Editor exited with error: ${error}`)
  }

  const content = fs.readFileSync(tmpFile, 'utf-8')
  fs.unlinkSync(tmpFile)

  return content
}
