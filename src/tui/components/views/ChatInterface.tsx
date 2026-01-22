// Chat Interface View (F4)
// Claude-powered Q&A about execution state

import { useCallback } from 'react'
import { useKeyboard } from '@opentui/react'
import type { SmithersDB } from '../../../db/index.js'
import { useClaudeChat } from '../../hooks/useClaudeChat.js'
import { TextAttributes, type KeyEvent } from '@opentui/core'
import { useTuiState } from '../../state.js'

export interface ChatInterfaceProps {
  db: SmithersDB
  height?: number
}

export function ChatInterface({ db }: ChatInterfaceProps) {
  const { messages, isLoading, error, isAvailable, sendMessage, clearHistory } = useClaudeChat(db)
  const [inputValue, setInputValue] = useTuiState<string>('tui:chat:input', '')
  const [isInputFocused, setIsInputFocused] = useTuiState<boolean>('tui:chat:focus', true)

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim()) return
    const message = inputValue.trim()
    setInputValue('')
    await sendMessage(message)
  }, [inputValue, sendMessage])

  // Handle keyboard
  useKeyboard((key: KeyEvent) => {
    if (key.ctrl && key.name === 'l') {
      clearHistory()
    }
    if (key.name === 'tab') {
      setIsInputFocused(prev => !prev)
    }
  })

  if (!isAvailable) {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text
          content="Claude Chat Unavailable"
          style={{ fg: '#f7768e', attributes: TextAttributes.BOLD, marginBottom: 1 }}
        />
        <text
          content="Set ANTHROPIC_API_KEY environment variable to enable Claude chat."
          style={{ fg: '#565f89' }}
        />
        <text
          content="The TUI will show execution data but AI analysis is disabled."
          style={{ fg: '#414868', marginTop: 1 }}
        />
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', width: '100%', height: '100%' }}>
      <text
        content="Claude Chat - Ask about your execution"
        style={{ fg: '#7aa2f7', attributes: TextAttributes.BOLD, marginBottom: 1 }}
      />

      {error && (
        <text
          content={`Error: ${error}`}
          style={{ fg: '#f7768e', marginBottom: 1 }}
        />
      )}

      {/* Messages area */}
      <scrollbox
        focused={!isInputFocused}
        style={{
          flexGrow: 1,
          border: true,
          padding: 1,
          backgroundColor: '#16161e',
          marginBottom: 1
        }}
      >
        {messages.length === 0 ? (
          <box style={{ flexDirection: 'column' }}>
            <text content="No messages yet. Try asking:" style={{ fg: '#565f89', marginBottom: 1 }} />
            <text content='  "What is the current status?"' style={{ fg: '#7dcfff' }} />
            <text content='  "Show me recent errors"' style={{ fg: '#7dcfff' }} />
            <text content='  "How many tokens have been used?"' style={{ fg: '#7dcfff' }} />
          </box>
        ) : (
          messages.map((msg, index) => (
            <box key={index} style={{ marginBottom: 1 }}>
              <text
                content={msg.role === 'user' ? 'You: ' : 'Claude: '}
                style={{
                  fg: msg.role === 'user' ? '#9ece6a' : '#7aa2f7',
                  attributes: TextAttributes.BOLD
                }}
              />
              <text
                content={msg.content}
                style={{ fg: '#c0caf5' }}
              />
            </box>
          ))
        )}
        {isLoading && (
          <text content="Claude is thinking..." style={{ fg: '#e0af68' }} />
        )}
      </scrollbox>

      {/* Input area */}
      <box style={{ height: 3, border: true, padding: 1 }}>
        <input
          placeholder="Ask Claude about the execution..."
          value={inputValue}
          focused={isInputFocused}
          onInput={setInputValue}
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            focusedBackgroundColor: '#24283b'
          }}
        />
      </box>

      <text
        content="Enter to send, Ctrl+L to clear history, Tab to switch focus"
        style={{ fg: '#565f89', marginTop: 1 }}
      />
    </box>
  )
}
