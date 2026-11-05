import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import {
  assembledPlay,
  copiedPlayOf,
  copyTime,
  headJson,
  isAbove,
  linesLost,
  logPieces,
  PIECE_BYTES,
  pieceHash,
  playsDaysOf,
  playsExpiration,
  readHead,
  readPiece,
  type CopyHead,
  type CopyPiece,
} from "../../src/crossing/core/plays"

const DEVICE = "0".repeat(32)
const OTHER = "f".repeat(32)

const draft = (log: string): PlayDraft => ({
  id: "play-1" as PlayId,
  date: "2026-11-04" as IsoDate,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  pachinko: undefined,
  machine: "made-up",
  cabinetNumber: undefined,
  startedAt: "2026-11-04T01:00:00.000Z",
  log,
  history: [{ at: "2026-11-04T01:10:00.000Z", removed: [], added: ["x"] }],
})

const longLog = (count: number): string => Array.from({ length: count }, (_, index) => JSON.stringify({ spins: index, outlay: index * 500, at: "2026-11-04T01:00:00.000Z" })).join("\n")

const headOf = (play: PlayDraft, pieces: readonly (readonly string[])[], tail: readonly string[]): CopyHead => ({
  playId: play.id,
  gen: 0,
  device: DEVICE,
  stamp: 1,
  body: { type: "play", play: copiedPlayOf(play), pieces: pieces.map(pieceHash), tail },
})

describe("a play's copy", () => {
  test("leaves out the log and its history", () => {
    const copied = copiedPlayOf(draft("a"))
    expect("log" in copied).toBe(false)
    expect("history" in copied).toBe(false)
  })

  test("splits a log into pieces each within a seal, the earlier ones the same however much the log grows", () => {
    const log = longLog(3_000)
    const pieces = logPieces(log)
    expect(pieces.length).toBeGreaterThan(2)
    expect(pieces.every((piece) => new TextEncoder().encode(JSON.stringify(piece)).length <= PIECE_BYTES)).toBe(true)
    expect(pieces.flat().join("\n")).toBe(log)
    const grown = logPieces(`${log}\n{"spins":99999}`)
    expect(grown.slice(0, -1)).toEqual(pieces.slice(0, -1))
  })

  test("comes together once every piece its head names is held, and not before", () => {
    const play = draft(longLog(2_000))
    const pieces = logPieces(play.log)
    const head = headOf(play, pieces.slice(0, -1), pieces.at(-1) ?? [])
    const held = new Map(pieces.slice(0, -1).map((lines, index): [number, CopyPiece] => [index, { playId: play.id, gen: 0, device: DEVICE, index, lines }]))
    expect(assembledPlay(head, held)?.log).toBe(play.log)
    expect(assembledPlay(head, new Map([...held].slice(1)))).toBeUndefined()
    const wrong = new Map(held).set(0, { playId: play.id, gen: 0, device: DEVICE, index: 0, lines: ["{}"] })
    expect(assembledPlay(head, wrong)).toBeUndefined()
  })

  test("is not taken as another play's", () => {
    const play = draft("a")
    expect(assembledPlay({ ...headOf(play, [], ["a"]), playId: "play-2" as PlayId }, new Map())).toBeUndefined()
  })

  test("reads back as it was written, and nothing else reads", () => {
    const head = headOf(draft("a"), [], ["a"])
    expect(readHead(JSON.parse(JSON.stringify(headJson(head))))).toEqual(head)
    const ended: CopyHead = { playId: "play-1" as PlayId, gen: 2, device: DEVICE, stamp: 3, body: { type: "ended", ending: "moved" } }
    expect(readHead(headJson(ended))).toEqual(ended)
    expect(readHead({ ...(headJson(head) as object), note: "x" })).toBeUndefined()
    expect(readHead({ ...(headJson(ended) as object), ended: "lost" })).toBeUndefined()
    expect(readHead({ ...(headJson(head) as object), device: "device" })).toBeUndefined()
    expect(readPiece({ playId: "p", gen: 0, device: DEVICE, index: 1, lines: ["a"] })).toEqual({ playId: "p" as PlayId, gen: 0, device: DEVICE, index: 1, lines: ["a"] })
    expect(readPiece({ playId: "p", gen: 0, device: DEVICE, index: 1, lines: ["a\nb"] })).toBeUndefined()
  })
})

describe("holding a play", () => {
  test("goes to the higher generation, and within one to the same device on every device", () => {
    const at = (gen: number, device: string) => ({ playId: "play-1" as PlayId, gen, device })
    expect(isAbove(at(1, DEVICE), at(0, OTHER))).toBe(true)
    expect(isAbove(at(10, DEVICE), at(9, OTHER))).toBe(true)
    expect(isAbove(at(1, DEVICE), at(1, OTHER))).toBe(!isAbove(at(1, OTHER), at(1, DEVICE)))
  })

  test("a yielding device counts the lines the holder lacks, each as often as it is missing", () => {
    expect(linesLost("a\nb\nc", "a\nb\nc\nd")).toBe(0)
    expect(linesLost("a\nb\nc\nd", "a\nb")).toBe(2)
    expect(linesLost("a\na", "a")).toBe(1)
  })
})

describe("time on a plays line", () => {
  test("a copy is said to be made at ten seconds, later than the last at its address", () => {
    expect(copyTime(1_000_007, undefined)).toBe(1_000_000)
    expect(copyTime(1_000_007, 1_000_000)).toBe(1_000_001)
    expect(copyTime(1_000_017, 1_000_001)).toBe(1_000_010)
  })

  test("copies expire at the start of a UTC day three days on, and three days' lines are read", () => {
    expect(playsExpiration("2026-11-04" as IsoDate)).toBe(Date.UTC(2026, 10, 7) / 1000)
    expect(playsDaysOf("2026-11-01" as IsoDate)).toEqual(["2026-11-01", "2026-10-31", "2026-10-30"] as IsoDate[])
  })
})
