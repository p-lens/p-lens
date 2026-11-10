import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { appendCheckpoint, playLogPath, type Checkpoint } from "../../../src/core/play-log/checkpoint"
import { withHead, type PlayLogHead } from "../../../src/core/play-log/head"
import type { PlayGameKind, PlayId } from "../../../src/core/play/play"
import { playTableOf } from "../../../src/other-apps/general/play-csv-export"

const headOf = (gameKind: PlayGameKind, id: string, date: string, machine: string): PlayLogHead => ({
  playId: id as PlayId,
  gameKind,
  date: date as IsoDate,
  startedAt: `${date}T10:00:00+09:00`,
  parlor: { name: "マレハン東京皇国第8支店", identity: { type: "listed", id: "parlor-1" } as never },
  terms: undefined,
  machine,
  cabinetNumber: "123",
  formulaId: undefined,
  prior: undefined,
})

const logOf = (head: PlayLogHead, readings: readonly Checkpoint[]): string => withHead(readings.reduce(appendCheckpoint, ""), head)

const FILES = {
  "main.journal": "",
  [playLogPath("pachinko", "late" as PlayId)]: logOf(headOf("pachinko", "late", "2026-11-09", "流星の剣"), [{ spins: 0, outlay: 0 }]),
  [playLogPath("pachinko", "early" as PlayId)]: logOf(headOf("pachinko", "early", "2026-11-08", "流星の剣"), [
    { spins: 0, outlay: 0, at: "2026-11-08T10:00:00+09:00", counter: { spins: 15, jackpots: 0 } },
    { spins: 104, outlay: 5000, event: { kind: "jackpot", bonus: { name: "10R", payout: 1400, spent: 0 } }, held: 1400 },
    { spins: 89, outlay: 4000, phase: "special" },
  ]),
  [playLogPath("pachislot", "slot-1" as PlayId)]: logOf(headOf("pachislot", "slot-1", "2026-11-08", "星の舞踏"), [
    { spins: 0, outlay: 0, tally: { grape: 0 } },
    { spins: 800, outlay: 15000, counter: { spins: 120, total: 2300, bonuses: { big: 3, reg: 2 } }, tally: { grape: 130 }, event: { kind: "at-ended", completed: true, sets: 2, medals: 950 } },
  ]),
  [playLogPath("pachislot", "broken" as PlayId)]: "{not json\n",
}

describe("a book's plays as tables of their readings", () => {
  test("give pachinko's readings a row each, oldest play first and by their spins, each beginning with the play as its head says it", () => {
    const [header, ...rows] = playTableOf(FILES, "pachinko")
    expect(header?.slice(0, 10)).toEqual(["日付", "開始", "店舗", "機種", "台番号", "稼働ID", "時刻", "回転数", "投資", "持ち玉"])
    expect(rows.map((row) => [row[5], row[7], row[8]])).toEqual([
      ["early", "0", "0"],
      ["early", "89", "4000"],
      ["early", "104", "5000"],
      ["late", "0", "0"],
    ])
    expect(rows[0]?.slice(0, 7)).toEqual(["2026-11-08", "2026-11-08T10:00:00+09:00", "マレハン東京皇国第8支店", "流星の剣", "123", "early", "2026-11-08T10:00:00+09:00"])
    expect(rows[1]?.[13]).toBe("確変")
    expect(rows[2]?.slice(17, 20)).toEqual(["大当り", "10R", "1400"])
  })

  test("give pachislot's apart, counts by name in one cell, and leave out a log that does not read", () => {
    const [header, ...rows] = playTableOf(FILES, "pachislot")
    expect(header?.[7]).toBe("ゲーム数")
    expect(rows).toHaveLength(2)
    expect(rows[1]?.slice(7, 9)).toEqual(["800", "15000"])
    expect(rows[1]?.[14]).toBe("big=3 reg=2")
    expect(rows[1]?.slice(18, 24)).toEqual(["AT終了", "はい", "2", "950", "", "grape=130"])
  })

  test("is its column names alone where the book has no play of the game", () => {
    expect(playTableOf({ "main.journal": "" }, "pachislot")).toHaveLength(1)
  })
})
