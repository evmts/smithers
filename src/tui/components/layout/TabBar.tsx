// Tab bar for navigation between views

import type { TabKey, TabInfo } from '../../appNavigation.js'
import { TextAttributes } from '@opentui/core'
import { colors } from '../../utils/colors.js'

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
      backgroundColor: colors.bgDark,
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
                fg: colors.comment,
              }}
            />
            <text
              content={tab.label}
              style={{
                fg: isActive ? colors.blue : colors.fgDark,
                backgroundColor: isActive ? colors.bgHighlight : undefined,
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
