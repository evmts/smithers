/**
 * A presentation bundle built from React alone, for this package's tests.
 *
 * `@smthrs/ui` builds the bundle Smithers ships, with its own components. This
 * one carries three small stand-ins, so the realm is tested without the
 * component library.
 */
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as jsxRuntime from "react/jsx-runtime"
import { Presentation } from "../../src/index.ts"

const join = (...names: ReadonlyArray<unknown>) => names.filter((name) => typeof name === "string" && name).join(" ")

const Card = ({ children, className }: { readonly children?: React.ReactNode; readonly className?: string }) =>
  jsxRuntime.jsx("div", { "data-slot": "card", className: join("sui-card", className), children })

const Button = (
  { children, className, ...rest }: { readonly children?: React.ReactNode; readonly className?: string }
) =>
  jsxRuntime.jsx("button", {
    "data-slot": "button",
    type: "button",
    className: join("sui-button", className),
    ...rest,
    children
  })

const Badge = ({ children }: { readonly children?: React.ReactNode }) =>
  jsxRuntime.jsx("span", { "data-slot": "badge", className: "sui-badge", children })

Presentation.install({ react: React, jsxRuntime, renderToStaticMarkup, components: { Badge, Button, Card } })
