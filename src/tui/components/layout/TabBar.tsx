// Tab bar for navigation between views

import type { TabKey, TabInfo } from '../../App.js'
import { TextAttributes } from '@opentui/core'

export interface TabBarProps {
  tabs: TabInfo[]
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
}

export function TabBar({ tabs, activeTab }: TabBarProps) {
  return (
    <box style={{
      height: 1,
      width: '100%',
      backgroundColor: '#16161e',
      flexDirection: 'row',
      paddingLeft: 1
    }}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <box key={tab.key} style={{
            flexDirection: 'row',
            marginRight: 2
          }}>
            <text
              content={`${tab.shortcut}:`}
              style={{
                fg: '#565f89',
              }}
            />
            <text
              content={tab.label}
              style={{
                fg: isActive ? '#7aa2f7' : '#a9b1d6',
                backgroundColor: isActive ? '#24283b' : undefined,
                attributes: isActive ? TextAttributes.BOLD : undefined,
                paddingLeft: 1,
                paddingRight: 1
              }}
            />
          </box>
        )
      })}
    </box>
  )
}
