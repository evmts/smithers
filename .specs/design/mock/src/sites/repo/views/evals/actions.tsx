import { useEffect } from "react"
import { navigate } from "../../../core/router"
import { repo, to } from "../../fixtures"
import { registerSlash } from "../../frame"
import { configuredEvals } from "./model"

/* Ask and buttons open the same confirmation; permissions are checked again there. */
export const useEvalCommands = () => {
  useEffect(() => {
    const dispose = [
      registerSlash("eval.run", {
        purpose: "Run an eval", confirm: false,
        fields: [{ name: "suite", label: "Suite", options: configuredEvals().map(suite => suite.id) }],
        run: ({ suite }, { closeAsk }) => {
          navigate(to(`evals/${encodeURIComponent(suite)}?act=run`))
          closeAsk()
        }
      }),
      registerSlash("eval.cancel", {
        purpose: "Close eval confirmation", confirm: false, access: "public", fields: [],
        run: (_, { closeAsk, location }) => { navigate(location.replace(/([?&])act=run(&|$)/, "$1").replace(/[?&]$/, "")); closeAsk() }
      })
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [repo.slug])
}
