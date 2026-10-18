/* <Box header? className?> contains <Row/> children; both accept ordinary div attributes. */
import type { HTMLAttributes, ReactNode } from "react"
export const Box = ({ header, children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { header?: ReactNode }) => <div className={`repo-ui-box ${className}`} {...props}>{header && <div className="repo-ui-box-header">{header}</div>}{children}</div>
export const Row = ({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) => <div className={`repo-ui-row ${className}`} {...props} />
