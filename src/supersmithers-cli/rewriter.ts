export function isTsxFile(filePath: string): boolean {
  return filePath.endsWith('.tsx')
}

export async function validateTsx(filePath: string): Promise<{ valid: boolean; errors: string[] }> {
  if (!isTsxFile(filePath)) {
    return { valid: false, errors: [`${filePath} is not a .tsx file`] }
  }

  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return { valid: false, errors: [`${filePath} does not exist`] }
  }

  const proc = Bun.spawn(['bun', 'build', filePath, '--no-bundle'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode === 0) {
    return { valid: true, errors: [] }
  }

  const errors = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return { valid: false, errors }
}
