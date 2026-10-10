import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { renderEntry } from "../../src/core/journal/entry"
import { composePlayEntry, composeTalliedEntry } from "../../src/core/play/compose"
import type { PlayId, TalliedPlay } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import { PRICES, RENTED_PLAY, UMEDA, dec } from "../support/values"

const rendered = (record: typeof RENTED_PLAY) => mapOk(composePlayEntry(record, PRICES), renderEntry)

describe("composePlayEntry", () => {
  test("a rented play is one entry: rental split at the day's rate, shooting, payout, theoretical value", () => {
    expect(rendered(RENTED_PLAY)).toEqual({
      ok: true,
      value: [
        "2026-09-05 ホシゾラ梅田店 流星 123番台  ; play-id: made-up-0905, parlor-id: hoshizora-umeda, game-kind: pachinko, machine: 流星, cabinet-number: 123",
        "    資産:現金                           -12000 JPY",
        "    費用:貸玉差額                       1290 JPY",
        '    資産:貯玉:ホシゾラ梅田店:4円        3000 "玉(4円・ホシゾラ梅田店)" @ 3.57 JPY',
        '    資産:貯玉:ホシゾラ梅田店:4円        -3000 "玉(4円・ホシゾラ梅田店)"',
        '    費用:遊技                           3000 "玉(4円・ホシゾラ梅田店)"',
        '    資産:貯玉:ホシゾラ梅田店:4円        4800 "玉(4円・ホシゾラ梅田店)"',
        '    収益:遊技                           -4800 "玉(4円・ホシゾラ梅田店)"',
        "    (統計:期待値)                       5500 JPY",
        "",
      ].join("\n"),
    })
  })

  test("the rental spread is fixed by the rate on the day of the rental", () => {
    const later = { ...RENTED_PLAY, date: "2026-09-26" as IsoDate }
    const entry = composePlayEntry(later, PRICES)
    expect(entry.ok && entry.value.postings[1]).toEqual({
      account: "費用:貸玉差額",
      amount: { quantity: dec("1500"), commodity: "JPY" },
      kind: "real",
    })
  })

  test("a play from savings alone has no cash and no rental spread", () => {
    const replay = { ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("4000"), deducted: dec("4000") }, payout: dec("4000"), theoreticalValue: undefined }
    const entry = composePlayEntry(replay, PRICES)
    expect(entry.ok && entry.value.postings.map((posting) => posting.account)).toEqual([
      "資産:貯玉:ホシゾラ梅田店:4円",
      "費用:遊技",
      "資産:貯玉:ホシゾラ梅田店:4円",
      "収益:遊技",
    ])
  })

  test("a replay's fee is what savings lost beyond what was paid out, written apart from the play", () => {
    const replay = { ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("1000"), deducted: dec("1100") }, payout: dec("0"), theoreticalValue: undefined }
    const entry = composePlayEntry(replay, PRICES)
    expect(entry.ok && entry.value.postings.map((posting) => [posting.account, posting.amount.quantity])).toEqual([
      ["資産:貯玉:ホシゾラ梅田店:4円", dec("-1100")],
      ["費用:遊技", dec("1000")],
      ["費用:再プレイ手数料", dec("100")],
    ])
    expect(composePlayEntry({ ...replay, replay: { paidOut: dec("1000"), deducted: dec("900") } }, PRICES)).toEqual({ ok: false, error: { type: "replay-below-payout" } })
  })

  test("the theoretical value is a virtual posting, never a real one", () => {
    const entry = composePlayEntry(RENTED_PLAY, PRICES)
    expect(entry.ok && entry.value.postings.filter((posting) => posting.kind === "virtual")).toEqual([
      { account: "統計:期待値", amount: { quantity: dec("5500"), commodity: "JPY" }, kind: "virtual" },
    ])
  })

  test("refuses what cannot be written, saying which case it was", () => {
    expect(composePlayEntry({ ...RENTED_PLAY, machine: " " }, PRICES)).toEqual({ ok: false, error: { type: "machine-missing" } })
    expect(composePlayEntry({ ...RENTED_PLAY, machine: "流星, 再臨" }, PRICES)).toEqual({
      ok: false,
      error: { type: "text-unwritable", field: "machine", text: "流星, 再臨" },
    })
    expect(composePlayEntry({ ...RENTED_PLAY, payout: dec("-1") }, PRICES)).toEqual({
      ok: false,
      error: { type: "negative-amount", field: "payout" },
    })
    expect(composePlayEntry({ ...RENTED_PLAY, payout: dec("10.5") }, PRICES)).toEqual({
      ok: false,
      error: { type: "fractional-tokens", field: "payout" },
    })
    expect(composePlayEntry({ ...RENTED_PLAY, rental: { outlay: dec("1000"), tokens: dec("0") } }, PRICES)).toEqual({
      ok: false,
      error: { type: "rental-incomplete" },
    })
    expect(
      composePlayEntry({ ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("0"), deducted: dec("0") }, payout: dec("0") }, PRICES),
    ).toEqual({ ok: false, error: { type: "nothing-played" } })
    expect(composePlayEntry({ ...RENTED_PLAY, date: "2026-08-01" as IsoDate }, PRICES)).toEqual({
      ok: false,
      error: { type: "no-exchange-rate", commodity: "玉(4円・ホシゾラ梅田店)", date: "2026-08-01" as IsoDate },
    })
  })

  test("a pool the parlor does not keep, or of another game's token, cannot be played", () => {
    expect(composePlayEntry({ ...RENTED_PLAY, pool: { kind: "ball", tier: "1円" } }, PRICES)).toEqual({
      ok: false,
      error: { type: "pool-not-kept", parlor: UMEDA, pool: { kind: "ball", tier: "1円" } },
    })
    expect(composePlayEntry({ ...RENTED_PLAY, gameKind: "slot" }, PRICES)).toEqual({
      ok: false,
      error: { type: "pool-not-kept", parlor: UMEDA, pool: { kind: "ball", tier: "4円" } },
    })
  })
})

