import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayTerms } from "../../src/core/parlor/terms"
import type { PlayId } from "../../src/core/play/play"
import { tokenTallyFormFromDraft, type PlayedSoFar } from "../../src/ui/features/record-tally/form"
import { heldIn, sidesFromTokens, yenTallyFormFromDraft, tokenCountsFromDraft, type YenTallyForm } from "../../src/ui/features/record-tally/yen-tally-form"
import { UMEDA } from "../support/values"

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

const sides = (form: YenTallyForm): readonly string[] => [form.outlay, form.takings]

describe("a play followed live, as it is recorded", () => {
  test("leaves at its parlor the tokens counted in hand at its last line", () => {
    expect(tokenTallyFormFromDraft(DRAFT, PLAYED).payout).toBe("4500")
    expect(tokenTallyFormFromDraft(DRAFT, { ...PLAYED, held: undefined }).payout).toBe("")
  })

  test("is begun with the tokens its first line counted in hand, which are not what it made", () => {
    expect(tokenTallyFormFromDraft(DRAFT, { ...PLAYED, carriedIn: 1500 }).carriedIn).toBe("1500")
    expect(tokenTallyFormFromDraft(DRAFT, PLAYED).carriedIn).toBe("")
    expect(sides(yenTallyFormFromDraft(NOWHERE, { ...PLAYED, outlay: 0, carriedIn: 1500, held: 2900 }))).toEqual(["6000", "11600"])
  })

  test("with no parlor, is counted by the tokens typed as it is recorded, and its two sides follow them", () => {
    const counts = tokenCountsFromDraft(NOWHERE, { ...PLAYED, outlay: 500, held: undefined })
    expect(counts).toEqual({ carriedIn: "", held: "", tokenValue: 4, outlay: 500 })
    expect(counts === undefined ? undefined : sidesFromTokens(counts)).toBeUndefined()
    expect(counts === undefined ? undefined : sidesFromTokens({ ...counts, held: "25" })).toEqual({ outlay: "500", takings: "100" })
    expect(counts === undefined ? undefined : sidesFromTokens({ ...counts, carriedIn: "25", held: "１２５" })).toEqual({ outlay: "600", takings: "500" })
    expect(counts === undefined ? undefined : sidesFromTokens({ ...counts, held: "2.5" })).toBeUndefined()
    expect(counts === undefined ? undefined : heldIn({ ...counts, held: "25" })).toBe(25)
    expect(tokenCountsFromDraft({ ...DRAFT, venue: { type: "none", terms: undefined } }, PLAYED)).toBeUndefined()
  })

  test("with no parlor, put in the cash spent and took back those tokens exchanged", () => {
    expect(sides(yenTallyFormFromDraft(NOWHERE, PLAYED))).toEqual(["12000", "18000"])
    expect(sides(yenTallyFormFromDraft(NOWHERE, { ...PLAYED, held: 0 }))).toEqual(["12000", "0"])
  })

  test("has the cash spent alone where nothing was counted at the finish, or the play has no terms", () => {
    expect(sides(yenTallyFormFromDraft(NOWHERE, { ...PLAYED, held: undefined }))).toEqual(["12000", ""])
    expect(sides(yenTallyFormFromDraft({ ...DRAFT, venue: { type: "none", terms: undefined } }, PLAYED))).toEqual(["12000", ""])
  })
})
