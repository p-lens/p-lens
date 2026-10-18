import type { Transaction } from "../../hledger/protocol/wire"
import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { isZero } from "../decimal/decimal"
import { readSavingsAccount } from "../journal/accounts"
import { searchKeyOf } from "../text/search-key"
import type { ParlorHolding } from "./holdings"

/** The last day each parlor's savings moved, by its name: the latest entry that posts to any of its pools. */
export const lastMovedOf = (transactions: readonly Transaction[]): ReadonlyMap<string, IsoDate> =>
  transactions.reduce<ReadonlyMap<string, IsoDate>>((latest, transaction) => {
    const date = parseIsoDate(transaction.tdate)
    if (!date.ok) return latest
    const names = [...new Set(transaction.tpostings.flatMap((posting) => ((read) => (read === undefined ? [] : [read.parlorName]))(readSavingsAccount(posting.paccount))))]
    return new Map([...latest, ...names.filter((name) => (latest.get(name) ?? "") < date.value).map((name) => [name, date.value] as const)])
  }, new Map())

/** Whether a parlor holds nothing in any of its pools. */
export const holdsNothing = (holding: ParlorHolding): boolean => holding.tokens.every((token) => isZero(token.quantity))

/**
 * Parlors in the order they are shown: the one whose savings moved last
 * first, a parlor that never moved after every one that did, and parlors
 * alike in that by name. Nobody orders them by hand.
 */
export const inShowingOrder = (parlors: readonly ParlorHolding[], lastMoved: ReadonlyMap<string, IsoDate>): readonly ParlorHolding[] =>
  [...parlors].sort((left, right) => {
    const [leftDay, rightDay] = [lastMoved.get(left.parlorName) ?? "", lastMoved.get(right.parlorName) ?? ""]
    return leftDay !== rightDay ? (leftDay < rightDay ? 1 : -1) : left.parlorName.localeCompare(right.parlorName, "ja")
  })

/** The parlors whose name holds what was typed, widths, case and kana aside; every one where nothing was typed. */
export const namedLike = (parlors: readonly ParlorHolding[], typed: string): readonly ParlorHolding[] => {
  const key = searchKeyOf(typed)
  return key === "" ? parlors : parlors.filter((holding) => searchKeyOf(holding.parlorName).includes(key))
}
