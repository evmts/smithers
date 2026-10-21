import { stepDuration, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { flowSummary } from "../summary"
import { useRuns } from "./RunsContext"

// The Runs page's flows summary (docs/features/runs.md#flows): runs, success and p95 per flow on this device.
export function FlowSummaryView() {
  const { queries } = useRuns()
  const { data: runs } = useLiveQuery(queries.runs)
  const rows = flowSummary(runs ?? [])
  if (rows.length === 0) return null
  return (
    <Table aria-label="Flows">
      <TableHeader>
        <TableRow>
          <TableHead>Flow</TableHead>
          <TableHead>Runs</TableHead>
          <TableHead>Success</TableHead>
          <TableHead>p95</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.flow}>
            <TableCell>{row.flow}</TableCell>
            <TableCell>{row.runs}</TableCell>
            <TableCell>{row.successRate === null ? "–" : `${Math.round(row.successRate * 100)}%`}</TableCell>
            <TableCell>{row.p95Ms === null ? "–" : stepDuration(row.p95Ms)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
