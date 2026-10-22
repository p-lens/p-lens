import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { awaitsSending, deliveryOf, jackpotCountingOf, latestTermsOf, withCabinetNumber, withJackpotCounting, withMachine, type PachinkoDraft, type PlayDraft } from "../../src/core/live-play/draft"
import { withJackpotsUntold } from "../../src/core/pachinko/revision"
import { appendCheckpoint, parsePlayLog } from "../../src/core/play-log/checkpoint"
import type { PlayId } from "../../src/core/play/play"

const LINE = "line-1"

const DRAFT: PachinkoDraft = {
  id: "p-1" as PlayId,
  date: "2026-10-09" as IsoDate,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: undefined,
  startedAt: "2026-10-09T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n',
}

const sentAs = (log: string, lineId: string): PachinkoDraft => ({ ...DRAFT, sent: [{ lineId, at: "2026-10-09T02:00:00.000Z", log }] })

describe("how a play stands with an inbox", () => {
  test("a play never sent there is unsent, and waits", () => {
    expect([deliveryOf(DRAFT, LINE), awaitsSending(DRAFT, LINE)]).toEqual(["unsent", true])
  })

  test("a play sent as it now is has gone, and does not wait", () => {
    expect([deliveryOf(sentAs(DRAFT.log, LINE), LINE), awaitsSending(sentAs(DRAFT.log, LINE), LINE)]).toEqual(["sent", false])
  })

  test("a play changed since it was sent waits again", () => {
    expect([deliveryOf(sentAs("", LINE), LINE), awaitsSending(sentAs("", LINE), LINE)]).toEqual(["changed", true])
  })

  test("a play sent to another inbox is unsent to this one", () => {
    expect([deliveryOf(sentAs(DRAFT.log, "line-2"), LINE), awaitsSending(sentAs(DRAFT.log, "line-2"), LINE)]).toEqual(["unsent", true])
  })

  test("a play someone sent here is not sent on", () => {
    expect(awaitsSending({ ...DRAFT, received: { sender: "made-up", log: DRAFT.log, finished: undefined } }, LINE)).toBe(false)
  })
})

describe("a play said anew to be on another machine", () => {
  const bonus = { name: "10R", payout: 1500, spent: 100 }
  const lines = [
    { spins: 0, outlay: 0, counter: { spins: 120 } },
    { spins: 80, outlay: 2000, event: { kind: "jackpot" as const, bonus } },
    { spins: 80, event: { kind: "jackpot" as const, approximate: true as const, bonus } },
    { spins: 130, held: 900 },
  ]
  const log = lines.reduce(appendCheckpoint, "")
  const formula = { id: "f-2", machineId: "m-2", kind: "official", figures: {} } as never
  const moved = withMachine({ ...DRAFT, log }, { type: "pachinko", name: "made-up 199", formula, bonuses: [{ name: "4R", payout: 400, spent: 40 }] as never, readings: withJackpotsUntold(lines) })

  test("is weighed by that machine's formula and chooses its jackpots from that machine's bonuses", () => {
    expect(moved).toMatchObject({ gameKind: "pachinko", machine: "made-up 199", pachinko: formula, bonuses: [{ name: "4R", payout: 400, spent: 40 }] })
  })

  test("keeps every reading where it was, its jackpots no longer saying which bonus they were", () => {
    const read = parsePlayLog(moved.log)
    expect(read.ok && read.value).toEqual([
      { spins: 0, outlay: 0, counter: { spins: 120 } },
      { spins: 80, outlay: 2000, event: { kind: "jackpot" } },
      { spins: 80, event: { kind: "jackpot", approximate: true } },
      { spins: 130, held: 900 },
    ])
  })

  test("a play whose log does not read keeps it as it is, is of the machine's game and keeps nothing of the other's, and a cabinet's number is the play's alone", () => {
    const weighing = { formula: { id: "s-2" }, prior: { type: "even" } } as never
    const pachislot = withMachine({ ...DRAFT, log }, { type: "pachislot", name: "made-up pachislot", weighing, readings: undefined })
    expect(pachislot).toMatchObject({ gameKind: "pachislot", machine: "made-up pachislot", pachislot: weighing, log })
    expect("pachinko" in pachislot || "bonuses" in pachislot).toBe(false)
    expect(withCabinetNumber(DRAFT, "123").cabinetNumber).toBe("123")
    expect(withCabinetNumber({ ...DRAFT, cabinetNumber: "123" }, undefined).cabinetNumber).toBeUndefined()
  })

  test("keeps how the cabinet's counter counts jackpots, which is the cabinet's and not the machine's", () => {
    const counted = withJackpotCounting({ ...DRAFT, log }, "per-bonus")
    const again = withMachine(counted, { type: "pachinko", name: "made-up 199", formula, bonuses: [], readings: undefined })
    expect(again.gameKind === "pachinko" && jackpotCountingOf(again)).toBe("per-bonus")
    expect("jackpotCounting" in withJackpotCounting(counted, "per-jackpot")).toBe(false)
    expect(jackpotCountingOf(DRAFT)).toBe("per-jackpot")
  })
})

describe("the latest terms of a game", () => {
  const terms = (exchangeTokens: number) => ({ rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: exchangeTokens }, replay: { paidOut: 125, deducted: 125 } })
  const at = (startedAt: string, exchangeTokens: number | undefined): PachinkoDraft => ({ ...DRAFT, startedAt, venue: { type: "none", terms: exchangeTokens === undefined ? undefined : terms(exchangeTokens) } })

  test("are the newest play's of the game that has any, never a play sent from someone else's device", () => {
    const pachislot = { ...at("2026-10-09T09:00:00.000Z", 51), gameKind: "pachislot" } as PlayDraft
    const received = { ...at("2026-10-09T08:00:00.000Z", 300), received: { sender: "仲間", log: "", finished: undefined } } as PlayDraft
    const drafts: readonly PlayDraft[] = [at("2026-10-09T02:00:00.000Z", 280), pachislot, received, at("2026-10-09T05:00:00.000Z", 275), at("2026-10-09T07:00:00.000Z", undefined)]
    expect(latestTermsOf(drafts, "pachinko")?.exchange.tokens).toBe(275)
    expect(latestTermsOf(drafts, "pachislot")?.exchange.tokens).toBe(51)
    expect(latestTermsOf([], "pachinko")).toBeUndefined()
  })
})
