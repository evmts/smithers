import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 27: Scroll Up', () => {
  test('keyUp scrolls chat history up', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    const initialSnapshot = await terminal.serialize()

    await terminal.keyUp()
    await terminal.keyUp()
    await terminal.keyUp()

    await expect(terminal).toMatchSnapshot()
  })
})
