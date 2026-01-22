import { colors } from '../../utils/colors.js'

export interface StatusBarProps {
  isConnected: boolean
  error: string | null
  dbPath: string
}

export function StatusBar({ isConnected, error, dbPath }: StatusBarProps) {
  const connectionStatus = isConnected ? 'Connected' : 'Disconnected'
  const connectionColor = isConnected ? colors.green : colors.red
  const errorLabel = error?.startsWith('Error: ') ? error : (error ? `Error: ${error}` : null)

  return (
    <box style={{
      height: 2,
      width: '100%',
      backgroundColor: colors.bgDark,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingLeft: 1,
      paddingRight: 1
    }}>
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text
          content={`[${connectionStatus}]`}
          style={{ fg: connectionColor }}
        />
        <text
          content={dbPath}
          style={{ fg: colors.comment }}
        />
        {errorLabel && (
          <text
            content={errorLabel}
            style={{ fg: colors.red }}
          />
        )}
      </box>
      <text
        content="Ctrl+C/Ctrl+Q:quit  F1-F6:tabs  j/k:nav  Enter:select"
        style={{ fg: colors.comment }}
      />
    </box>
  )
}
