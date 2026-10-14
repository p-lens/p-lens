import { describe, expect, test } from "bun:test"

import { tokenTallyFormOf, machineChoicesOf, playedAsRecorded, readTokenTallyForm, type TokenTallyForm } from "../../src/ui/features/record-tally/form"
import { PRICES, RENTED_PLAY, dec } from "../support/values"
import type { MachineSummary } from "../../src/core/catalog/catalog"
import type { MachineId } from "../../src/core/machine/machine"
import type { IsoDate } from "../../src/core/calendar/calendar"

describe("the form of a tally in tokens, setting a recorded tally right", () => {
  const REPLAYED = { ...RENTED_PLAY, replay: { paidOut: dec("1000"), deducted: dec("1100") } }

  test("opens as the tally was recorded, and reads back the same tally", () => {
    expect(readTokenTallyForm(tokenTallyFormOf(REPLAYED), playedAsRecorded(REPLAYED, PRICES), REPLAYED.id)).toEqual({ ok: true, value: REPLAYED })
    expect(readTokenTallyForm(tokenTallyFormOf(RENTED_PLAY), playedAsRecorded(RENTED_PLAY, PRICES), RENTED_PLAY.id)).toEqual({ ok: true, value: RENTED_PLAY })
  })

  test("counts a sum typed anew in the proportion the tally itself was counted in", () => {
    const read = readTokenTallyForm({ ...tokenTallyFormOf(REPLAYED), outlay: "16000", replayPaidOut: "500" }, playedAsRecorded(REPLAYED, PRICES), REPLAYED.id)
    expect(read.ok && [read.value.rental, read.value.replay]).toEqual([
      { outlay: dec("16000"), tokens: dec("4000") },
      { paidOut: dec("500"), deducted: dec("550") },
    ])
  })

  test("reads the counts as typed where the tally gives no proportion, a replay left without one taking what it paid out", () => {
    const drawn = { ...RENTED_PLAY, rental: undefined }
    const at = playedAsRecorded(drawn, PRICES)
    const read = (form: Partial<TokenTallyForm>) => ((found) => found.ok && [found.value.rental, found.value.replay])(readTokenTallyForm({ ...tokenTallyFormOf(drawn), ...form }, at, drawn.id))
    expect([at.rental, at.replay]).toEqual([undefined, undefined])
    expect(read({ outlay: "2000", rentalTokens: "500", replayPaidOut: "1000" })).toEqual([{ outlay: dec("2000"), tokens: dec("500") }, { paidOut: dec("1000"), deducted: dec("1000") }])
    expect(read({ replayPaidOut: "1000", replayDeducted: "1100" })).toEqual([undefined, { paidOut: dec("1000"), deducted: dec("1100") }])
  })

  test("values its tokens at the book's rate for the day it says, and at the pool's first for a day before any", () => {
    const at = playedAsRecorded(RENTED_PLAY, PRICES)
    expect([at.exchangeRateOn("2026-09-05" as never), at.exchangeRateOn("2026-10-01" as never), at.exchangeRateOn("2026-08-01" as never)]).toEqual([dec("3.57"), dec("3.5"), dec("3.57")])
  })
})

describe("the machines a tally at a parlor may name", () => {
  const STEINS: MachineSummary = { id: "m1" as MachineId, gameKind: "pachinko", name: "Pシュタインズ・ゲート・ゼロ まゆしぃば~じょん", modelName: "PA STEINS;GATE0", keywords: [], hitChance: "1/99.9", formulaHitChances: [], releasedOn: "2025-01-01" as IsoDate, formulaCount: 1 }

  test("are the catalog's, each by the name the halls call it and kept as its book name", () => {
    expect(machineChoicesOf([STEINS], "PA STEINS；GATE0")).toEqual([{ value: "PA STEINS；GATE0", label: "Pシュタインズ・ゲート・ゼロ まゆしぃば~じょん", note: "1/99.9" }])
  })

  test("keep the one a tally names already where the catalog lacks it", () => {
    expect(machineChoicesOf([STEINS], "海物語").map((option) => option.value)).toEqual(["海物語", "PA STEINS；GATE0"])
    expect(machineChoicesOf([STEINS], "").map((option) => option.value)).toEqual(["PA STEINS；GATE0"])
  })
})
