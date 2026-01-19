interface PrintKeyValueOptions {
  indent?: string
  multilineJson?: boolean
  emptyMessage?: string
}

export function printSectionHeader(line: string, title: string): void {
  console.log(line)
  console.log(title)
  console.log(line)
  console.log('')
}

export function printKeyValueEntries(
  entries: Record<string, unknown>,
  options: PrintKeyValueOptions = {}
): void {
  const indent = options.indent ?? '  '
  const keys = Object.keys(entries)
  if (keys.length === 0) {
    if (options.emptyMessage) {
      console.log(`${indent}${options.emptyMessage}`)
    }
    return
  }

  for (const [key, value] of Object.entries(entries)) {
    if (options.multilineJson) {
      const formatted = formatMultilineJson(value, `${indent}  `)
      console.log(`${indent}${key}: ${formatted}`)
    } else {
      console.log(`${indent}${key}: ${JSON.stringify(value)}`)
    }
  }
}

function formatMultilineJson(value: unknown, indent: string): string {
  return JSON.stringify(value, null, 2).split('\n').join(`\n${indent}`)
}
