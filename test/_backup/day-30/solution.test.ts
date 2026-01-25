import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 30: Page Down', () => {
  test('Page Down scrolls back after Page Up', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.write('\x1b[5~')
    await terminal.write('\x1b[5~')

    await terminal.write('\x1b[6~')

    await expect(terminal).toMatchSnapshot()
  })
})
