import { describe, expect, test } from "bun:test"

import { appendCheckpoint, parsePlayLog, playLogPath } from "../../src/core/play-log/checkpoint"
import { endCounterOf, withEnd } from "../../src/core/play-log/end"
import { termsInHead, withHead } from "../../src/core/play-log/head"
import { checkedPlayOrder, inPlayOrder, stretchPerformances } from "../../src/core/play-log/performance"
import type { PlayId } from "../../src/core/play/play"

const LOG = [
  '{"spins":0,"outlay":0}',
  '{"spins":250,"outlay":1000}',
  '{"spins":620,"outlay":2000}',
  "",
  '{"spins":410,"event":{"kind":"jackpot"},"counter":{"spins":160,"jackpots":1}}',
].join("\n")

describe("play log", () => {
  test("lives beside the journal, named by the play", () => {
    expect(playLogPath("pachinko", "abc" as PlayId)).toBe("pachinko-play/abc.jsonl")
    expect(playLogPath("slot", "abc" as PlayId)).toBe("pachislot-play/abc.jsonl")
  })

  test("a line remembered later is read in its place by spins", () => {
    const parsed = parsePlayLog(LOG)
    expect(parsed.ok && inPlayOrder(parsed.value).map((checkpoint) => checkpoint.spins)).toEqual([0, 250, 410, 620])
  })

  test("appending touches no other line", () => {
    const appended = appendCheckpoint("{\"spins\":0}", { spins: 30, outlay: 500 })
    expect(appended).toBe('{"spins":0}\n{"spins":30,"outlay":500}\n')
  })

  test("spin performance is read between lines that both know the outlay", () => {
    const parsed = parsePlayLog(LOG)
    expect(parsed.ok && stretchPerformances(inPlayOrder(parsed.value))).toEqual([
      { fromSpins: 0, toSpins: 250, spinPerformance: 250 },
      { fromSpins: 250, toSpins: 620, spinPerformance: 370 },
    ])
  })

  test("spending that goes backwards is reported where it happens, not corrected", () => {
    const parsed = parsePlayLog('{"spins":0,"outlay":0}\n{"spins":300,"outlay":3000}\n{"spins":200,"outlay":4000}\n')
    expect(parsed.ok && checkedPlayOrder(parsed.value)).toEqual({
      ok: false,
      error: { type: "non-monotonic", field: "outlay", spins: 300 },
    })
  })

  test("reads a recorded play's log past its head, which says it is one, and takes a line that only looks like one further down for a fault", () => {
    const head = { playId: "p1" as PlayId, gameKind: "pachinko" as const, date: "2026-10-04" as never, startedAt: "2026-10-04T12:00:00.000Z", parlor: undefined, terms: undefined, machine: "流星", cabinetNumber: undefined, formulaId: "f1", prior: undefined }
    const headed = withHead(LOG, head)
    expect(JSON.parse(headed.split("\n")[0] ?? "")).toMatchObject({ header: true, v: 1, playId: "p1", machine: "流星", formulaId: "f1" })
    expect(parsePlayLog(headed)).toEqual(parsePlayLog(LOG))
    expect(parsePlayLog(`${LOG}\n{"header":true}`).ok).toBe(false)
  })

  test("gives back the corner's terms its head states, and none where it has no head or the head states none that read", () => {
    const terms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 133 } }
    const head = { playId: "p1" as PlayId, gameKind: "pachinko" as const, date: "2026-10-04" as never, startedAt: "2026-10-04T12:00:00.000Z", parlor: undefined, terms, machine: "流星", cabinetNumber: undefined, formulaId: undefined, prior: undefined }
    expect(termsInHead(withHead(LOG, head))).toEqual(terms)
    expect(termsInHead(withHead(LOG, { ...head, terms: undefined }))).toBeUndefined()
    expect(termsInHead(LOG)).toBeUndefined()
    expect(termsInHead(`{"header":true,"terms":{"rental":{"yen":1000,"tokens":0}}}\n${LOG}`)).toBeUndefined()
  })

  test("a broken line is named by its number", () => {
    expect(parsePlayLog('{"spins":0}\nnot json')).toEqual({ ok: false, error: { type: "unreadable-line", line: 2 } })
    expect(parsePlayLog('{"spins":-1}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "spins" } })
    expect(parsePlayLog('{"spins":1,"outlay":"lots"}')).toEqual({
      ok: false,
      error: { type: "invalid-field", line: 1, field: "outlay" },
    })
  })
})

describe("the line that ends a play", () => {
  const AT = "2026-10-04T14:30:00.000Z"
  const LOG = '{"spins":0,"outlay":0,"counter":{"spins":120}}\n{"spins":300,"outlay":5000,"counter":{"spins":420}}\n{"spins":120,"outlay":2000}\n'

  test("falls last in play order at the games the play had come to, and reads back", () => {
    const ended = withEnd(LOG, { at: AT, counter: undefined }, "pachinko")
    expect(ended).toBe(`${LOG}{"spins":300,"at":"${AT}","event":{"kind":"ended"}}\n`)
    const parsed = parsePlayLog(ended)
    expect(parsed.ok && parsed.value.at(-1)).toEqual({ spins: 300, at: AT, event: { kind: "ended" } })
  })

  test("takes the games between where the counter was last read and where it ended, and none where it ended there or behind", () => {
    expect(endCounterOf(LOG, "pachinko")).toEqual({ figure: "spins", count: 420 })
    expect(withEnd(LOG, { at: AT, counter: 455 }, "pachinko")).toBe(`${LOG}{"spins":335,"at":"${AT}","counter":{"spins":455},"event":{"kind":"ended"}}\n`)
    expect(withEnd(LOG, { at: AT, counter: 420 }, "pachinko")).toBe(`${LOG}{"spins":300,"at":"${AT}","event":{"kind":"ended"}}\n`)
    expect(withEnd(LOG, { at: AT, counter: 10 }, "pachinko")).toBe(`${LOG}{"spins":300,"at":"${AT}","event":{"kind":"ended"}}\n`)
  })

  test("follows a pachislot counter by the day's games where it was read by them, and by the games since the last AT where not", () => {
    const byTotal = '{"spins":0,"counter":{"total":2400}}\n{"spins":200,"counter":{"total":2600}}\n'
    const sinceAt = '{"spins":0,"counter":{"spins":80}}\n{"spins":150,"counter":{"spins":230}}\n'
    expect(endCounterOf(byTotal, "slot")).toEqual({ figure: "total", count: 2600 })
    expect(withEnd(byTotal, { at: undefined, counter: 2650 }, "slot")).toBe(`${byTotal}{"spins":250,"counter":{"total":2650},"event":{"kind":"ended"}}\n`)
    expect(endCounterOf(sinceAt, "slot")).toEqual({ figure: "spins", count: 230 })
  })

  test("ends an empty log at no games, and leaves a log that does not read alone", () => {
    expect(withEnd("", { at: AT, counter: 50 }, "pachinko")).toBe(`{"spins":0,"at":"${AT}","event":{"kind":"ended"}}\n`)
    expect(withEnd("not a log\n", { at: AT, counter: undefined }, "pachinko")).toBe("not a log\n")
    expect(endCounterOf("not a log\n", "pachinko")).toBeUndefined()
  })
})
