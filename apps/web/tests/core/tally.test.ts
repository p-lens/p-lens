import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { renderEntry } from "../../src/core/journal/entry"
import { inferredWorthOf, MEDAL_TERMS_BY_DEFAULT } from "../../src/core/pachislot/told"
import { composeTokenTallyEntry, composeYenTallyEntry } from "../../src/core/tally/compose"
import type { YenTally } from "../../src/core/tally/tally"
import type { PlayId } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import { PRICES, RENTED_PLAY, MALEHAN, dec } from "../support/values"

const rendered = (record: typeof RENTED_PLAY) => mapOk(composeTokenTallyEntry(record, PRICES), renderEntry)

describe("composeTokenTallyEntry", () => {
  test("a tally of a rented play is one entry: rental split at the day's rate and spent without passing through savings, payout, theoretical value", () => {
    expect(rendered(RENTED_PLAY)).toEqual({
      ok: true,
      value: [
        "2026-09-05 マレハン東京皇国第8支店 | 流星 123番台  ; play-id: made-up-0905, parlor-id: malehan-tokyokoukoku, game-kind: pachinko, machine: 流星, cabinet-number: 123",
        "    資産:現金                           -12000 JPY",
        "    費用:貸玉差額                       1290 JPY",
        '    費用:遊技                           3000 "玉(4円・マレハン東京皇国第8支店)" @ 3.57 JPY',
        '    資産:貯玉:マレハン東京皇国第8支店:4円  4800 "玉(4円・マレハン東京皇国第8支店)"',
        '    収益:遊技                           -4800 "玉(4円・マレハン東京皇国第8支店)"',
        "    (統計:期待値)                       5500 JPY",
        "",
      ].join("\n"),
    })
  })

  test("the rental spread is fixed by the rate on the day of the rental", () => {
    const later = { ...RENTED_PLAY, date: "2026-09-26" as IsoDate }
    const entry = composeTokenTallyEntry(later, PRICES)
    expect(entry.ok && entry.value.postings[1]).toEqual({
      account: "費用:貸玉差額",
      amount: { quantity: dec("1500"), commodity: "JPY" },
      kind: "real",
    })
  })

  test("a tally of a play from savings alone has no cash and no rental spread", () => {
    const replay = { ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("4000"), deducted: dec("4000") }, payout: dec("4000"), theoreticalValue: undefined }
    const entry = composeTokenTallyEntry(replay, PRICES)
    expect(entry.ok && entry.value.postings.map((posting) => posting.account)).toEqual([
      "資産:貯玉:マレハン東京皇国第8支店:4円",
      "費用:遊技",
      "資産:貯玉:マレハン東京皇国第8支店:4円",
      "収益:遊技",
    ])
  })

  test("tokens carried in leave savings and are spent with no fee, and the entry says how many", () => {
    const carried = { ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("1000"), deducted: dec("1100") }, carriedIn: dec("1500"), payout: dec("2000"), theoreticalValue: undefined }
    const entry = composeTokenTallyEntry(carried, PRICES)
    expect(entry.ok && entry.value.postings.map((posting) => [posting.account, posting.kind === "balancing" ? undefined : posting.amount.quantity])).toEqual([
      ["資産:貯玉:マレハン東京皇国第8支店:4円", dec("-1100")],
      ["費用:遊技", dec("1000")],
      ["費用:再プレイ手数料", dec("100")],
      ["資産:貯玉:マレハン東京皇国第8支店:4円", dec("-1500")],
      ["費用:遊技", dec("1500")],
      ["資産:貯玉:マレハン東京皇国第8支店:4円", dec("2000")],
      ["収益:遊技", dec("-2000")],
    ])
    expect(entry.ok && entry.value.tags.at(-1)).toEqual(["carried-in", "1500"])
    expect(mapOk(composeTokenTallyEntry(RENTED_PLAY, PRICES), (written) => written.tags.some(([name]) => name === "carried-in"))).toEqual({ ok: true, value: false })
    expect(composeTokenTallyEntry({ ...carried, replay: { paidOut: dec("0"), deducted: dec("0") }, payout: dec("0") }, PRICES).ok).toBe(true)
    expect(composeTokenTallyEntry({ ...carried, carriedIn: dec("-1") }, PRICES)).toEqual({ ok: false, error: { type: "negative-amount", field: "carried-in" } })
  })

  test("a replay's fee is what savings lost beyond what was paid out, written apart from the tally's play", () => {
    const replay = { ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("1000"), deducted: dec("1100") }, payout: dec("0"), theoreticalValue: undefined }
    const entry = composeTokenTallyEntry(replay, PRICES)
    expect(entry.ok && entry.value.postings.map((posting) => [posting.account, posting.kind === "balancing" ? undefined : posting.amount.quantity])).toEqual([
      ["資産:貯玉:マレハン東京皇国第8支店:4円", dec("-1100")],
      ["費用:遊技", dec("1000")],
      ["費用:再プレイ手数料", dec("100")],
    ])
    expect(composeTokenTallyEntry({ ...replay, replay: { paidOut: dec("1000"), deducted: dec("900") } }, PRICES)).toEqual({ ok: false, error: { type: "replay-below-payout" } })
  })

  test("the theoretical value is a virtual posting, never a real one", () => {
    const entry = composeTokenTallyEntry(RENTED_PLAY, PRICES)
    expect(entry.ok && entry.value.postings.filter((posting) => posting.kind === "virtual")).toEqual([
      { account: "統計:期待値", amount: { quantity: dec("5500"), commodity: "JPY" }, kind: "virtual" },
    ])
  })

  test("refuses what cannot be written, saying which case it was", () => {
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, machine: " " }, PRICES)).toEqual({ ok: false, error: { type: "machine-missing" } })
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, machine: "流星, 再臨" }, PRICES)).toEqual({
      ok: false,
      error: { type: "text-unwritable", field: "machine", text: "流星, 再臨" },
    })
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, payout: dec("-1") }, PRICES)).toEqual({
      ok: false,
      error: { type: "negative-amount", field: "payout" },
    })
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, payout: dec("10.5") }, PRICES)).toEqual({
      ok: false,
      error: { type: "fractional-tokens", field: "payout" },
    })
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, rental: { outlay: dec("1000"), tokens: dec("0") } }, PRICES)).toEqual({
      ok: false,
      error: { type: "rental-incomplete" },
    })
    expect(
      composeTokenTallyEntry({ ...RENTED_PLAY, rental: undefined, replay: { paidOut: dec("0"), deducted: dec("0") }, payout: dec("0") }, PRICES),
    ).toEqual({ ok: false, error: { type: "nothing-played" } })
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, date: "2026-08-01" as IsoDate }, PRICES)).toEqual({
      ok: false,
      error: { type: "no-exchange-rate", commodity: "玉(4円・マレハン東京皇国第8支店)", date: "2026-08-01" as IsoDate },
    })
  })

  test("a pool the parlor does not keep, or of another game's token, cannot be played", () => {
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, pool: { kind: "ball", tier: "1円" } }, PRICES)).toEqual({
      ok: false,
      error: { type: "pool-not-kept", parlor: MALEHAN, pool: { kind: "ball", tier: "1円" } },
    })
    expect(composeTokenTallyEntry({ ...RENTED_PLAY, gameKind: "pachislot" }, PRICES)).toEqual({
      ok: false,
      error: { type: "pool-not-kept", parlor: MALEHAN, pool: { kind: "ball", tier: "4円" } },
    })
  })
})

