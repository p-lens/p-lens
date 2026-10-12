import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayTerms } from "../../src/core/parlor/terms"
import type { PlayId } from "../../src/core/play/play"
import { formFromDraft, type PlayedSoFar } from "../../src/ui/features/record-play/form"
import { tallyFormFromDraft } from "../../src/ui/features/record-play/tally-form"
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

const PLAYED: PlayedSoFar = { outlay: 12_000, replay: undefined, carriedIn: undefined, held: 4500, theoreticalValue: undefined }

describe("a play followed live, as it is recorded", () => {
  test("leaves at its parlor the tokens counted in hand at its last line", () => {
    expect(formFromDraft(DRAFT, PLAYED).payout).toBe("4500")
    expect(formFromDraft(DRAFT, { ...PLAYED, held: undefined }).payout).toBe("")
  })

  test("is begun with the tokens its first line counted in hand, which are not what it made", () => {
    expect(formFromDraft(DRAFT, { ...PLAYED, carriedIn: 1500 }).carriedIn).toBe("1500")
    expect(formFromDraft(DRAFT, PLAYED).carriedIn).toBe("")
    expect(tallyFormFromDraft(NOWHERE, { ...PLAYED, outlay: 0, carriedIn: 1500, held: 2900 }).result).toBe("5600")
  })

  test("with no parlor, comes to those tokens exchanged less the cash spent", () => {
    expect(tallyFormFromDraft(NOWHERE, PLAYED).result).toBe("6000")
    expect(tallyFormFromDraft(NOWHERE, { ...PLAYED, held: 0 }).result).toBe("-12000")
  })

  test("has no result worked out where nothing was counted at the end, or the play has no terms", () => {
    expect(tallyFormFromDraft(NOWHERE, { ...PLAYED, held: undefined }).result).toBe("")
    expect(tallyFormFromDraft({ ...DRAFT, venue: { type: "none", terms: undefined } }, PLAYED).result).toBe("")
  })
})
