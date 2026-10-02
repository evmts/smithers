import { renameSync } from "node:fs"
import { join } from "node:path"

/** Turn copied fixture data into its canonical executable flow file. */
export const materializeFlowTemplate = (directory: string): void => {
  renameSync(join(directory, "flow.ts.template"), join(directory, "flow.ts"))
}
