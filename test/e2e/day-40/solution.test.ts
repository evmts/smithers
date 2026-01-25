import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 40: Prefix Timeout', () => {
  test('prefix mode exits after timeout', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')
    await expect(terminal.getByText('[Ctrl+B]')).toBeVisible()

    await new Promise(resolve => setTimeout(resolve, 2000))

    await expect(terminal).toMatchSnapshot()
  })
})
