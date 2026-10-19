import { CopyButton } from "./CopyButton"

export const heldCodeChangeMessage = "Hosted runs that change code are held. Run smthrs locally: npm i -g smthrs@next"

export const HeldCodeChange = () => <p className="repo-ui-held-code-change">
  Hosted runs that change code are held. Run smthrs locally: <code>npm i -g smthrs@next</code>{" "}
  <CopyButton text="npm i -g smthrs@next" small />
</p>
