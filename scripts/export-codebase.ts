#!/usr/bin/env bun

/**
 * Export Codebase to Markdown
 *
 * Creates a markdown file containing all source code from the src directory
 * and README files, formatted for sharing with LLMs.
 * Copies the result to clipboard.
 */

import { $ } from "bun";
import { join, relative } from "node:path";

const MAX_LINES = 500; // Files longer than this get truncated
const HEAD_LINES = 200; // Show first N lines of large files
const ROOT_DIR = process.cwd();
const SRC_DIR = join(ROOT_DIR, "src");

interface FileEntry {
  path: string;
  relativePath: string;
  content: string;
  truncated: boolean;
  totalLines?: number;
}

async function getFiles(pattern: string): Promise<string[]> {
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: ROOT_DIR, onlyFiles: true })) {
    files.push(join(ROOT_DIR, file));
  }

  return files.sort();
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

async function main() {
  console.log("🔍 Scanning codebase...");

  let markdown = "# Smithers Codebase Export\n\n";
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += "---\n\n";

  // Add root README
  console.log("📖 Adding root README.md...");
  try {
    const rootReadme = await readFile(join(ROOT_DIR, "README.md"));
    markdown += formatFileEntry(rootReadme);
    markdown += "\n---\n";
  } catch (err) {
    console.log("⚠️  No root README.md found");
  }

  // Add source files
  console.log("📂 Collecting source files from src/...");
  const srcFiles = await getFiles("src/**/*");

  let processedCount = 0;
  let truncatedCount = 0;

  for (const file of srcFiles) {
    // Skip directories, binaries, and other non-text files
    const ext = file.split('.').pop()?.toLowerCase();
    const textExtensions = ['ts', 'tsx', 'js', 'jsx', 'json', 'sql', 'md', 'txt', 'yml', 'yaml', 'css', 'html'];

    if (!textExtensions.includes(ext || '')) {
      continue;
    }

    try {
      const entry = await readFile(file);
      markdown += formatFileEntry(entry);
      processedCount++;

      if (entry.truncated) {
        truncatedCount++;
      }

      // Progress indicator
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

  // Also save to file for reference
  const outputPath = join(ROOT_DIR, "codebase-export.md");
  await Bun.write(outputPath, markdown);

  console.log(`\n✨ Done!`);
  console.log(`📋 Markdown copied to clipboard`);
  console.log(`💾 Also saved to: ${outputPath}`);
  console.log(`📊 Total size: ${(markdown.length / 1024).toFixed(2)} KB`);
}

main().catch(console.error);
