// Header component showing execution info and branding

import { TextAttributes } from '@opentui/core'
import { getStatusColor } from '../../utils/colors.js'

export interface HeaderProps {
  executionName: string
  status: string
}

export function Header({ executionName, status }: HeaderProps) {
  const statusColor = getStatusColor(status)

  return (
    <box style={{
      height: 2,
      width: '100%',
      backgroundColor: '#24283b',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingLeft: 1,
      paddingRight: 1
    }}>
      <text
        content="Smithers TUI"
        style={{
          fg: '#7aa2f7',
          attributes: TextAttributes.BOLD
        }}
      />
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text content={executionName} style={{ fg: '#c0caf5' }} />
        <text content={`[${status}]`} style={{ fg: statusColor }} />
      </box>
    </box>
  )
}
