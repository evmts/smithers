export function truncate(str: string, maxLen: number, ellipsis: string = '...'): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - ellipsis.length) + ellipsis
}

export function truncateTilde(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '~'
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) {
    return timestamp
  }
  return date.toLocaleString()
}

export function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) {
    return '--:--:--'
  }
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 20)
  return String(value)
}
