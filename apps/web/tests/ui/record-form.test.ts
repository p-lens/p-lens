import { describe, expect, test } from "bun:test"

import { exchangeRateOf, type PlayTerms } from "../../src/core/parlor/terms"
import { renderEntry } from "../../src/core/journal/entry"
import { composePlayEntry } from "../../src/core/play/compose"
import type { PlayId } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import { playResultOf } from "../../src/core/play/result"
import { formatSignedYen } from "../../src/ui/wording/numbers"
import { formOfRecord, playedAsRecorded, playedOnTerms, pricesPlayedAt, readPlayForm, type PlayedAt, type PlayForm } from "../../src/ui/features/record-play/form"
import { PRICES, RENTED_PLAY, UMEDA, dec } from "../support/values"

const ID = "new" as PlayId

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 275 } }

const AT: PlayedAt = playedOnTerms(UMEDA, TERMS, "pachinko")

const FORM: PlayForm = {
  date: "2026-10-03",
  machine: "流星",
  cabinetNumber: "",
  outlay: "",
  rentalTokens: "",
  replayPaidOut: "",
  replayDeducted: "",
  carriedIn: "",
  payout: "",
  theoreticalValue: "",
}

describe("the record form", () => {
  test("counts the tokens a play was begun with against what it left, at no fee", () => {
    const read = readPlayForm({ ...FORM, carriedIn: "1,500", payout: "2000" }, AT, ID)
    expect(read.ok && [read.value.carriedIn, read.value.replay, read.value.payout]).toEqual([dec("1500"), { paidOut: dec("0"), deducted: dec("0") }, dec("2000")])
    expect(read.ok && playResultOf(read.value, dec("3.5"))).toEqual(dec("1750.0"))
  })

  test("composes a play of cash at a pool the book has yet to hear of, on the rate its terms state", () => {
    const elsewhere = playedOnTerms({ ...UMEDA, name: "スーパーホール", pools: [] }, TERMS, "pachinko")
    const read = readPlayForm({ ...FORM, date: "2026-10-11", outlay: "5000" }, elsewhere, ID)
    expect(read.ok && composePlayEntry(read.value, []).ok).toBe(false)
    expect(read.ok && composePlayEntry(read.value, pricesPlayedAt(elsewhere, read.value.date, [])).ok).toBe(true)
    expect(read.ok && mapOk(composePlayEntry(read.value, pricesPlayedAt(elsewhere, read.value.date, PRICES)), renderEntry)).toMatchObject({ ok: true, value: expect.stringContaining('1250 "玉(4円・スーパーホール)" @ 3.571429 JPY') })
  })

  test("works out the tokens rented and the savings a replay took from the play's terms", () => {
    const read = readPlayForm({ ...FORM, outlay: "12,000", replayPaidOut: "1000", payout: "4000" }, AT, ID)
    expect(read.ok && [read.value.pool, read.value.rental, read.value.replay]).toEqual([
      { kind: "ball", tier: "4円" },
      { outlay: dec("12000"), tokens: dec("3000") },
      { paidOut: dec("1000"), deducted: dec("1100") },
    ])
  })

  test("empty counts are zero, no outlay means no rental, and an empty theoretical value is none", () => {
    const read = readPlayForm({ ...FORM, payout: "10" }, AT, ID)
    expect(read.ok && [read.value.rental, read.value.replay, read.value.theoreticalValue]).toEqual([undefined, { paidOut: dec("0"), deducted: dec("0") }, undefined])
  })

  test("reports every field it could not read, not only the first", () => {
    expect(readPlayForm({ ...FORM, date: "2026-13-01", outlay: "千円", payout: "x" }, AT, ID)).toEqual({
      ok: false,
      error: [
        { field: "date", reason: "not-a-date" },
        { field: "outlay", reason: "not-a-number" },
        { field: "payout", reason: "not-a-number" },
      ],
    })
  })

  test("comes to a result in yen by the play's terms: what is left over the savings a replay took, exchanged, less the cash spent", () => {
    const result = (form: Partial<PlayForm>): string => ((read) => (read.ok ? formatSignedYen(playResultOf(read.value, exchangeRateOf(TERMS))) : "unread"))(readPlayForm({ ...FORM, ...form }, AT, ID))
    expect(result({ outlay: "12,000", replayPaidOut: "1000", payout: "4000" })).toBe("-¥1,643")
    expect(result({ outlay: "5000" })).toBe("-¥5,000")
    expect(result({})).toBe("¥0")
  })
})

describe("the record form, setting a recorded play right", () => {
  const REPLAYED = { ...RENTED_PLAY, replay: { paidOut: dec("1000"), deducted: dec("1100") } }

  test("opens as the play was recorded, and reads back the same play", () => {
    expect(readPlayForm(formOfRecord(REPLAYED), playedAsRecorded(REPLAYED, PRICES), REPLAYED.id)).toEqual({ ok: true, value: REPLAYED })
    expect(readPlayForm(formOfRecord(RENTED_PLAY), playedAsRecorded(RENTED_PLAY, PRICES), RENTED_PLAY.id)).toEqual({ ok: true, value: RENTED_PLAY })
  })

  test("counts a sum typed anew in the proportion the play itself was counted in", () => {
    const read = readPlayForm({ ...formOfRecord(REPLAYED), outlay: "16000", replayPaidOut: "500" }, playedAsRecorded(REPLAYED, PRICES), REPLAYED.id)
    expect(read.ok && [read.value.rental, read.value.replay]).toEqual([
      { outlay: dec("16000"), tokens: dec("4000") },
      { paidOut: dec("500"), deducted: dec("550") },
    ])
  })

  test("reads the counts as typed where the play gives no proportion, a replay left without one taking what it paid out", () => {
    const drawn = { ...RENTED_PLAY, rental: undefined }
    const at = playedAsRecorded(drawn, PRICES)
    const read = (form: Partial<PlayForm>) => ((found) => found.ok && [found.value.rental, found.value.replay])(readPlayForm({ ...formOfRecord(drawn), ...form }, at, drawn.id))
    expect([at.rental, at.replay]).toEqual([undefined, undefined])
    expect(read({ outlay: "2000", rentalTokens: "500", replayPaidOut: "1000" })).toEqual([{ outlay: dec("2000"), tokens: dec("500") }, { paidOut: dec("1000"), deducted: dec("1000") }])
    expect(read({ replayPaidOut: "1000", replayDeducted: "1100" })).toEqual([undefined, { paidOut: dec("1000"), deducted: dec("1100") }])
  })

  test("values its tokens at the book's rate for the day it says, and at the pool's first for a day before any", () => {
    const at = playedAsRecorded(RENTED_PLAY, PRICES)
    expect([at.exchangeRateOn("2026-09-05" as never), at.exchangeRateOn("2026-10-01" as never), at.exchangeRateOn("2026-08-01" as never)]).toEqual([dec("3.57"), dec("3.5"), dec("3.57")])
  })
})
