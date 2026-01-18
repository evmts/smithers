// Reusable scrollable list component with vim-style navigation

import { useState, useEffect, type ReactNode } from 'react'
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

  // Clamp selection to valid range
  useEffect(() => {
    if (selectedIndex >= items.length && items.length > 0) {
      setSelectedIndex(items.length - 1)
    }
  }, [items.length, selectedIndex])

  // Handle keyboard navigation
  useKeyboard((key: KeyEvent) => {
    if (!focused) return

    if (key.name === 'j' || key.name === 'down') {
      setSelectedIndex(prev => Math.min(prev + 1, items.length - 1))
    } else if (key.name === 'k' || key.name === 'up') {
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (key.name === 'g') {
      setSelectedIndex(0)
      setScrollOffset(0)
    } else if (key.name === 'G' || (key.shift && key.name === 'g')) {
      setSelectedIndex(items.length - 1)
    } else if (key.name === 'return') {
      const item = items[selectedIndex]
      if (item && onSelect) {
        onSelect(item, selectedIndex)
      }
    }
  })

  // Adjust scroll offset based on selection
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex)
    } else if (selectedIndex >= scrollOffset + height) {
      setScrollOffset(selectedIndex - height + 1)
    }
  }, [selectedIndex, scrollOffset, height])

  const visibleItems = items.slice(scrollOffset, scrollOffset + height)

  return (
    <scrollbox focused={focused} style={{ height }}>
      {visibleItems.map((item, index) => {
        const actualIndex = scrollOffset + index
        return (
          <box key={actualIndex}>
            {renderItem(item, actualIndex, actualIndex === selectedIndex)}
          </box>
        )
      })}
    </scrollbox>
  )
}
