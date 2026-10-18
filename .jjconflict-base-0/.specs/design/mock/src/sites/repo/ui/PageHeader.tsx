/* <PageHeader title="Issues" description? actions?/>. Children render below the title row. */
import type { ReactNode } from "react"
export const PageHeader = ({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) => <header className="repo-ui-page-header"><div className="repo-ui-page-title"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="repo-ui-actions">{actions}</div>}</div>{children}</header>
