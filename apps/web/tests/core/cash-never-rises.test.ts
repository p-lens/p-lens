import { readdir, readFile } from "node:fs/promises"

import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { importedTallyEntry, type SourceTally } from "../../src/core/import/source-tally"
import { ACCOUNTS } from "../../src/core/journal/accounts"
import type { Entry } from "../../src/core/journal/entry"
import { composeTokenTallyEntry, composeYenTallyEntry } from "../../src/core/tally/compose"
import type { YenTally } from "../../src/core/tally/tally"
import type { PlayId } from "../../src/core/play/play"
import { balanceAdjustmentEntry, openingBalanceEntry } from "../../src/core/savings/balance"
import { forfeitureEntry } from "../../src/core/savings/forfeiture"
import { prizeExchangeEntry } from "../../src/core/savings/prize-exchange"
import { PRICES, RENTED_PLAY, MALEHAN, dec } from "../support/values"

const SRC = new URL("../../src/", import.meta.url).pathname

const DAY = "2026-10-04" as IsoDate

const POOL = { kind: "ball", tier: "4円" } as const

/** Two sides in yen as text: a loss, an even play, gains small and large, a gain from nothing put in, and one that leaves part of a yen. */
const SIDES: readonly (readonly [string, string])[] = [
  ["12000", "0"],
  ["5000", "5000"],
  ["5000", "5000.5"],
  ["12000", "30000"],
  ["0", "20000"],
  ["1", "1000000"],
]

const TALLIED: YenTally = { id: "tally" as PlayId, date: DAY, parlor: undefined, gameKind: "pachinko", machine: "e風の剣豪", cabinetNumber: undefined, outlay: dec("0"), takings: dec("0"), settlement: undefined, theoreticalValue: undefined, told: undefined }

const SOURCE: SourceTally = { date: DAY, parlor: { name: "マレハン東京皇国店", code: "S123" }, machine: { name: "流星の剣", code: "M9", maker: "ミナト" }, cabinetNumber: "123", outlay: dec("0"), takings: dec("0"), memo: "", hours: undefined }

const made = (entry: { readonly ok: true; readonly value: Entry } | { readonly ok: false }): readonly Entry[] => (entry.ok ? [entry.value] : [])

/** Every entry the app composes, each in the cases where money came back: a play followed live, one typed in by its two sides, one at no parlor settled against savings the book does not keep or in cash and prizes, one taken in from another app, a prize exchange, savings opened or put right, and savings a parlor took back. */
const ENTRIES: readonly Entry[] = [
  ...made(composeTokenTallyEntry(RENTED_PLAY, PRICES)),
  ...made(composeTokenTallyEntry({ ...RENTED_PLAY, payout: dec("48000") }, PRICES)),
  ...made(composeTokenTallyEntry({ ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("4000"), deducted: dec("4000") }, payout: dec("90000"), theoreticalValue: undefined }, PRICES)),
  ...SIDES.flatMap(([outlay, takings]) => made(composeYenTallyEntry({ ...TALLIED, outlay: dec(outlay), takings: dec(takings) }))),
  ...SIDES.flatMap(([outlay, takings]) => made(composeYenTallyEntry({ ...TALLIED, outlay: dec(outlay), takings: dec(takings), settlement: { type: "off-book-savings", cash: dec(outlay) } }))),
  ...SIDES.flatMap(([outlay, takings]) => made(composeYenTallyEntry({ ...TALLIED, outlay: dec(outlay), takings: dec(takings), settlement: { type: "off-book-savings", cash: dec("0") } }))),
  ...SIDES.flatMap(([outlay, takings]) => made(composeYenTallyEntry({ ...TALLIED, outlay: dec(outlay), takings: dec(takings), settlement: { type: "cash-and-prizes" } }))),
  ...SIDES.flatMap(([outlay, takings]) => made(composeYenTallyEntry({ ...TALLIED, outlay: dec(outlay), takings: dec(takings).places > 0 ? dec("0") : dec(takings), settlement: { type: "off-book-exchanged", cash: dec("0"), oddPrizes: dec("0") } }))),
  ...SIDES.map(([outlay, takings]) => importedTallyEntry({ id: "taken-in" as PlayId, from: "precord", source: { ...SOURCE, outlay: dec(outlay), takings: dec(takings) }, machine: undefined, inferred: undefined })),
  ...["16500", "16800", "17000", "0"].flatMap((specialPrizes) => made(prizeExchangeEntry({ parlor: MALEHAN, pool: POOL, date: DAY, tokens: dec("4800"), specialPrizes: dec(specialPrizes) }, PRICES))),
  openingBalanceEntry({ parlor: MALEHAN, pool: POOL, date: DAY }, dec("12000")),
  balanceAdjustmentEntry({ parlor: MALEHAN, pool: POOL, date: DAY }, dec("300")),
  balanceAdjustmentEntry({ parlor: MALEHAN, pool: POOL, date: DAY }, dec("-300")),
  ...made(forfeitureEntry({ parlor: MALEHAN, pool: POOL, date: DAY, tokens: dec("4800") })),
]

const sourceFiles = async (): Promise<readonly string[]> => (await readdir(SRC, { recursive: true })).filter((path) => /\.tsx?$/.test(path)).sort()

const naming = async (pattern: RegExp): Promise<readonly string[]> => {
  const files = await sourceFiles()
  const texts = await Promise.all(files.map((path) => readFile(`${SRC}${path}`, "utf8")))
  return files.filter((_, index) => pattern.test(texts[index] ?? ""))
}

describe("cash never rises", () => {
  test("no entry the app composes puts a positive amount to 資産:現金, whatever came back", () => {
    expect(ENTRIES.length).toBe(47)
    const raised = ENTRIES.flatMap((entry) => entry.postings.filter((posting) => posting.account === ACCOUNTS.cash && posting.amount.quantity.mantissa > 0n).map((posting) => [entry.description, posting.amount.quantity]))
    expect(raised).toEqual([])
  })

  test("a gain in yen is prizes taken home, in equity: the special prizes and the part of a yen left over", () => {
    const gains = SIDES.filter(([outlay, takings]) => Number(takings) > Number(outlay)).flatMap(([outlay, takings]) => made(composeYenTallyEntry({ ...TALLIED, outlay: dec(outlay), takings: dec(takings) })))
    expect(gains.length).toBe(4)
    expect(gains.every((entry) => entry.postings.some((posting) => posting.account === ACCOUNTS.specialPrizes || posting.account === ACCOUNTS.translationAdjustment))).toBe(true)
    expect(gains.some((entry) => entry.postings.some((posting) => posting.account === ACCOUNTS.cash))).toBe(false)
  })

  test("the cash account is named in these files and no others: two compose a tally's postings, the rest read them — a new writer is added here, with its gains above", async () => {
    expect(await naming(/ACCOUNTS\.cash/)).toEqual(["application/overall.ts", "core/report/cash-raised.ts", "core/report/recorded-tally.ts", "core/tally/compose.ts", "core/tally/sides.ts", "hledger/query/terms.ts"])
    expect(await naming(/資産:現金/)).toEqual(["app/composition/first-book.ts", "application/edit-file.ts", "core/journal/accounts.ts", "core/report/cash-raised.ts", "ui/wording/errors.ts"])
  })
})
