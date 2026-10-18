/* Code home owns only the exact repo-root route. Tree/blob/etc live in the code family. */
import type { Route } from "../../../core/router"
import { CodeHome } from "./CodeHome"
const screen = (id: string, query: string, label: string) => ({ id: `code-home-${id}`, route: `smithers.sh/maya/tinyhttp?${query}`, label })
export const routes: Route[] = [{
  pattern: "smithers.sh/:owner/:repo",
  name: "Repository · Code",
  render: context => <CodeHome owner={context.params.owner} name={context.params.repo}/>,
  screens: [
    screen("ask-change-slash", "as=in&role=member&net=ok&data=full&landing=open&ask=%2Fchange%20add%20slugify(text)%20with%20tests", "Ask change · slash admitted"),
    screen("ask-change-slash-form", "as=in&role=member&net=ok&data=full&landing=open&ask=%2Fchange", "Ask change · slash form"),
    screen("ask-change-slash-reader", "as=in&role=reader&net=ok&data=full&landing=open&ask=%2Fchange%20add%20slugify(text)%20with%20tests", "Ask change · slash denied"),
    ...["confirm", "admitted", "allocating", "cloning", "model", "testing", "ready", "tests-failed", "zero-tests", "count-unknown", "no-tests", "pr", "pr-error", "merged", "refused", "diff", "reader", "signed-out"].map(state => screen(`ask-change-${state}`, `as=${state === "signed-out" ? "out" : "in"}&role=${state === "reader" ? "reader" : "member"}&guest=${state === "signed-out" ? "off" : "ok"}&net=ok&data=full&landing=open&ask=change&hosted=${state === "refused" ? "paused" : "up"}&change=${state === "diff" ? "ready" : state === "reader" || state === "signed-out" ? "confirm" : state}${state === "diff" ? "&diff=landing-12" : ""}`, (state === "signed-out" ? "Ask change · signed out: Ask is the sign-in door, Ask stays closed" : `Ask change · ${state.replaceAll("-", " ")}`))),
    screen("signed-out", "as=out&guest=off&net=ok&data=full", "Code · signed out"),
    screen("reader", "as=in&role=reader&net=ok&data=full", "Code · reader"),
    screen("member", "as=in&role=member&net=ok&data=full", "Code · member"),
    screen("loading", "as=in&role=member&net=slow&data=full", "Code · loading"),
    screen("error", "as=in&role=member&net=error&data=full", "Code · repository read failed"),
    screen("empty", "as=in&role=member&net=ok&data=empty", "Code · empty repository"),
    screen("sync-stale", "as=in&role=member&net=ok&data=full&sync=stale", "Code · synced 3 h ago"),
    screen("sync-failed", "as=in&role=member&net=ok&data=full&sync=error", "Code · GitHub sync failed"),
    screen("sync-failed-visitor", "as=out&guest=off&net=ok&data=full&sync=error", "Code · GitHub sync failed, visitor: no reason"),
    screen("clone", "as=in&role=member&net=ok&data=full&menu=code", "Code · clone menu"),
    screen("sandbox", "as=in&role=member&net=ok&data=full&dialog=sandbox", "Code · sandbox confirmation"),
    screen("denied", "as=in&role=reader&net=ok&data=full&dialog=sandbox", "Code · sandbox needs membership"),
    screen("guest", "as=out&guest=ok&net=ok&data=full", "Code · guest questions"),
    screen("guest-limit", "as=out&guest=ceiling&net=ok&data=full&ask=limit", "Code · guest daily limit"),
    screen("held", "as=in&role=member&landing=install&net=ok&data=full&ask=change", "Code · hosted changes held"),
    ...["approval", "todo", "view"].map(act => screen(`ask-agent-${act}`, `as=in&role=member&net=ok&data=full&ask=${act}`, `Ask · agent opens ${act}`)),
    screen("ask-sample", "as=in&role=member&net=ok&data=full&ask=sample", "Code · sample Ask exchange"),
    screen("ask-commands", "as=in&role=member&net=ok&data=full&ask=%2F", "Ask · slash commands"),
    screen("ask-command-form", "as=in&role=member&net=ok&data=full&ask=%2Fbox.open", "Ask · missing branch"),
    screen("ask-command-confirm", "as=in&role=member&net=ok&data=full&ask=%2Fbox.open%20main", "Ask · sandbox confirmation"),
    screen("ask-command-denied", "as=in&role=reader&net=ok&data=full&ask=%2Fbox.open%20main", "Ask · sandbox needs membership"),
    screen("ask-command-signed-out", "as=out&guest=off&net=ok&data=full&ask=%2Fbox.open%20main", "Ask · signed out: Ask is the sign-in door, Ask stays closed"),
    screen("ask-search-form", "as=in&role=reader&net=ok&data=full&ask=%2Fsearch", "Ask · search form"),
    screen("ask-copy-form", "as=in&role=reader&net=ok&data=full&ask=%2Fcopy", "Ask · copy form"),
    screen("ask-question-form", "as=in&role=member&net=ok&data=full&ask=%2Fask", "Ask · question form"),
    screen("ask-theme-form", "as=in&role=member&net=ok&data=full&ask=%2Ftheme", "Ask · theme form"),
    screen("ask-user-only", "as=in&role=member&net=ok&data=full&ask=%2Ftheme%20dark", "Ask · theme needs your click"),
    screen("ask-answer-error", "as=in&role=member&net=error&data=full&ask=sample", "Ask · failed answer and Retry"),
    { id: "code-home-smithers", route: "smithers.sh/smithers-canary/smithers?as=in&role=member&net=ok&data=full", label: "Code · Smithers" },
    { id: "code-home-effeck", route: "smithers.sh/effeck/effeck?as=in&role=member&net=ok&data=full", label: "Code · VibeLang" },
    { id: "code-home-effect", route: "smithers.sh/Effect-TS/effect?as=in&role=member&net=ok&data=full", label: "Code · Effect" },
    { id: "code-home-not-imported-signed-out", route: "smithers.sh/maya/not-imported?as=out&net=ok&data=full", label: "Repository not on Smithers · signed out" },
    { id: "code-home-not-imported-member", route: "smithers.sh/maya/not-imported?as=in&role=member&net=ok&data=full", label: "Repository not on Smithers · import" },
    { id: "code-home-ask-import-form", route: "smithers.sh/maya/not-imported?as=in&role=member&net=ok&data=full&ask=%2Frepo.import", label: "Ask · import form" }
  ]
}]
