import { describe, expect, test } from "bun:test"

import { exchangeRateOf, type PlayTerms } from "../../src/core/parlor/terms"
import { renderEntry } from "../../src/core/journal/entry"
import { composeTokenTallyEntry } from "../../src/core/tally/compose"
import type { PlayId } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import { tokenTallyResultOf } from "../../src/core/tally/result"
import { formatSignedYen } from "../../src/ui/wording/numbers"
import { machineChoicesOf } from "../../src/ui/features/live/finish-tally-reading"
import { playedOnTerms, pricesPlayedOn, readFinishTokenTallyForm, type FinishTokenTallyForm, type PlayedOnTerms } from "../../src/ui/features/live/finish-token-tally-form"
import type { MachineSummary } from "../../src/core/catalog/catalog"
import type { MachineId } from "../../src/core/machine/machine"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { PRICES, UMEDA, dec } from "../support/values"

const ID = "new" as PlayId

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 275 } }

const AT: PlayedOnTerms = playedOnTerms(UMEDA, TERMS, "pachinko")

const FORM: FinishTokenTallyForm = {
  date: "2026-10-03",
  machine: "流星",
  cabinetNumber: "",
  outlay: "",
  replayPaidOut: "",
  carriedIn: "",
  payout: "",
  theoreticalValue: "",
}

describe("the form a play followed live at a parlor is recorded with", () => {
  test("counts the tokens a play was begun with against what it left, at no fee", () => {
    const read = readFinishTokenTallyForm({ ...FORM, carriedIn: "1,500", payout: "2000" }, AT, ID)
    expect(read.ok && [read.value.carriedIn, read.value.replay, read.value.payout]).toEqual([dec("1500"), { paidOut: dec("0"), deducted: dec("0") }, dec("2000")])
    expect(read.ok && tokenTallyResultOf(read.value, dec("3.5"))).toEqual(dec("1750.0"))
  })

  test("composes a tally of cash at a pool the book has yet to hear of, on the rate its terms state", () => {
    const elsewhere = playedOnTerms({ ...UMEDA, name: "スーパーホール", pools: [] }, TERMS, "pachinko")
    const read = readFinishTokenTallyForm({ ...FORM, date: "2026-10-11", outlay: "5000" }, elsewhere, ID)
    expect(read.ok && composeTokenTallyEntry(read.value, []).ok).toBe(false)
    expect(read.ok && composeTokenTallyEntry(read.value, pricesPlayedOn(elsewhere, read.value.date, [])).ok).toBe(true)
    expect(read.ok && mapOk(composeTokenTallyEntry(read.value, pricesPlayedOn(elsewhere, read.value.date, PRICES)), renderEntry)).toMatchObject({ ok: true, value: expect.stringContaining('1250 "玉(4円・スーパーホール)" @ 3.571429 JPY') })
  })

  test("works out the tokens rented and the savings a replay took from the play's terms", () => {
    const read = readFinishTokenTallyForm({ ...FORM, outlay: "12,000", replayPaidOut: "1000", payout: "4000" }, AT, ID)
    expect(read.ok && [read.value.pool, read.value.rental, read.value.replay]).toEqual([
      { kind: "ball", tier: "4円" },
      { outlay: dec("12000"), tokens: dec("3000") },
      { paidOut: dec("1000"), deducted: dec("1100") },
    ])
  })

  test("empty counts are zero, no outlay means no rental, and an empty theoretical value is none", () => {
    const read = readFinishTokenTallyForm({ ...FORM, payout: "10" }, AT, ID)
    expect(read.ok && [read.value.rental, read.value.replay, read.value.theoreticalValue]).toEqual([undefined, { paidOut: dec("0"), deducted: dec("0") }, undefined])
  })

  test("reports every field it could not read, not only the first", () => {
    expect(readFinishTokenTallyForm({ ...FORM, date: "2026-13-01", outlay: "千円", payout: "x" }, AT, ID)).toEqual({
      ok: false,
      error: [
        { field: "date", reason: "not-a-date" },
        { field: "outlay", reason: "not-a-number" },
        { field: "payout", reason: "not-a-number" },
      ],
    })
  })

  test("comes to a result in yen by the play's terms: what is left over the savings a replay took, exchanged, less the cash spent", () => {
    const result = (form: Partial<FinishTokenTallyForm>): string => ((read) => (read.ok ? formatSignedYen(tokenTallyResultOf(read.value, exchangeRateOf(TERMS))) : "unread"))(readFinishTokenTallyForm({ ...FORM, ...form }, AT, ID))
    expect(result({ outlay: "12,000", replayPaidOut: "1000", payout: "4000" })).toBe("-¥1,643")
    expect(result({ outlay: "5000" })).toBe("-¥5,000")
    expect(result({})).toBe("¥0")
  })
})

describe("the machines a play followed live may name", () => {
  const STEINS: MachineSummary = { id: "m1" as MachineId, gameKind: "pachinko", name: "Pシュタインズ・ゲート・ゼロ まゆしぃば~じょん", modelName: "PA STEINS;GATE0", keywords: [], hitChance: "1/99.9", formulaHitChances: [], releasedOn: "2025-01-01" as IsoDate, formulaCount: 1 }

  test("are the catalog's, and keep the one it was followed on where the catalog lacks it", () => {
    expect(machineChoicesOf([STEINS], "海物語").map((option) => option.value)).toEqual(["海物語", "PA STEINS；GATE0"])
    expect(machineChoicesOf([STEINS], "").map((option) => option.value)).toEqual(["PA STEINS；GATE0"])
  })
})
