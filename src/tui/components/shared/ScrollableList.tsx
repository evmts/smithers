// Reusable scrollable list component with vim-style navigation

import { useState, type ReactNode } from 'react'
import { useKeyboard } from '@opentui/react'
import type { KeyEvent } from '@opentui/core'

export interface ScrollableListProps<T> {
  items: T[]
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode
  onSelect?: (item: T, index: number) => void
  height?: number
  focused?: boolean
}

export function ScrollableList<T>({
  items,
  renderItem,
  onSelect,
  height = 10,
  focused = true
}: ScrollableListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)

  const clampedSelectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1))

  useKeyboard((key: KeyEvent) => {
    if (!focused) return

    if (key.name === 'j' || key.name === 'down') {
      const newIndex = Math.min(clampedSelectedIndex + 1, items.length - 1)
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
      setSelectedIndex(items.length - 1)
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
