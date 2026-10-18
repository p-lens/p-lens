import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayTerms } from "../../src/core/parlor/terms"
import type { PlayId } from "../../src/core/play/play"
import type { PlayedSoFar } from "../../src/ui/features/live/finish-tally-reading"
import { finishTokenTallyFormOf } from "../../src/ui/features/live/finish-token-tally-form"
import { exchangedFrom, finishYenTallyFormOf, heldIn, oddPrizesOf, offTheRate, rentedOf, readFinishYenTallyForm, resultOfFinishYenTally, type FinishYenTallyForm } from "../../src/ui/features/live/finish-yen-tally-form"
import { toPlainString } from "../../src/core/decimal/decimal"
import { UMEDA, dec } from "../support/values"

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 250 }, replay: { paidOut: 250, deducted: 250 } }

const DRAFT: PlayDraft = {
  id: "live-1" as PlayId,
  bookId: "live" as BookId,
  date: "2026-10-04" as IsoDate,
  venue: { type: "parlor", parlor: UMEDA, terms: TERMS },
  gameKind: "pachinko",
  machine: "流星",
  pachinko: undefined,
  cabinetNumber: undefined,
  startedAt: "2026-10-04T12:00:00.000Z",
  log: "",
}

const NOWHERE: PlayDraft = { ...DRAFT, venue: { type: "none", terms: TERMS } }

const PLAYED: PlayedSoFar = { outlay: 12_000, replay: undefined, carriedIn: undefined, held: 4500, theoreticalValue: undefined, spinPerformance: undefined }

/** The two sides a form at no parlor comes to, on its terms where it has them. */
const sidesAt = (terms: PlayTerms | undefined) => (form: FinishYenTallyForm): readonly string[] | undefined =>
  ((read) => (read.ok ? [toPlainString(read.value.outlay), toPlainString(read.value.takings)] : undefined))(readFinishYenTallyForm(form, terms, undefined, "live-1" as PlayId))

const sides = sidesAt(TERMS)

const sidesInYen = sidesAt(undefined)

