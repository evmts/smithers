// Reusable scrollable list component with vim-style navigation

import { useRef, type ReactNode } from 'react'
import { useKeyboard } from '@opentui/react'
import type { KeyEvent } from '@opentui/core'
import { useEffectOnValueChange } from '../../../reconciler/hooks.js'
import { useTuiState } from '../../state.js'

export interface ScrollableListProps<T> {
  stateKey?: string
  items: T[]
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode
  onSelect?: (item: T, index: number) => void
  height?: number
  focused?: boolean
}

export function ScrollableList<T>({
  stateKey,
  items,
  renderItem,
  onSelect,
  height = 10,
  focused = true
}: ScrollableListProps<T>) {
  const instanceIdRef = useRef(crypto.randomUUID())
  const baseKey = stateKey ?? `tui:scrollable-list:${instanceIdRef.current}`
  const [selectedIndex, setSelectedIndex] = useTuiState<number>(`${baseKey}:selectedIndex`, 0)
  const [scrollOffset, setScrollOffset] = useTuiState<number>(`${baseKey}:scrollOffset`, 0)

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1))

  useEffectOnValueChange(items.length, () => {
    const maxIndex = Math.max(0, items.length - 1)
    if (selectedIndex > maxIndex) {
      setSelectedIndex(maxIndex)
    }
    const maxOffset = Math.max(0, items.length - height)
    if (scrollOffset > maxOffset) {
      setScrollOffset(maxOffset)
    }
  }, [items.length, selectedIndex, scrollOffset, setSelectedIndex, setScrollOffset, height])

  useKeyboard((key: KeyEvent) => {
    if (!focused) return

    if (key.name === 'j' || key.name === 'down') {
      const maxIndex = Math.max(0, items.length - 1)
      const newIndex = Math.min(clampedSelectedIndex + 1, maxIndex)
      setSelectedIndex(newIndex)
      if (newIndex >= scrollOffset + height) {
        setScrollOffset(newIndex - height + 1)
      }
    } else if (key.name === 'k' || key.name === 'up') {
      const newIndex = Math.max(clampedSelectedIndex - 1, 0)
      setSelectedIndex(newIndex)
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex)
      }
    } else if (key.name === 'g') {
      setSelectedIndex(0)
      setScrollOffset(0)
    } else if (key.name === 'G' || (key.shift && key.name === 'g')) {
      setSelectedIndex(Math.max(0, items.length - 1))
      setScrollOffset(Math.max(0, items.length - height))
    } else if (key.name === 'return') {
      const item = items[clampedSelectedIndex]
      if (item && onSelect) {
        onSelect(item, clampedSelectedIndex)
      }
    }
  })

  const visibleItems = items.slice(scrollOffset, scrollOffset + height)

  return (
    <scrollbox focused={focused} style={{ height }}>
      {visibleItems.map((item, index) => {
        const actualIndex = scrollOffset + index
        return (
          <box key={actualIndex}>
            {renderItem(item, actualIndex, actualIndex === clampedSelectedIndex)}
          </box>
        )
      })}
    </scrollbox>
  )
}
