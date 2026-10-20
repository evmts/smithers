import { BuildAndCheckTypeScriptPackage, SdkRules } from "@smthrs/repo-targets"
import { Smithers } from "@smthrs/targets"
import * as Input from "@smthrs/targets/Input"
import { Package as cryptoPackage } from "../../flows/crypto/PACKAGE.ts"
const cwd = "packages/smithers/ui/view-frame"
const targets = BuildAndCheckTypeScriptPackage({
  cwd,
  deps: [cryptoPackage.lib],
  sources: Input.glob("{src,examples}/**/*.ts")
})
const rules = SdkRules({ cwd, role: "library" })
const sourceFiles = Smithers.Filegroup({ srcs: [Smithers.glob("src/**/*.ts")], cwd })
const securityReview = Smithers.SecurityReview({
  cwd,
  include: ["src/**", "docs/**", "README.md"],
  checks: [
    {
      id: "frame-policy",
      title: "The frame admits only the hashed runtime and loads nothing from the network",
      threat: "A view's HTML runs script, loads a remote resource, submits a form or navigates the page.",
      lookFor: [
        "A `sandbox` value with allow-same-origin, allow-forms, allow-popups, allow-top-navigation or allow-modals.",
        "A CSP directive that admits a scheme, a host, 'unsafe-inline' script or 'unsafe-eval', or drops script-src-attr 'none'.",
        "frameDocument writing view content, or a runtime or style sheet that can close its own element early."
      ],
      paths: ["src/ViewCsp.ts"]
    },
    {
      id: "bridge-admission",
      title: "The page acts only on decoded, bounded, declared and rate-limited frame messages",
      threat:
        "A frame sends an undeclared event, an oversized payload or a flood of interactions that the page turns into questions or state.",
      lookFor: [
        "receive admitting an event `Interactions.lookup` does not find, or matching an inherited property name.",
        "Values over maxValuesBytes, or more than maxInteractionsPerSecond in a window, admitted.",
        "acceptInitialize accepting a nonce that does not match exactly."
      ],
      paths: ["src/Bridge.ts", "src/Interactions.ts"]
    }
  ]
})
export const Package = Smithers.Package({ targets: { ...targets, ...rules, sourceFiles, ...securityReview } })
