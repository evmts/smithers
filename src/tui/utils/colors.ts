// Tokyo Night color palette and status color utilities

export const colors = {
  bg: '#1a1b26',
  bgDark: '#16161e',
  bgHighlight: '#24283b',
  fg: '#c0caf5',
  fgDark: '#a9b1d6',
  blue: '#7aa2f7',
  cyan: '#7dcfff',
  purple: '#bb9af7',
  green: '#9ece6a',
  teal: '#73daca',
  red: '#f7768e',
  orange: '#e0af68',
  comment: '#565f89',
  darker: '#414868',
} as const

export function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return colors.green
    case 'completed': return colors.teal
    case 'failed': return colors.red
    case 'pending': return colors.orange
    default: return colors.comment
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'warning': return colors.orange
    case 'critical': return colors.red
    default: return colors.blue
  }
}
