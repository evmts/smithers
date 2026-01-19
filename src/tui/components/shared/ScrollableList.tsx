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

export interface ScrollState {
  selectedIndex: number
  scrollOffset: number
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

  const clampedSelectedIndex = clampSelectedIndex(selectedIndex, items.length)

  useEffectOnValueChange(items.length, () => {
    const nextSelectedIndex = clampSelectedIndex(selectedIndex, items.length)
    if (selectedIndex !== nextSelectedIndex) setSelectedIndex(nextSelectedIndex)

    const nextScrollOffset = clampScrollOffset(scrollOffset, items.length, height)
    if (scrollOffset !== nextScrollOffset) setScrollOffset(nextScrollOffset)
  }, [items.length, selectedIndex, scrollOffset, setSelectedIndex, setScrollOffset, height])

  useKeyboard((key: KeyEvent) => {
    if (!focused) return

    if (key.name === 'return') {
      const item = items[clampedSelectedIndex]
      if (item && onSelect) {
        onSelect(item, clampedSelectedIndex)
      }
      return
    }

    const nextState = applyScrollableListKey(
      { selectedIndex: clampedSelectedIndex, scrollOffset },
      key,
      items.length,
      height
    )
    if (!nextState) return
    setSelectedIndex(nextState.selectedIndex)
    setScrollOffset(nextState.scrollOffset)
  })

  const visibleItems = getVisibleItems(items, scrollOffset, height)

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

export function clampSelectedIndex(selectedIndex: number, itemsLength: number): number {
  if (itemsLength <= 0) return 0
  return Math.max(0, Math.min(selectedIndex, itemsLength - 1))
}

export function applyScrollableListKey(
  state: ScrollState,
  key: KeyEvent,
  itemsLength: number,
  height: number
): ScrollState | null {
  const maxIndex = Math.max(0, itemsLength - 1)
  let selectedIndex = clampSelectedIndex(state.selectedIndex, itemsLength)
  let scrollOffset = Math.max(0, state.scrollOffset)

  if (key.name === 'j' || key.name === 'down') {
    const newIndex = Math.min(selectedIndex + 1, maxIndex)
    selectedIndex = newIndex
    if (newIndex >= scrollOffset + height) {
      scrollOffset = newIndex - height + 1
    }
    return { selectedIndex, scrollOffset }
  }

  if (key.name === 'k' || key.name === 'up') {
    const newIndex = Math.max(selectedIndex - 1, 0)
    selectedIndex = newIndex
    if (newIndex < scrollOffset) {
      scrollOffset = newIndex
    }
    return { selectedIndex, scrollOffset }
  }

  if (key.name === 'g') {
    return { selectedIndex: 0, scrollOffset: 0 }
  }

  if (key.name === 'G' || (key.shift && key.name === 'g')) {
    return { selectedIndex: maxIndex, scrollOffset: Math.max(0, itemsLength - height) }
  }

  return null
}

export function clampScrollOffset(scrollOffset: number, itemsLength: number, height: number): number {
  if (itemsLength <= 0 || height <= 0) return 0
  const maxOffset = Math.max(0, itemsLength - height)
  return Math.max(0, Math.min(scrollOffset, maxOffset))
}

export function getVisibleItems<T>(items: T[], scrollOffset: number, height: number): T[] {
  return items.slice(scrollOffset, scrollOffset + height)
}
