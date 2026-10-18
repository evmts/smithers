/* <Tabs items={[{id, label, to, count?}]} active="conversation"/>; tab links use the mock router. */
import { useEffect, useRef, type ReactNode } from "react"
import { Link } from "../../core/router"
import { Counter } from "./Counter"
export interface Tab { id?: string; label: ReactNode; to: string; count?: number }
export const Tabs = ({ items, active, label = "Page navigation" }: { items: Tab[]; active?: string; label?: string }) => {
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const selected = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav.current && selected) nav.current.scrollLeft = Math.max(0, selected.offsetLeft - nav.current.offsetLeft - 16)
  }, [active])
  return <nav ref={nav} className="repo-ui-tabs" aria-label={label}>{items.map(item => <Link key={item.id ?? item.to} className="repo-ui-tab" to={item.to} aria-current={(item.id ?? item.to) === active ? "page" : undefined}>{item.label}{item.count !== undefined && <Counter>{item.count}</Counter>}</Link>)}</nav>

}
