#!/usr/bin/env bun

/**
 * Export Codebase to Markdown
 *
 * Creates a markdown file containing source code sections, formatted for sharing with LLMs.
 * Copies the result to clipboard.
 *
 * Usage:
 *   bun scripts/export-codebase.ts          # Show help with section sizes
 *   bun scripts/export-codebase.ts --reconciler  # Export reconciler section
 *   bun scripts/export-codebase.ts --all    # Export full codebase
 */

import { join, relative } from "node:path";
import { tmpdir } from "node:os";

const MAX_LINES = 500; // Files longer than this get truncated
const HEAD_LINES = 200; // Show first N lines of large files
const ROOT_DIR = process.cwd();

interface FileEntry {
  path: string;
  relativePath: string;
  content: string;
  truncated: boolean;
  totalLines?: number;
}

interface SectionConfig {
  pattern: string | string[];
  description: string;
}

interface SectionCategory {
  name: string;
  sections: Record<string, SectionConfig>;
}

const SECTION_CATEGORIES: SectionCategory[] = [
  {
    name: 'Source Code',
    sections: {
      'reconciler': { pattern: 'src/reconciler/**/*', description: 'Core React renderer' },
      'database': { pattern: 'src/db/**/*', description: 'SQLite state management' },
      'reactive-sqlite': { pattern: 'src/reactive-sqlite/**/*', description: 'Reactive DB wrapper' },
      'components-core': { pattern: ['src/components/*.tsx', 'src/components/MCP/**/*'], description: 'Main components' },
      'components-agents': { pattern: 'src/components/agents/**/*', description: 'CLI execution engines' },
      'components-vcs': { pattern: ['src/components/Git/**/*', 'src/components/JJ/**/*'], description: 'Git + Jujutsu operations' },
      'components-hooks': { pattern: 'src/components/Hooks/**/*', description: 'Lifecycle hooks' },
      'components-review': { pattern: 'src/components/Review/**/*', description: 'Code review' },
      'utils': { pattern: 'src/utils/**/*', description: 'Utilities' },
      'monitor': { pattern: 'src/monitor/**/*', description: 'Output parsing/logging' },
      'commands': { pattern: 'src/commands/**/*', description: 'CLI commands' },
      'tui': { pattern: 'src/tui/**/*', description: 'Terminal UI components' },
      'tools': { pattern: 'src/tools/**/*', description: 'Tool definitions' },
      'core': { pattern: 'src/core/**/*', description: 'Core modules' },
      'all': { pattern: 'src/**/*', description: 'Full codebase' },
    },
  },
  {
    name: 'Documentation',
    sections: {
      'docs': { pattern: 'docs/**/*.{md,mdx}', description: 'All documentation' },
      'docs-guides': { pattern: 'docs/guides/**/*', description: 'How-to guides' },
      'docs-concepts': { pattern: 'docs/concepts/**/*', description: 'Core concepts' },
      'docs-components': { pattern: 'docs/components/**/*', description: 'Component docs' },
      'docs-api': { pattern: 'docs/api-reference/**/*', description: 'API reference' },
      'docs-examples': { pattern: 'docs/examples/**/*', description: 'Example code' },
    },
  },
  {
    name: 'Tests',
    sections: {
      'tests-all': { pattern: 'src/**/*.test.{ts,tsx}', description: 'All test files' },
      'tests-reconciler': { pattern: 'src/reconciler/**/*.test.{ts,tsx}', description: 'Reconciler tests' },
      'tests-reactive-sqlite': { pattern: 'src/reactive-sqlite/**/*.test.{ts,tsx}', description: 'Reactive SQLite tests' },
      'tests-monitor': { pattern: 'src/monitor/**/*.test.{ts,tsx}', description: 'Monitor tests' },
      'tests-tools': { pattern: 'src/tools/**/*.test.{ts,tsx}', description: 'Tools tests' },
      'tests-tui': { pattern: 'src/tui/**/*.test.{ts,tsx}', description: 'TUI tests' },
      'tests-core': { pattern: 'src/core/**/*.test.{ts,tsx}', description: 'Core tests' },
      'tests-integration': { pattern: 'test/**/*.test.ts', description: 'Integration tests' },
    },
  },
];

const SECTIONS: Record<string, SectionConfig> = Object.fromEntries(
  SECTION_CATEGORIES.flatMap(cat => Object.entries(cat.sections))
);

const TEXT_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'json', 'sql', 'md', 'txt', 'yml', 'yaml', 'css', 'html'];

function isTextFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return TEXT_EXTENSIONS.includes(ext || '');
}

function isTestFile(filePath: string): boolean {
  return filePath.includes('.test.');
}

function isTestSection(sectionName: string): boolean {
  return sectionName.startsWith('tests-');
}

async function getFiles(patterns: string | string[], includeTests = false): Promise<string[]> {
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];
  const fileSet = new Set<string>();

  for (const pattern of patternArray) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan({ cwd: ROOT_DIR, onlyFiles: true })) {
      const fullPath = join(ROOT_DIR, file);
      if (isTextFile(fullPath) && (includeTests || !isTestFile(fullPath))) {
        fileSet.add(fullPath);
      }
    }
  }

  return Array.from(fileSet).sort();
}

