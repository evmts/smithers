/* <RelTime date={iso}/> (iso is also accepted); full date remains in the native tooltip. */
import { fmtAgo, fmtDate } from "../fixtures"
export const RelTime = ({ date, iso }: { date?: string; iso?: string }) => {
  const value = date ?? iso ?? ""
  return <time className="repo-ui-time" dateTime={value} title={fmtDate(value)}>{fmtAgo(value)}</time>
}
