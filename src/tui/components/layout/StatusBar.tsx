// Status bar showing connection state and help hints

export interface StatusBarProps {
  isConnected: boolean
  error: string | null
  dbPath: string
}

export function StatusBar({ isConnected, error, dbPath }: StatusBarProps) {
  const connectionStatus = isConnected ? 'Connected' : 'Disconnected'
  const connectionColor = isConnected ? '#9ece6a' : '#f7768e'

  return (
    <box style={{
      height: 2,
      width: '100%',
      backgroundColor: '#16161e',
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
          style={{ fg: '#565f89' }}
        />
        {error && (
          <text
            content={`Error: ${error}`}
            style={{ fg: '#f7768e' }}
          />
        )}
      </box>
      <text
        content="q:quit  Tab:next  j/k:nav  Enter:select"
        style={{ fg: '#565f89' }}
      />
    </box>
  )
}