const TALLIED: TalliedPlay = {
  id: "tally-1004" as PlayId,
  date: "2026-10-04" as IsoDate,
  parlor: undefined,
  gameKind: "pachinko",
  machine: "e風の剣豪",
  cabinetNumber: undefined,
  result: dec("-12000"),
  theoreticalValue: dec("8000"),
}

describe("composeTalliedEntry", () => {
  test("a loss is an expense paid in cash, with the theoretical value beside it", () => {
    expect(mapOk(composeTalliedEntry(TALLIED), renderEntry)).toEqual({
      ok: true,
      value: [
        "2026-10-04 e風の剣豪  ; play-id: tally-1004, game-kind: pachinko, machine: e風の剣豪",
        "    費用:遊技                           12000 JPY",
        "    資産:現金                           -12000 JPY",
        "    (統計:期待値)                       8000 JPY",
        "",
      ].join("\n"),
    })
  })

  test("a gain is revenue received in cash, and names the parlor when there is one", () => {
    const entry = composeTalliedEntry({ ...TALLIED, parlor: UMEDA, result: dec("20000"), theoreticalValue: undefined })
    expect(entry.ok && [entry.value.description, entry.value.tags[1], entry.value.postings]).toEqual([
      "ホシゾラ梅田店 e風の剣豪",
      ["parlor-id", "hoshizora-umeda"],
      [
        { account: "資産:現金", amount: { quantity: dec("20000"), commodity: "JPY" }, kind: "real" },
        { account: "収益:遊技", amount: { quantity: dec("-20000"), commodity: "JPY" }, kind: "real" },
      ],
    ])
  })

  test("an even result moves no money", () => {
    const entry = composeTalliedEntry({ ...TALLIED, result: dec("0") })
    expect(entry.ok && entry.value.postings.map((posting) => posting.account)).toEqual(["統計:期待値"])
  })

  test("may name no machine, and then writes none", () => {
    const entry = composeTalliedEntry({ ...TALLIED, machine: " " })
    expect(entry.ok && entry.value.tags.map(([tag]) => tag)).not.toContain("machine")
    expect(entry.ok && entry.value.description).not.toContain("  ")
  })

  test("refuses words that cannot be written", () => {
    expect(composeTalliedEntry({ ...TALLIED, machine: "流星;無双" })).toEqual({ ok: false, error: { type: "text-unwritable", field: "machine", text: "流星;無双" } })
    expect(composeTalliedEntry({ ...TALLIED, cabinetNumber: "1;2" })).toEqual({ ok: false, error: { type: "text-unwritable", field: "cabinet-number", text: "1;2" } })
  })
})