async function readFile(filePath: string): Promise<FileEntry> {
  const content = await Bun.file(filePath).text();
  const lines = content.split('\n');
  const relativePath = relative(ROOT_DIR, filePath);

  if (lines.length > MAX_LINES) {
    const truncatedContent = lines.slice(0, HEAD_LINES).join('\n');
    return {
      path: filePath,
      relativePath,
      content: truncatedContent,
      truncated: true,
      totalLines: lines.length,
    };
  }

  return {
    path: filePath,
    relativePath,
    content,
    truncated: false,
  };
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'json': 'json',
    'sql': 'sql',
    'md': 'markdown',
    'sh': 'bash',
    'yml': 'yaml',
    'yaml': 'yaml',
  };
  return langMap[ext] || ext;
}

function formatFileEntry(entry: FileEntry): string {
  const lang = getLanguage(entry.relativePath);
  let output = `\n## ${entry.relativePath}\n\n`;

  if (entry.truncated) {
    output += `> ⚠️ File truncated: showing first ${HEAD_LINES} of ${entry.totalLines} lines\n\n`;
  }

  output += `\`\`\`${lang}\n${entry.content}\n\`\`\`\n`;

  return output;
}

async function calculateSectionSize(patterns: string | string[]): Promise<{ files: number; size: number }> {
  const files = await getFiles(patterns);
  let totalSize = 0;

  for (const file of files) {
    try {
      const entry = await readFile(file);
      totalSize += formatFileEntry(entry).length;
    } catch {
      // Skip files that can't be read
    }
  }

  return { files: files.length, size: totalSize };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function showHelp(): Promise<void> {
  console.log("📦 Codebase Export Tool\n");
  console.log("Exports source code sections for LLM context sharing.\n");
  console.log("Usage:");
  console.log("  bun scripts/export-codebase.ts --<section>  Export a specific section");
  console.log("  bun scripts/export-codebase.ts --help       Show this help\n");
  console.log("Calculating section sizes...\n");

  console.log("Available sections:\n");
  console.log("  Section                Size        Files   Description");
  console.log("  ─────────────────────────────────────────────────────────────────");

  for (const [name, config] of Object.entries(SECTIONS)) {
    const { files, size } = await calculateSectionSize(config.pattern);
    const sizeStr = formatSize(size).padStart(10);
    const filesStr = String(files).padStart(5);
    const flagName = `--${name}`.padEnd(22);
    console.log(`  ${flagName} ${sizeStr}  ${filesStr}   ${config.description}`);
  }

  console.log("\nExample:");
  console.log("  bun scripts/export-codebase.ts --reconciler");
}

function parseArgs(): string | null {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return null;
  }

  // Find a --section flag
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const sectionName = arg.slice(2);
      if (SECTIONS[sectionName]) {
        return sectionName;
      } else {
        console.error(`Unknown section: ${sectionName}`);
        console.error(`Run without arguments to see available sections.\n`);
        process.exit(1);
      }
    }
  }

  return null;
}

async function exportSection(sectionName: string): Promise<void> {
  const config = SECTIONS[sectionName]!;
  console.log(`🔍 Exporting section: ${sectionName} (${config.description})...`);

  let markdown = `# Smithers Codebase Export: ${sectionName}\n\n`;
  markdown += `Generated: ${new Date().toISOString()}\n`;
  markdown += `Section: ${sectionName} - ${config.description}\n\n`;
  markdown += "---\n";

  const files = await getFiles(config.pattern);
  console.log(`📂 Found ${files.length} files...`);

  let processedCount = 0;
  let truncatedCount = 0;

  for (const file of files) {
    try {
      const entry = await readFile(file);
      markdown += formatFileEntry(entry);
      processedCount++;

      if (entry.truncated) {
        truncatedCount++;
      }

      if (processedCount % 10 === 0) {
        console.log(`  Processed ${processedCount} files...`);
      }
    } catch (err) {
      console.error(`  ⚠️  Failed to read ${file}:`, err);
    }
  }

  console.log(`\n✅ Processed ${processedCount} files (${truncatedCount} truncated)`);

  // Add metadata footer
  markdown += "\n---\n\n";
  markdown += `## Export Metadata\n\n`;
  markdown += `- **Section**: ${sectionName}\n`;
  markdown += `- **Total files**: ${processedCount}\n`;
  markdown += `- **Truncated files**: ${truncatedCount}\n`;
  markdown += `- **Export date**: ${new Date().toLocaleString()}\n`;

  // Copy to clipboard
  console.log("📋 Copying to clipboard...");
  const proc = Bun.spawn(["pbcopy"], {
    stdin: "pipe",
  });

  proc.stdin.write(markdown);
  proc.stdin.end();
  await proc.exited;

  // Save to file in temp directory
  const outputPath = join(tmpdir(), "codebase-export.md");
  await Bun.write(outputPath, markdown);

  console.log(`\n✨ Done!`);
  console.log(`📋 Markdown copied to clipboard`);
  console.log(`💾 Also saved to: ${outputPath}`);
  console.log(`📊 Total size: ${formatSize(markdown.length)}`);
}

async function main() {
  const section = parseArgs();

  if (section === null) {
    await showHelp();
  } else {
    await exportSection(section);
  }
}

main().catch(console.error);
