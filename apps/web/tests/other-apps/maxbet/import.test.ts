import { describe, expect, test } from "bun:test"

import { readMaxbetCsv } from "../../../src/other-apps/maxbet/csv-import"
import { isMaxbetJson, readMaxbetJson } from "../../../src/other-apps/maxbet/json-import"

/** A MAXBET file read as its use case reads it: its backup, or else its CSV. */
const readMaxbet = (text: string): ReturnType<typeof readMaxbetJson> => (isMaxbetJson(text) ? readMaxbetJson(text) : readMaxbetCsv(text))
import { importedIdsOf, importedTallyEntry } from "../../../src/other-apps/core/source-tally"
import { renderEntry } from "../../../src/core/journal/entry"
import { dec } from "../../support/values"

const record = (date: string, expense: number, revenue: number, tags: readonly string[], memo: string): object => ({
  id: "D3ABCEE5-B215-4428-99DF-2E6C63E55E27",
  modification_date: "2026-11-10T10:06:47Z",
  tags: tags.map((title, order) => ({ title, order, id: `tag-${order}` })),
  memo,
  revenue,
  expense,
  date,
})

const BACKUP = JSON.stringify([
  record("2026-11-03T15:00:00Z", 13000, 212500, ["パチンコ"], ""),
  record("2026-11-05T15:00:00Z", 500, 6000, ["パチスロ", "イベント"], ""),
  record("2026-11-08T15:00:00Z", 7143, 0, [], "メモあり"),
  record("2026-10-29T15:00:00Z", 5000, 100, ["競艇"], "タグは競艇"),
  record("2026-10-28T15:00:00Z", 3000, 66000, ["パチンコ", "パチスロ"], ""),
  record("2026-11-09T15:00:00Z", 3000, 26000, ["パチンコ", "角台"], ""),
])

const CSV =
  "日付,投資,回収,収支,タグ,メモ\n2026/11/04,13000,212500,199500,パチンコ,\n2026/11/06,500,6000,5500,\"パチスロ,イベント\",\n2026/11/09,7143,0,-7143,,メモあり\n2026/10/30,5000,100,-4900,競艇,タグは競艇\n2026/10/29,3000,66000,63000,\"パチンコ,パチスロ\",\n2026/11/10,3000,26000,23000,\"パチンコ,角台\",\n"

const blank = { parlor: { name: "", code: "" }, machine: { name: "", code: "", maker: "" }, cabinetNumber: "", hours: undefined, countedSpins: undefined, countedJackpots: undefined }

describe("a MAXBET file", () => {
  test("is read from its backup a record a tally, on the day it falls on in Japan, its game from its tags and the rest its labels, those of something other than play left out and counted", () => {
    const read = readMaxbet(BACKUP)
    expect(read.ok && read.value.otherThanPlay).toBe(1)
    expect(read.ok && read.value.tallies).toEqual([
      { ...blank, date: "2026-11-04", outlay: dec("13000"), takings: dec("212500"), memo: "", gameKind: "pachinko", sourceLabels: [] },
      { ...blank, date: "2026-11-06", outlay: dec("500"), takings: dec("6000"), memo: "", gameKind: "pachislot", sourceLabels: ["イベント"] },
      { ...blank, date: "2026-11-09", outlay: dec("7143"), takings: dec("0"), memo: "メモあり", gameKind: undefined, sourceLabels: [] },
      { ...blank, date: "2026-10-29", outlay: dec("3000"), takings: dec("66000"), memo: "", gameKind: undefined, sourceLabels: [] },
      { ...blank, date: "2026-11-10", outlay: dec("3000"), takings: dec("26000"), memo: "", gameKind: "pachinko", sourceLabels: ["角台"] },
    ] as never)
  })

  test("is read from its CSV as from its backup, so that either taken in after the other writes nothing twice", () => {
    const [backup, csv] = [readMaxbet(BACKUP), readMaxbet(`﻿${CSV}`)]
    expect(csv.ok && csv.value).toEqual(backup.ok && backup.value)
    expect(importedIdsOf("maxbet", csv.ok ? csv.value.tallies : [])).toEqual(importedIdsOf("maxbet", backup.ok ? backup.value.tallies : []))
  })

  test("is read from Android's backup as from iOS's, whose tags go by numbers and whose ids are in small letters", () => {
    const android = JSON.stringify([
      { date: "2026-11-09T15:00:00Z", expense: 5000, id: "6bc2bb9d-4020-44a6-8f53-9df0b24fb1ad", memo: "Android版", modification_date: "2026-11-10T10:45:55Z", revenue: 120000, tags: [{ id: "1", order: 0, title: "パチンコ" }] },
      { date: "2026-11-08T15:00:00Z", expense: 6000, id: "ab7c0149-9890-42c1-b4fa-6ccd955c4ff2", memo: "", modification_date: "2026-11-10T10:46:15Z", revenue: 6000, tags: [{ id: "2", order: 0, title: "パチスロ" }] },
    ])
    const read = readMaxbet(android)
    expect(read.ok && read.value.tallies.map((tally) => [tally.date, tally.gameKind, tally.memo])).toEqual([
      ["2026-11-10", "pachinko", "Android版"],
      ["2026-11-09", "pachislot", ""],
    ])
  })

  test("is refused where every tally it holds is of something other than play", () => {
    expect(readMaxbet(JSON.stringify([record("2026-11-01T15:00:00Z", 2000, 5000, ["株"], ""), record("2026-11-02T15:00:00Z", 2000, 5000, ["FX", "競馬"], "")]))).toEqual({ ok: false, error: { type: "no-plays", count: 2 } })
  })

  test("is refused whole where it is neither file, holds nothing, or has a record or row that does not read", () => {
    expect(readMaxbet("{}")).toEqual({ ok: false, error: { type: "not-maxbet" } })
    expect(readMaxbet("[1,")).toEqual({ ok: false, error: { type: "not-maxbet" } })
    expect(readMaxbet("日付,店舗\n2026/11/08,店\n")).toEqual({ ok: false, error: { type: "not-maxbet" } })
    expect(readMaxbet("[]")).toEqual({ ok: false, error: { type: "empty" } })
    expect(readMaxbet("日付,投資,回収\n")).toEqual({ ok: false, error: { type: "empty" } })
    expect(readMaxbet(JSON.stringify([record("2026-11-03T15:00:00Z", 100, 0, [], ""), record("いつか", 100, 0, [], ""), record("2026-11-03T15:00:00Z", -1, 0.5, [], "")]))).toEqual({
      ok: false,
      error: { type: "records-unreadable", records: [2, 3] },
    })
    expect(readMaxbet("日付,投資,回収\n2026/11/08,100,200\n2026/11/08,多い,\n")).toEqual({ ok: false, error: { type: "rows-unreadable", rows: [{ line: 3, fields: ["outlay", "takings"] }] } })
  })
})

describe("a tally taken in from MAXBET", () => {
  test("is written in yen with its game where its tags said one, its other tags as labels and its memo as a note", () => {
    const read = readMaxbet(BACKUP)
    const [, second, third] = read.ok ? read.value.tallies : []
    expect(renderEntry(importedTallyEntry({ id: "x" as never, from: "maxbet", source: second as never, machine: undefined, inferred: undefined }))).toContain("play-id: x, game-kind: pachislot, imported-from: maxbet, source-label: イベント")
    const untagged = renderEntry(importedTallyEntry({ id: "y" as never, from: "maxbet", source: third as never, machine: undefined, inferred: undefined }))
    expect(untagged).not.toContain("game-kind")
    expect(untagged).toContain("; メモあり")
  })
})
