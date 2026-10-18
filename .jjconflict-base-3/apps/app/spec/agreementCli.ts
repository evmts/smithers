import { agreementReports } from "./agreementReports"

export const agreementCli = async (policyPath: string, labelDirectory: string, owner = "will"): Promise<void> => {
  for (const report of await agreementReports(policyPath, labelDirectory, owner)) console.log(JSON.stringify(report))
}
if (import.meta.main) agreementCli(process.argv[2] ?? ".smithers/factory.json", process.argv[3] ?? "apps/app/spec/labels", process.argv[4]).catch(() => { console.error("Agreement report inconclusive"); process.exitCode = 5 })
