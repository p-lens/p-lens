import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PachinkoDraft } from "../../src/core/live-play/draft"
import { readPlayDraft } from "../../src/core/live-play/draft-reading"
import type { PlayTerms } from "../../src/core/parlor/terms"
import type { PlayId } from "../../src/core/play/play"
import { MALEHAN } from "../support/values"

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 250 }, replay: { paidOut: 250, deducted: 250 } }

const DRAFT: PachinkoDraft = {
  id: "p-1" as PlayId,
  date: "2026-10-09" as IsoDate,
  venue: { type: "parlor", parlor: MALEHAN, terms: TERMS },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: { id: "f-1", machineId: "m-1", kind: "manual", figures: { roundChanceOneIn: 30, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: 200 } } as PachinkoDraft["pachinko"],
  bonuses: [{ name: "10R", payout: 1400, spent: 100 }],
  cabinetNumber: "123",
  startedAt: "2026-10-09T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n{"spins":30,"outlay":500}\n',
  history: [{ at: "2026-10-09T01:10:00.000Z", removed: [], added: ['{"spins":30,"outlay":500}'] }],
  recorded: { at: "2026-10-09T03:00:10.000Z", finish: { at: "2026-10-09T03:00:00.000Z", counter: 300 } },
}

/** The draft as a store gives it back, with one part replaced by what a store might hold instead. */
const keptWith = (part: string, value: unknown): unknown => ({ ...structuredClone(DRAFT), [part]: value })

describe("a draft read back from the device", () => {
  test("lets go of what the relay the app once had kept with it", () => {
    const kept = { ...structuredClone(DRAFT), sent: [{ lineId: "line-1", at: "x", log: "" }], received: { sender: "仲間", log: "", finished: undefined }, handovers: 2 }
    expect(readPlayDraft(kept)).toEqual(DRAFT)
  })

  test("reads whole where every part reads, and where the parts a play may leave out are left out", () => {
    expect(readPlayDraft(structuredClone(DRAFT))).toEqual(DRAFT)
    const bare: PachinkoDraft = { ...DRAFT, venue: { type: "none", terms: undefined }, pachinko: undefined, cabinetNumber: undefined }
    const { bonuses: _bonuses, history: _history, recorded: _recorded, ...plain } = bare
    expect(readPlayDraft(structuredClone(plain))).toEqual(plain)
  })

  test("keeps its own game's parts alone: a pachislot play kept with a pachinko formula is read without it", () => {
    const kept = { ...structuredClone(DRAFT), gameKind: "pachislot" }
    const read = readPlayDraft(kept)
    expect(read?.gameKind).toBe("pachislot")
    expect(read !== undefined && ("pachinko" in read || "bonuses" in read)).toBe(false)
  })

  test("keeps how a pachinko play's counter counts and its usual over-entry, reads no other shape of them, and lets them go from a pachislot play", () => {
    expect(readPlayDraft(keptWith("jackpotCounting", "per-bonus"))).toMatchObject({ jackpotCounting: "per-bonus" })
    expect(readPlayDraft(keptWith("overEntry", -2))).toMatchObject({ overEntry: -2 })
    expect(readPlayDraft(keptWith("jackpotCounting", "per-jackpot"))).toBeUndefined()
    expect(readPlayDraft(keptWith("overEntry", 0))).toBeUndefined()
    expect(readPlayDraft(keptWith("overEntry", 1.5))).toBeUndefined()
    const pachislot = readPlayDraft({ ...(keptWith("overEntry", 2) as object), gameKind: "pachislot", pachinko: undefined })
    expect(pachislot !== undefined && "overEntry" in pachislot).toBe(false)
  })

  test("reads a play kept as `slot`, before pachislot's name was settled, as pachislot", () => {
    expect(readPlayDraft({ ...structuredClone(DRAFT), gameKind: "slot" })?.gameKind).toBe("pachislot")
  })

  test("does not read where its finish is kept under another name, or is not one", () => {
    expect(readPlayDraft(keptWith("recorded", { at: "2026-10-09T03:00:10.000Z", end: { at: "2026-10-09T03:00:00.000Z" } }))).toBeUndefined()
    expect(readPlayDraft(keptWith("recorded", { at: "2026-10-09T03:00:10.000Z", finish: { counter: "300" } }))).toBeUndefined()
  })

  test("does not read where its log does not, or a line of it is not one the app writes", () => {
    expect(readPlayDraft(keptWith("log", undefined))).toBeUndefined()
    expect(readPlayDraft(keptWith("log", '{"spins":0,"outlay":0}\n{"spins":30,"event":{"kind":"ended"}}\n'))).toBeUndefined()
    expect(readPlayDraft(keptWith("log", '{"spins":0,"outl'))).toBeUndefined()
  })

  test("does not read where a part it is shown or written by is missing or of another shape", () => {
    expect(readPlayDraft(keptWith("startedAt", 1700000000))).toBeUndefined()
    expect(readPlayDraft(keptWith("venue", undefined))).toBeUndefined()
    expect(readPlayDraft(keptWith("venue", { type: "parlor", parlor: MALEHAN, terms: { rental: "500" } }))).toBeUndefined()
    expect(readPlayDraft(keptWith("history", "x"))).toBeUndefined()
    expect(readPlayDraft(keptWith("history", [{ at: "2026-10-09T01:10:00.000Z" }]))).toBeUndefined()
    expect(readPlayDraft(keptWith("pachinko", {}))).toBeUndefined()
    expect(readPlayDraft(keptWith("pachislot", { formula: {} }))).toBeUndefined()
    expect(readPlayDraft(keptWith("bonuses", [1, 2]))).toBeUndefined()
    expect(readPlayDraft(keptWith("cabinetNumber", 123))).toBeUndefined()
  })
})
