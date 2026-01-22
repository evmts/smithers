import * as path from 'path'

const SENSITIVE_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/,
  /\.pem$/,
  /\.key$/,
  /^\.npmrc$/,
  /^id_rsa/,
  /\.p12$/,
  /\.pfx$/,
  /^\.git-credentials$/,
  /^\.netrc$/,
]

export function isSensitiveFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(basename))
}
