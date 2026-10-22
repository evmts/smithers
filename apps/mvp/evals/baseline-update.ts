/** Whether the run is eligible to replace the complete committed baseline. */
export const canUpdateBaseline = (failed: number, unsafe: number, selected: number, total: number): boolean =>
  failed === 0 && unsafe === 0 && selected > 0 && selected === total
