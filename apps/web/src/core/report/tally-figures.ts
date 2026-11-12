import { YEN } from "../commodity/commodity"
import { decimal, negate, sum, quotient, type Decimal } from "../decimal/decimal"
import type { NetCounts } from "../tally/tally"
import type { BalanceReport, Transaction } from "../../hledger/protocol/wire"
import { decimalOfQuantity, quantityIn } from "./figures"
import { tallyNotesOf } from "./tally-notes"

/**
 * A tally's own figures, never what a cabinet's counter showed: the cash
 * it spent and the tokens it drew from savings, as hledger summed them,
 * and as its entry says them what its play's log counted of the person's
 * own playing, the spin performance measured and the border broken even
 * at, what a regular spin (or a game) was worth, and how long it lasted —
 * each where the entry says.
 */
export interface TallyFigures {
  readonly cash: Decimal
  /** Tokens drawn from the book's savings: never those it does not keep (簿外貯玉). */
  readonly savingsDrawn: Decimal
  readonly netCounts: NetCounts | undefined
  readonly spinPerformance: Decimal | undefined
  readonly realBorder: Decimal | undefined
  /** Yen a regular spin, or a pachislot game, was worth: the tally's theoretical value over them. */
  readonly theoreticalPerSpin: Decimal | undefined
  readonly playSeconds: Decimal | undefined
}

/** Places a spin's or a game's worth is kept to. */
const PER_SPIN_PLACES = 2

/** The regular spins, or the games, a tally's worth is spread over: none where its log counted none. */
const spunOf = (counts: NetCounts | undefined): number | undefined => {
  if (counts === undefined) return undefined
  switch (counts.type) {
    case "pachinko":
      return counts.regularSpins
    case "at-machine":
    case "bonus-machine":
    case "games":
      return counts.games
  }
}

const perSpinOf = (theoretical: Decimal | undefined, spun: number | undefined): Decimal | undefined =>
  theoretical === undefined || spun === undefined || spun <= 0 ? undefined : quotient(theoretical, decimal(BigInt(spun), 0), PER_SPIN_PLACES)

/**
 * A tally's own figures, by its entry, by hledger's sum of the cash it
 * spent and the savings it drew (`spentAndDrawnRequest`) — the yen in it
 * the cash, every other commodity tokens — and by the theoretical value it
 * is held to, where it holds one.
 */
export const tallyFiguresOf = (transaction: Transaction, spentAndDrawn: BalanceReport, theoretical: Decimal | undefined): TallyFigures => {
  const notes = tallyNotesOf(transaction)
  const total = spentAndDrawn.prTotals.prrTotal
  return {
    cash: negate(quantityIn(total, YEN)),
    savingsDrawn: negate(sum(total.filter((amount) => amount.acommodity !== YEN).map((amount) => decimalOfQuantity(amount.aquantity)))),
    netCounts: notes.aside.netCounts,
    spinPerformance: notes.aside.spinPerformance,
    realBorder: notes.aside.realBorder,
    theoreticalPerSpin: perSpinOf(theoretical, spunOf(notes.aside.netCounts)),
    playSeconds: notes.playSeconds,
  }
}
