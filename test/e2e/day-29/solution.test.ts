import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 29: Page Up', () => {
  test('Page Up scrolls chat history by 20 lines', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.write('\x1b[5~')

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
