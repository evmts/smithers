import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 28: Scroll Down', () => {
  test('keyDown scrolls chat history down after scrolling up', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.keyUp()
    await terminal.keyUp()
    await terminal.keyUp()

    await terminal.keyDown()
    await terminal.keyDown()

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
