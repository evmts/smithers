/* Sidebar accepts children or sections=[{title, children}]. SidebarSection supplies the shared separator. */
import type { ReactNode } from "react"
export const SidebarSection = ({ title, children }: { title: ReactNode; children: ReactNode }) => <section className="repo-ui-sidebar-section"><h2>{title}</h2>{children}</section>
export const Sidebar = ({ children, sections }: { children?: ReactNode; sections?: Array<{ title: string; children: ReactNode }> }) => <aside className="repo-ui-sidebar">{sections?.map(section => <SidebarSection key={section.title} title={section.title}>{section.children}</SidebarSection>)}{children}</aside>
