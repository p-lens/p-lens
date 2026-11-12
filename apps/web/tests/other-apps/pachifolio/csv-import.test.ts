import { describe, expect, test } from "bun:test"

import { importedIdsOf, importedTallyEntry } from "../../../src/other-apps/core/source-tally"
import { readPachifolio } from "../../../src/other-apps/pachifolio/csv-import"
import { renderEntry } from "../../../src/core/journal/entry"
import { dec } from "../../support/values"

const HEADER = "日付,店舗,機種,投資,回収,種別,タグ,回転数,大当り,メモ"

const FILE = `﻿${HEADER}\n2026/11/08,マレハン東京皇国第8支店,流星の剣,8000,7500,パチ,イベント,163,2,メモが書けるよう！\n2026/11/09,マレハン東京皇国第8支店,流星の剣,30000,30000,パチ,"イベント,朝一",,,\n2026/11/09,名もなき店,星の舞踏,15000,78000,スロ,,1200,3,\n`

describe("a パチフォリオ CSV", () => {
  test("is read a row a tally, with its game, its labels, and the spins and jackpots it counted", () => {
    const read = readPachifolio(FILE)
    expect(read.ok && read.value).toEqual([
      { date: "2026-11-08", parlor: { name: "マレハン東京皇国第8支店", code: "" }, machine: { name: "流星の剣", code: "", maker: "" }, cabinetNumber: "", outlay: dec("8000"), takings: dec("7500"), memo: "メモが書けるよう！", hours: undefined, gameKind: "pachinko", countedSpins: { type: "regular-games", count: 163 }, countedJackpots: 2, sourceLabels: ["イベント"] },
      { date: "2026-11-09", parlor: { name: "マレハン東京皇国第8支店", code: "" }, machine: { name: "流星の剣", code: "", maker: "" }, cabinetNumber: "", outlay: dec("30000"), takings: dec("30000"), memo: "", hours: undefined, gameKind: "pachinko", countedSpins: undefined, countedJackpots: undefined, sourceLabels: ["イベント", "朝一"] },
      { date: "2026-11-09", parlor: { name: "名もなき店", code: "" }, machine: { name: "星の舞踏", code: "", maker: "" }, cabinetNumber: "", outlay: dec("15000"), takings: dec("78000"), memo: "", hours: undefined, gameKind: "pachislot", countedSpins: { type: "regular-games", count: 1200 }, countedJackpots: 3, sourceLabels: [] },
    ] as never)
  })

  test("is refused whole where it lacks a column a tally needs, holds nothing, or has a row that does not read", () => {
    expect(readPachifolio("日付,店舗\n2026/11/08,店\n")).toEqual({ ok: false, error: { type: "not-pachifolio", missing: ["投資", "回収"] } })
    expect(readPachifolio(`${HEADER}\n`)).toEqual({ ok: false, error: { type: "empty" } })
    expect(readPachifolio("日付,投資,回収,種別,回転数,大当り\n2026/11/08,100,200,パチ,,\n2026/11/08,100,200,麻雀,多い,-1\n")).toEqual({
      ok: false,
      error: { type: "rows-unreadable", rows: [{ line: 3, fields: ["gameKind", "countedSpins", "countedJackpots"] }] },
    })
  })
})

describe("a tally taken in from パチフォリオ", () => {
  const [first, , third] = ((read) => (read.ok ? read.value : []))(readPachifolio(FILE))

  test("says its game, keeps each label in a tag of its own, and writes a pachinko play's spins and jackpots as its net regular spins and net jackpots, as this app writes its 回転数", () => {
    expect(renderEntry(importedTallyEntry({ id: "x" as never, from: "pachifolio", source: first as never, machine: undefined, inferred: undefined }))).toBe(
      [
        "2026-11-08 マレハン東京皇国第8支店 | 流星の剣  ; play-id: x, game-kind: pachinko, imported-from: pachifolio, source-parlor: マレハン東京皇国第8支店, source-machine: 流星の剣, net-regular-spins: 163, net-jackpots: 2, source-label: イベント",
        "    費用:遊技                           8000 JPY",
        "    収益:遊技                           -7500 JPY",
        "    資産:現金                           -500 JPY",
        "    ; メモが書けるよう！",
        "",
      ].join("\n"),
    )
  })

  test("writes a pachislot play's as its net games and net ATs, and none where neither game is known", () => {
    expect(renderEntry(importedTallyEntry({ id: "x" as never, from: "pachifolio", source: third as never, machine: undefined, inferred: undefined }))).toContain("game-kind: pachislot, imported-from: pachifolio, source-parlor: 名もなき店, source-machine: 星の舞踏, net-games: 1200, net-ats: 3")
    const unknown = renderEntry(importedTallyEntry({ id: "x" as never, from: "pachifolio", source: { ...(third as never as object), gameKind: undefined } as never, machine: undefined, inferred: undefined }))
    expect(unknown).not.toContain("net-")
    expect(unknown).not.toContain("game-kind")
  })

  test("goes by an id of its own wherever it says more than pRecord's columns do, and two alike are told apart by their order", () => {
    const ids = importedIdsOf("pachifolio", [first as never, { ...(first as never as object), sourceLabels: ["朝一"] } as never, first as never])
    expect(new Set(ids).size).toBe(3)
    expect(String(ids[2])).toBe(`${String(ids[0])}-2`)
  })
})
