// D-2: these plain synchronous APIs call sibling TypeScript policy/model helpers.
import * as QuotaPolicy from "@smthrs/agent/QuotaPolicy"
import * as Seat from "@smthrs/agent/Seat"
import * as Providers from "@smthrs/cli/Providers"
import { Option } from "effect"
import { delegateSeat, labelOf, type Model, routeOf } from "./models.ts"

import { refusals, type Ledger } from "./credit.vibe"
export const exhaustedImpl = (error: unknown): boolean => {
  const model = QuotaPolicy.modelErrorOf(error)
  return Option.isSome(model) && refusals.has(model.value.code) && QuotaPolicy.isTerminalRefusal(model.value)
}

export const scopeOfImpl = (error: unknown): "model" | "account" => {
  const model = QuotaPolicy.modelErrorOf(error)
  return Option.isSome(model) && model.value.quotaScope === "model" ? "model" : "account"
}

export const noticeImpl = (from: string, to: string, models: ReadonlyArray<Model> = []): string =>
  `↪ ${labelOf(from, models)} has no credit · using ${labelOf(to, models)}`

export const makeImpl = (models: ReadonlyArray<Model>, routed: ReadonlyArray<string> = []): Ledger => {
  const spentRoutes = new Set<string>()
  const spentModels = new Set<string>()
  /** Seats refused, oldest first: an `auto` worker names the latest one that it routes over. */
  const refused: Array<string> = []
  const worked: Array<string> = []
  const route = (seat: string) => routeOf(seat, models)
  const model = (seat: string) => {
    const alias = seat.startsWith("claude-code:") ? seat.slice("claude-code:".length) : seat
    return `${route(seat)}:${(Providers.seatAliases[alias] ?? delegateSeat(alias)).split(":").at(-1)}`
  }
  const spent = (seat: string) => seat !== Seat.auto && (spentRoutes.has(route(seat)) || spentModels.has(model(seat)))
  return {
    spend: (seat, scope = "account") => {
      if (seat === Seat.auto) return
      if (scope === "model") spentModels.add(model(seat))
      else spentRoutes.add(route(seat))
      refused.push(seat)
    },
    answered: (seat) => {
      if (seat === Seat.auto) return
      const at = worked.indexOf(seat)
      if (at >= 0) worked.splice(at, 1)
      worked.push(seat)
    },
    spent,
    account: route,
    instead: (seat, chat) => {
      const from = seat !== Seat.auto
        ? spent(seat) ? seat : undefined
        : routed.length > 0 && routed.every(spent)
        ? refused.findLast((each) =>
          routed.some((alias) =>
            model(alias) === model(each) || (spentRoutes.has(route(each)) && route(alias) === route(each))
          )
        ) ?? routed[0]
        : undefined
      if (from === undefined) return undefined
      const to = [...worked.toReversed(), chat].find((each) => each !== Seat.auto && !spent(each))
      return to === undefined ? undefined : { from, to }
    },
    notice: (from, to) => noticeImpl(from, to, models)
  }
}

