import assert from 'node:assert/strict'
import { stripFrontmatter } from './markdown-source.ts'
for (const [input, expected] of [
 ['---\ntitle: README\ndescription: hidden\n---\n# Visible', '# Visible'],
 ['\uFEFF---\r\ntitle: Docs\r\n...\r\nBody', 'Body'],
 ['---\ntitle: Wiki\n---', ''],
 ['---\nunterminated', '---\nunterminated'],
 ['# Body\n---\nnot metadata\n---', '# Body\n---\nnot metadata\n---'],
 ['```yaml\n---\ntitle: Example\n---\n```', '```yaml\n---\ntitle: Example\n---\n```'],
 ['---\na: 1\n---\nBody\n---\nb: 2\n---', 'Body\n---\nb: 2\n---']
]) assert.equal(stripFrontmatter(input), expected)
console.log('PASS frontmatter: LF/CRLF/BOM, both YAML endings, EOF, malformed input and embedded examples (7 cases)')
