// Human Interaction Handler View (F5)
// Respond to pending useHuman requests

import { useCallback } from 'react'
import { useKeyboard } from '@opentui/react'
import type { SmithersDB } from '../../../db/index.js'
import { useHumanRequests } from '../../hooks/useHumanRequests.js'
import { TextAttributes, type KeyEvent } from '@opentui/core'
import { truncate } from '../../utils/format.js'
import { useEffectOnValueChange } from '../../../reconciler/hooks.js'
import { useTuiState } from '../../state.js'

export interface HumanInteractionHandlerProps {
  db: SmithersDB
  height?: number
}

export function HumanInteractionHandler({ db }: HumanInteractionHandlerProps) {
  const {
    pendingRequests,
    selectedIndex,
    selectedRequest,
    selectRequest,
    approveRequest,
    rejectRequest
  } = useHumanRequests(db)

  const [responseText, setResponseText] = useTuiState<string>('tui:human:responseText', '')
  const [selectedOption, setSelectedOption] = useTuiState<number>('tui:human:selectedOption', 0)

  useEffectOnValueChange(selectedRequest?.options?.length ?? 0, () => {
    const maxIndex = Math.max(0, (selectedRequest?.options?.length ?? 0) - 1)
    if (selectedOption > maxIndex) {
      setSelectedOption(maxIndex)
    }
  }, [selectedOption, selectedRequest?.options?.length, setSelectedOption])

  const handleApprove = useCallback(() => {
    if (selectedRequest?.options && selectedRequest.options.length > 0) {
      approveRequest(selectedRequest.options[selectedOption])
    } else if (responseText.trim()) {
      approveRequest(responseText.trim())
      setResponseText('')
    } else {
      approveRequest(true)
    }
  }, [selectedRequest, selectedOption, responseText, approveRequest])

  // Handle keyboard navigation
  useKeyboard((key: KeyEvent) => {
    if (key.name === 'j' || key.name === 'down') {
      if (selectedRequest?.options && selectedRequest.options.length > 0) {
        setSelectedOption(prev => Math.min(prev + 1, Math.max(0, selectedRequest.options!.length - 1)))
      } else {
        selectRequest(selectedIndex + 1)
      }
    } else if (key.name === 'k' || key.name === 'up') {
      if (selectedRequest?.options && selectedRequest.options.length > 0) {
        setSelectedOption(prev => Math.max(prev - 1, 0))
      } else {
        selectRequest(selectedIndex - 1)
      }
    } else if (key.name === 'y' || key.name === 'return') {
      handleApprove()
    } else if (key.name === 'n') {
      rejectRequest(false)
    }
  })

  if (pendingRequests.length === 0) {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text
          content="No Pending Requests"
          style={{ fg: '#73daca', attributes: TextAttributes.BOLD, marginBottom: 1 }}
        />
        <text
          content="Human interaction requests will appear here when your orchestration"
          style={{ fg: '#565f89' }}
        />
        <text
          content="uses the useHuman hook and waits for input."
          style={{ fg: '#565f89' }}
        />
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <box style={{ flexDirection: 'row', marginBottom: 1, justifyContent: 'space-between' }}>
        <text
          content={`Pending Requests (${pendingRequests.length})`}
          style={{ fg: '#e0af68', attributes: TextAttributes.BOLD }}
        />
        <text
          content="y:approve n:reject j/k:navigate"
          style={{ fg: '#565f89' }}
        />
      </box>

      {/* Request list */}
      <box style={{
        border: true,
        height: Math.min(8, pendingRequests.length + 2),
        marginBottom: 1,
        padding: 1
      }}>
        <scrollbox focused style={{ flexGrow: 1 }}>
          {pendingRequests.map((req, index) => (
            <box
              key={req.id}
              style={{
                flexDirection: 'row',
                backgroundColor: index === selectedIndex ? '#24283b' : undefined,
                paddingLeft: 1
              }}
            >
              <text
                content={index === selectedIndex ? '> ' : '  '}
                style={{ fg: '#7aa2f7' }}
              />
              <text
                content={`[${req.type}]`}
                style={{ fg: '#bb9af7', width: 15 }}
              />
              <text
                content={truncate(req.prompt, 50)}
                style={{ fg: '#c0caf5' }}
              />
            </box>
          ))}
        </scrollbox>
      </box>

      {/* Selected request details */}
      {selectedRequest && (
        <box style={{
          flexDirection: 'column',
          border: true,
          padding: 1,
          flexGrow: 1
        }}>
          <text
            content="Request Details"
            style={{ fg: '#7aa2f7', attributes: TextAttributes.BOLD, marginBottom: 1 }}
          />

          <text
            content={`Type: ${selectedRequest.type}`}
            style={{ fg: '#bb9af7', marginBottom: 1 }}
          />

          <text
            content="Prompt:"
            style={{ fg: '#9ece6a', marginBottom: 1 }}
          />
          <text
            content={selectedRequest.prompt}
            style={{ fg: '#c0caf5', marginBottom: 1, marginLeft: 2 }}
          />

          {/* Options or text input */}
          {selectedRequest.options && selectedRequest.options.length > 0 ? (
            <box style={{ marginTop: 1 }}>
              <text
                content="Options (j/k to select, Enter to confirm):"
                style={{ fg: '#e0af68', marginBottom: 1 }}
              />
              {selectedRequest.options.map((option, index) => (
                <box key={index} style={{ flexDirection: 'row', marginLeft: 2 }}>
                  <text
                    content={index === selectedOption ? '[x] ' : '[ ] '}
                    style={{ fg: index === selectedOption ? '#7aa2f7' : '#565f89' }}
                  />
                  <text
                    content={option}
                    style={{
                      fg: index === selectedOption ? '#7aa2f7' : '#a9b1d6',
                      attributes: index === selectedOption ? TextAttributes.BOLD : undefined
                    }}
                  />
                </box>
              ))}
            </box>
          ) : (
            <box style={{ marginTop: 1 }}>
              <text
                content="Response (Enter to submit):"
                style={{ fg: '#e0af68', marginBottom: 1 }}
              />
              <box style={{ border: true, height: 3, padding: 1 }}>
                <input
                  placeholder="Type your response..."
                  value={responseText}
                  focused
                  onInput={setResponseText}
                  onSubmit={handleApprove}
                  style={{ focusedBackgroundColor: '#24283b' }}
                />
              </box>
            </box>
          )}

          <box style={{ flexDirection: 'row', marginTop: 2, gap: 4 }}>
            <text content="[y] Approve" style={{ fg: '#9ece6a' }} />
            <text content="[n] Reject" style={{ fg: '#f7768e' }} />
          </box>
        </box>
      )}
    </box>
  )
}
