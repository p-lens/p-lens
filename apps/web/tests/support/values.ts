import type { Parts } from "../../src/core/activity/activity"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { parseDecimal, type Decimal } from "../../src/core/decimal/decimal"
import type { Parlor, ParlorId } from "../../src/core/parlor/parlor"
import type { PlayId, PlayRecord } from "../../src/core/play/play"
import type { PricePoint } from "../../src/core/valuation/valuation"

/** A decimal written in a test; a typo there fails the test that wrote it. */
export const dec = (text: string): Decimal => {
  const parsed = parseDecimal(text)
  if (!parsed.ok) throw new Error(`not a decimal: ${text}`)
  return parsed.value
}

export const UMEDA: Parlor = {
  identity: { type: "listed", id: "hoshizora-umeda" as ParlorId },
  name: "ホシゾラ梅田店",
  pools: [
    { kind: "ball", tier: "4円" },
    { kind: "medal", tier: "20円" },
  ],
}

export const PRICES: readonly PricePoint[] = [
  { date: "2026-09-01" as IsoDate, commodity: "玉(4円・ホシゾラ梅田店)", rate: dec("3.57") },
  { date: "2026-09-25" as IsoDate, commodity: "玉(4円・ホシゾラ梅田店)", rate: dec("3.50") },
]

export const RENTED_PLAY: PlayRecord = {
  id: "made-up-0905" as PlayId,
  date: "2026-09-05" as IsoDate,
  parlor: UMEDA,
  pool: { kind: "ball", tier: "4円" },
  gameKind: "pachinko",
  machine: "流星",
  cabinetNumber: "123",
  rental: { outlay: dec("12000"), tokens: dec("3000") },
  replay: { paidOut: dec("0"), deducted: dec("0") },
  carriedIn: dec("0"),
  payout: dec("4800"),
  theoreticalValue: dec("5500"),
}

/** What a line of a book's activity says of its change, apart from what the change did to each file. */
export const saidIn = ({ changes: _changes, ...said }: Parts): Parts => said