describe("a play followed live, as it is recorded", () => {
  test("leaves at its parlor the tokens counted in hand at its last line", () => {
    expect(finishTokenTallyFormOf(DRAFT, PLAYED).payout).toBe("4500")
    expect(finishTokenTallyFormOf(DRAFT, { ...PLAYED, held: undefined }).payout).toBe("")
  })

  test("keeps the theoretical value its formula came to, to six places, whether at a parlor or at none", () => {
    expect(finishTokenTallyFormOf(DRAFT, { ...PLAYED, theoreticalValue: 1234.56789012 }).theoreticalValue).toBe("1234.56789")
    expect(finishYenTallyFormOf(NOWHERE, { ...PLAYED, theoreticalValue: -0.1234567 }).theoreticalValue).toBe("-0.123457")
    expect(finishTokenTallyFormOf(DRAFT, { ...PLAYED, theoreticalValue: 800 }).theoreticalValue).toBe("800")
  })

  test("is begun with the tokens its first line counted in hand, which are not what it made", () => {
    expect(finishTokenTallyFormOf(DRAFT, { ...PLAYED, carriedIn: 1500 }).carriedIn).toBe("1500")
    expect(finishTokenTallyFormOf(DRAFT, PLAYED).carriedIn).toBe("")
    expect(sides(finishYenTallyFormOf(NOWHERE, { ...PLAYED, outlay: 0, carriedIn: 1500, held: 2900 }))).toEqual(["6000", "11600"])
  })

  test("with no parlor, opens on the cash spent and the tokens its log counted, as a play at a parlor does", () => {
    const form = finishYenTallyFormOf(NOWHERE, { ...PLAYED, outlay: 500, carriedIn: 25, held: undefined })
    expect([form.outlay, form.carriedIn, form.payout, form.takings]).toEqual(["500", "25", "", ""])
  })

  test("with no parlor, comes to its two sides from the cash spent and the tokens typed", () => {
    const form = finishYenTallyFormOf(NOWHERE, { ...PLAYED, outlay: 500, held: undefined })
    expect(sides(form)).toEqual(["500", "0"])
    expect(sides({ ...form, payout: "25" })).toEqual(["500", "100"])
    expect(sides({ ...form, carriedIn: "25", payout: "１２５" })).toEqual(["600", "500"])
    expect(sides({ ...form, payout: "2.5" })).toBeUndefined()
    expect(heldIn({ payout: "25" })).toBe(25)
    expect(((result) => (result === undefined ? undefined : toPlainString(result)))(resultOfFinishYenTally({ ...form, payout: "250" }, TERMS))).toBe("500")
  })

  test("with no parlor, put in the cash spent and took back those tokens exchanged", () => {
    expect(sides(finishYenTallyFormOf(NOWHERE, PLAYED))).toEqual(["12000", "18000"])
    expect(sides(finishYenTallyFormOf(NOWHERE, { ...PLAYED, held: 0 }))).toEqual(["12000", "0"])
  })

  test("with no parlor, puts what it drew from savings and was begun with in among what went in, all but the cash settled against savings the book does not keep", () => {
    const form = finishYenTallyFormOf(NOWHERE, { ...PLAYED, outlay: 5000, replay: 250, carriedIn: 1000, held: undefined })
    expect(form.replayPaidOut).toBe("250")
    const settled = (terms: PlayTerms) => ((read) => (read.ok ? [toPlainString(read.value.outlay), read.value.settlement] : undefined))(readFinishYenTallyForm(form, terms, undefined, "live-1" as PlayId))
    expect(settled(TERMS)).toEqual(["10000", { type: "off-book-savings", cash: dec("5000") }])
    expect(settled({ ...TERMS, replay: { paidOut: 250, deducted: 275 } })).toEqual(["10100", { type: "off-book-savings", cash: dec("5000") }])
    expect(sides({ ...form, replayPaidOut: "", carriedIn: "" })).toEqual(["5000", "0"])
  })

  test("with no parlor, takes the special prizes typed and the odd ones they leave at the rate as what came back where the tokens left were exchanged, and asks for the special prizes", () => {
    const form = { ...exchangedFrom(finishYenTallyFormOf(NOWHERE, { ...PLAYED, outlay: 5000, replay: 250, carriedIn: 1000, held: 4000 })), specialPrizes: "１５,０００" }
    expect(form.exchangedTokens).toBe("4000")
    const read = readFinishYenTallyForm(form, TERMS, undefined, "live-1" as PlayId)
    expect(read.ok && [toPlainString(read.value.outlay), toPlainString(read.value.takings), read.value.settlement]).toEqual(["10000", "16000", { type: "off-book-exchanged", cash: dec("5000"), oddPrizes: dec("1000") }])
    expect(oddPrizesOf(form, TERMS)).toEqual(dec("1000"))
    expect([form, { ...form, specialPrizes: "14900" }, { ...form, specialPrizes: "16000" }, { ...form, specialPrizes: "16100" }, { ...form, specialPrizes: "" }].map((each) => offTheRate(each, TERMS))).toEqual([false, true, false, true, false])
    const beyond = readFinishYenTallyForm({ ...form, specialPrizes: "17000" }, TERMS, undefined, "live-1" as PlayId)
    expect(beyond.ok && [toPlainString(beyond.value.takings), beyond.value.settlement]).toEqual(["17000", { type: "off-book-exchanged", cash: dec("5000"), oddPrizes: dec("0") }])
    const counted = readFinishYenTallyForm({ ...form, exchangedTokens: "3,800" }, TERMS, undefined, "live-1" as PlayId)
    expect(counted.ok && [toPlainString(counted.value.takings), counted.value.settlement]).toEqual(["15200", { type: "off-book-exchanged", cash: dec("5000"), oddPrizes: dec("200") }])
    const unsaid = readFinishYenTallyForm({ ...form, specialPrizes: "" }, TERMS, undefined, "live-1" as PlayId)
    expect(!unsaid.ok && unsaid.error).toEqual([{ field: "special-prizes", reason: "required" }])
  })

  test("with no parlor, shows the tokens its cash rented, as a play at a parlor does", () => {
    expect(rentedOf({ outlay: "11,000" }, TERMS)).toEqual(dec("2750"))
    expect(rentedOf({ outlay: "0" }, TERMS)).toBeUndefined()
    expect(rentedOf({ outlay: "x" }, TERMS)).toBeUndefined()
  })

  test("with no terms, has what came back typed in yen in the tokens' place", () => {
    const form = finishYenTallyFormOf({ ...DRAFT, venue: { type: "none", terms: undefined } }, PLAYED)
    expect(sidesInYen(form)).toEqual(["12000", "0"])
    expect(sidesInYen({ ...form, takings: "15,000" })).toEqual(["12000", "15000"])
    expect(((read) => read.ok && read.value.settlement)(readFinishYenTallyForm(form, undefined, undefined, "live-1" as PlayId))).toEqual({ type: "cash-and-prizes" })
  })
})