const TALLIED: YenTally = {
  id: "tally-1004" as PlayId,
  date: "2026-10-04" as IsoDate,
  parlor: undefined,
  gameKind: "pachinko",
  machine: "e風の剣豪",
  cabinetNumber: undefined,
  outlay: dec("12000"),
  takings: dec("0"),
  settlement: undefined,
  theoreticalValue: dec("8000"), told: undefined,
}

describe("composeYenTallyEntry", () => {
  test("a loss is an expense paid in cash, with the theoretical value beside it", () => {
    expect(mapOk(composeYenTallyEntry(TALLIED), renderEntry)).toEqual({
      ok: true,
      value: [
        "2026-10-04 | e風の剣豪  ; play-id: tally-1004, game-kind: pachinko, machine: e風の剣豪",
        "    費用:遊技                           12000 JPY",
        "    資産:現金                           -12000 JPY",
        "    (統計:期待値)                       8000 JPY",
        "",
      ].join("\n"),
    })
  })

  test("keeps both sides, what went in and what came back, and puts a gain to the special prizes, never to cash", () => {
    expect(mapOk(composeYenTallyEntry({ ...TALLIED, takings: dec("30000"), theoreticalValue: undefined }), renderEntry)).toEqual({
      ok: true,
      value: [
        "2026-10-04 | e風の剣豪  ; play-id: tally-1004, game-kind: pachinko, machine: e風の剣豪",
        "    費用:遊技                           12000 JPY",
        "    収益:遊技                           -30000 JPY",
        "    純資産:特殊景品                     18000 JPY",
        "    純資産:換算調整勘定",
        "",
      ].join("\n"),
    })
  })

  test("at no parlor counted in tokens, takes the cash spent from cash and sets the tokens against savings the book does not keep, writing no prize", () => {
    const head = "2026-10-04 | e風の剣豪  ; play-id: tally-1004, game-kind: pachinko, machine: e風の剣豪"
    expect(mapOk(composeYenTallyEntry({ ...TALLIED, outlay: dec("1000"), takings: dec("4000"), theoreticalValue: undefined, settlement: { type: "off-book-savings", cash: dec("1000") } }), renderEntry)).toEqual({
      ok: true,
      value: [head, "    費用:遊技                           1000 JPY", "    収益:遊技                           -4000 JPY", "    資産:現金                           -1000 JPY", "    純資産:簿外貯玉                     4000 JPY", ""].join("\n"),
    })
    expect(mapOk(composeYenTallyEntry({ ...TALLIED, outlay: dec("6000"), takings: dec("0"), theoreticalValue: undefined, settlement: { type: "off-book-savings", cash: dec("1000") } }), renderEntry)).toEqual({
      ok: true,
      value: [head, "    費用:遊技                           6000 JPY", "    資産:現金                           -1000 JPY", "    純資産:簿外貯玉                     -5000 JPY", ""].join("\n"),
    })
  })

  test("at no parlor counted in tokens whose tokens were exchanged, takes the rest of its outlay from savings the book does not keep and puts its takings to the prizes as given, the translation adjustment for hledger to balance", () => {
    const head = "2026-10-04 | e風の剣豪  ; play-id: tally-1004, game-kind: pachinko, machine: e風の剣豪"
    expect(mapOk(composeYenTallyEntry({ ...TALLIED, outlay: dec("6000"), takings: dec("23500"), theoreticalValue: undefined, settlement: { type: "off-book-exchanged", cash: dec("5000"), specialPrizes: dec("23000"), oddPrizes: dec("500") } }), renderEntry)).toEqual({
      ok: true,
      value: [
        head,
        "    費用:遊技                           6000 JPY",
        "    収益:遊技                           -23500 JPY",
        "    資産:現金                           -5000 JPY",
        "    純資産:簿外貯玉                     -1000 JPY",
        "    純資産:特殊景品                     23000 JPY",
        "    純資産:端玉景品                     500 JPY",
        "    純資産:換算調整勘定",
        "",
      ].join("\n"),
    })
    const exchanged = { ...TALLIED, outlay: dec("6000"), takings: dec("23500"), settlement: { type: "off-book-exchanged" as const, cash: dec("5000"), specialPrizes: dec("23000"), oddPrizes: dec("500") } }
    expect(composeYenTallyEntry({ ...exchanged, settlement: { ...exchanged.settlement, specialPrizes: dec("23000.5") } })).toEqual({ ok: false, error: { type: "fractional-prizes" } })
    expect(composeYenTallyEntry({ ...exchanged, settlement: { ...exchanged.settlement, oddPrizes: dec("-1") } })).toEqual({ ok: false, error: { type: "negative-amount", field: "odd-prizes" } })
    expect(composeYenTallyEntry({ ...exchanged, parlor: MALEHAN })).toEqual({ ok: false, error: { type: "off-book-at-parlor" } })
  })

  test("at no parlor counted in yen alone, takes all its outlay from cash and puts all its takings to the special prizes", () => {
    expect(mapOk(composeYenTallyEntry({ ...TALLIED, takings: dec("30000.4"), theoreticalValue: undefined, settlement: { type: "cash-and-prizes" } }), renderEntry)).toEqual({
      ok: true,
      value: [
        "2026-10-04 | e風の剣豪  ; play-id: tally-1004, game-kind: pachinko, machine: e風の剣豪",
        "    費用:遊技                           12000 JPY",
        "    収益:遊技                           -30000.4 JPY",
        "    資産:現金                           -12000 JPY",
        "    純資産:特殊景品                     30000 JPY",
        "    純資産:換算調整勘定",
        "",
      ].join("\n"),
    })
  })

  test("is refused settled against savings the book does not keep at a parlor, or with more cash than its outlay", () => {
    const settled = { ...TALLIED, outlay: dec("6000"), settlement: { type: "off-book-savings" as const, cash: dec("7000") } }
    expect(composeYenTallyEntry(settled)).toEqual({ ok: false, error: { type: "cash-beyond-outlay" } })
    expect(composeYenTallyEntry({ ...settled, parlor: MALEHAN, settlement: { type: "off-book-savings", cash: dec("1000") } })).toEqual({ ok: false, error: { type: "off-book-at-parlor" } })
  })

  test("is refused with a side below nothing", () => {
    expect(composeYenTallyEntry({ ...TALLIED, outlay: dec("-1") })).toEqual({ ok: false, error: { type: "negative-amount", field: "outlay" } })
    expect(composeYenTallyEntry({ ...TALLIED, takings: dec("-1") })).toEqual({ ok: false, error: { type: "negative-amount", field: "takings" } })
  })

  test("leaves the part of a yen a gain leaves over to the translation adjustment for hledger to balance, the prizes being whole yen", () => {
    const entry = composeYenTallyEntry({ ...TALLIED, outlay: dec("0"), takings: dec("100.4"), theoreticalValue: undefined })
    expect(entry.ok && entry.value.postings.map((posting) => [posting.account, posting.kind === "balancing" ? undefined : posting.amount.quantity])).toEqual([
      ["収益:遊技", dec("-100.4")],
      ["純資産:特殊景品", dec("100")],
      ["純資産:換算調整勘定", undefined],
    ])
  })

  test("a gain with nothing put in is revenue taken as prizes, and names the parlor when there is one", () => {
    const entry = composeYenTallyEntry({ ...TALLIED, parlor: MALEHAN, outlay: dec("0"), takings: dec("20000"), theoreticalValue: undefined })
    expect(entry.ok && [entry.value.description, entry.value.tags[1], entry.value.postings]).toEqual([
      "マレハン東京皇国第8支店 | e風の剣豪",
      ["parlor-id", "malehan-tokyokoukoku"],
      [
        { account: "収益:遊技", amount: { quantity: dec("-20000"), commodity: "JPY" }, kind: "real" },
        { account: "純資産:特殊景品", amount: { quantity: dec("20000"), commodity: "JPY" }, kind: "real" },
        { account: "純資産:換算調整勘定", kind: "balancing" },
      ],
    ])
  })

  test("a tally that came out even moves no cash, and one of nothing writes no real posting", () => {
    const even = composeYenTallyEntry({ ...TALLIED, takings: dec("12000") })
    expect(even.ok && even.value.postings.map((posting) => posting.account)).toEqual(["費用:遊技", "収益:遊技", "統計:期待値"])
    const nothing = composeYenTallyEntry({ ...TALLIED, outlay: dec("0") })
    expect(nothing.ok && nothing.value.postings.map((posting) => posting.account)).toEqual(["統計:期待値"])
  })

  test("may name no machine, and then writes none", () => {
    const entry = composeYenTallyEntry({ ...TALLIED, machine: " " })
    expect(entry.ok && entry.value.tags.map(([tag]) => tag)).not.toContain("machine")
    expect(entry.ok && entry.value.description).not.toContain("  ")
  })

  test("refuses words that cannot be written", () => {
    expect(composeYenTallyEntry({ ...TALLIED, machine: "流星;無双" })).toEqual({ ok: false, error: { type: "text-unwritable", field: "machine", text: "流星;無双" } })
    expect(composeYenTallyEntry({ ...TALLIED, cabinetNumber: "1;2" })).toEqual({ ok: false, error: { type: "text-unwritable", field: "cabinet-number", text: "1;2" } })
  })

  test("a pachislot tally told by its hours keeps what its setting level was read to be worth as inferred, with the formula and the terms it stood on", () => {
    const told = { ...TALLIED, gameKind: "pachislot" as const, machine: "マイジャグラーVI", theoreticalValue: undefined, told: { hours: dec("3.5"), jackpots: undefined, inferred: inferredWorthOf("formula-1", -1234.5, MEDAL_TERMS_BY_DEFAULT) } }
    expect(mapOk(composeYenTallyEntry(told), renderEntry)).toEqual({
      ok: true,
      value: [
        "2026-10-04 | マイジャグラーVI  ; play-id: tally-1004, game-kind: pachislot, machine: マイジャグラーVI, hours: 3.5, inferred-formula: formula-1, token-rental: 21.73913, token-exchange: 5.2",
        "    費用:遊技                           12000 JPY",
        "    資産:現金                           -12000 JPY",
        "    (統計:時間)                         12600 秒",
        "    (統計:期待値:推定)                  -1234.5 JPY",
        "",
      ].join("\n"),
    })
  })

  test("a pachislot tally's theoretical value typed in is its own, and nothing inferred is written beside it", () => {
    const told = { ...TALLIED, gameKind: "pachislot" as const, machine: "マイジャグラーVI", told: { hours: dec("3.5"), jackpots: undefined, inferred: inferredWorthOf("formula-1", -1234.5, MEDAL_TERMS_BY_DEFAULT) } }
    const entry = composeYenTallyEntry(told)
    expect(entry.ok && entry.value.postings.map((posting) => posting.account)).toEqual(["費用:遊技", "資産:現金", "統計:期待値", "統計:時間"])
  })

  test("an AT machine's tally read by its history keeps what it was inferred to be worth, its hours left unsaid", () => {
    const told = { ...TALLIED, gameKind: "pachislot" as const, machine: "スマスロ東京リベンジャーズ", theoreticalValue: undefined, told: { hours: undefined, jackpots: undefined, inferred: inferredWorthOf("formula-1", -2100, MEDAL_TERMS_BY_DEFAULT) } }
    const entry = composeYenTallyEntry(told)
    expect(entry.ok && [entry.value.tags.map(([name]) => name), entry.value.postings.map((posting) => posting.account)]).toEqual([
      ["play-id", "game-kind", "machine", "inferred-formula", "token-rental", "token-exchange"],
      ["費用:遊技", "資産:現金", "統計:期待値:推定"],
    ])
  })
})
