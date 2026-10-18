import { describe, expect, test } from "bun:test"

import type { NormalizedSpecDto } from "@p-lens/contracts/pachislot"

import { atEndingsOf, atModesOf, atSeatCheckpoint, ceilingsOf, czMissedAt, hasCz, huntSeatsOf, inAt, pathOf, resetMatters, standingOf, withLastTakenBack } from "../../../src/core/pachislot/path"
import { parsePlayLog, type Checkpoint } from "../../../src/core/play-log/checkpoint"

const at = "2026-10-05T10:00:00.000Z"

const log = (...lines: readonly Checkpoint[]): readonly Checkpoint[] => lines

const seat = (sinceAt: number, sinceCz?: number, misses = 0, afterReset = false): Checkpoint => atSeatCheckpoint({ sinceAt, sinceCz, misses, afterReset, held: undefined, sinceAtAcrossBonuses: undefined, mode: undefined }, at)

const machine = (atRules: NonNullable<NormalizedSpecDto["atRules"]>, afterAt: readonly number[], afterReset: readonly number[]): NormalizedSpecDto => ({
  schemaVersion: 1,
  bet: 3,
  tables: [1, 6].map((settingLevel) => ({ settingLevel, events: [], at: { chance: 0.01, success: 0.3, allotments: { afterAt, afterReset }, payout: { type: "fixed" as const, medals: 600 } } })),
  atRules,
})

const direct = machine({ base: 40, at: "at", modes: [{ id: "at", ceiling: 1000 }, { id: "at:reset", ceiling: 600 }] }, [1, 0], [0, 1])

const cz = machine(
  { base: 40, at: "at", trigger: "cz", modes: [{ id: "cz", ceiling: 600 }], atCeiling: 1000, misses: 3 },
  [1],
  [1],
)

describe("an AT machine's play as the path the engine walks", () => {
  test("the seat is where play stood: the games since the CZ are the games since the AT unless given", () => {
    expect(seat(420)).toEqual({ spins: 0, outlay: 0, at, counter: { spins: 420 } })
    expect(seat(420, 30, 2, true)).toEqual({ spins: 0, outlay: 0, at, counter: { spins: 420, sinceCz: 30, misses: 2 }, afterReset: true })
    expect(pathOf(log(seat(420)))).toEqual({ start: { sinceTrigger: 420, sinceAt: 420, misses: 0, afterReset: false }, legs: [] })
    expect(pathOf(log(seat(420, 30, 2)))?.start).toEqual({ sinceTrigger: 30, sinceAt: 420, misses: 2, afterReset: false })
    expect(pathOf([])).toBeUndefined()
  })

  test("each CZ missed and each AT won ends a leg, and the games since are the last", () => {
    const played = log(
      seat(200, 50, 1),
      { spins: 80, counter: { spins: 280 } },
      { spins: 120, counter: { spins: 320 }, event: { kind: "cz-missed" } },
      { spins: 300, event: { kind: "jackpot" } },
      { spins: 340, counter: { spins: 40 } },
    )
    const path = pathOf(played)
    expect(path?.legs).toEqual([
      { games: 120, end: "missed" },
      { games: 180, end: "won-at" },
      { games: 40, end: "going" },
    ])
    expect(path === undefined ? undefined : standingOf(path)).toEqual({ sinceTrigger: 40, sinceAt: 40, misses: 0, afterReset: false })
    const beforeAt = pathOf(played.slice(0, 3))
    expect(beforeAt === undefined ? undefined : standingOf(beforeAt)).toEqual({ sinceTrigger: 0, sinceAt: 320, misses: 2, afterReset: false })
  })

  test("a bonus that missed the AT is a leg of its own, which starts the counts again where the machine restarts at one", () => {
    const played = log(seat(100, 30, 1), { spins: 80, event: { kind: "bonus-missed" } }, { spins: 140 })
    const path = pathOf(played)
    expect(path?.legs).toEqual([
      { games: 80, end: "bonus" },
      { games: 60, end: "going" },
    ])
    const rules = { base: 40, at: "at", trigger: "cz", modes: [{ id: "cz" }] }
    const counted = machine(rules, [1], [1])
    const restarting = machine({ ...rules, bonusMiss: "restarts" }, [1], [1])
    expect(path === undefined ? undefined : standingOf(path, counted)).toEqual({ sinceTrigger: 60, sinceAt: 240, misses: 2, afterReset: false })
    expect(path === undefined ? undefined : standingOf(path, restarting)).toEqual({ sinceTrigger: 60, sinceAt: 60, misses: 0, afterReset: false })
    expect(withLastTakenBack(played, "bonus-missed")).toEqual({ ok: false, error: { type: "played-on", taken: "bonus-missed" } })
  })

  test("a bonus that starts play again leaves the games since the AT counted on where an AT間天井 counts across it", () => {
    const played = log(seat(100, 30, 1), { spins: 80, event: { kind: "bonus-missed" } }, { spins: 140, event: { kind: "bonus-missed" } }, { spins: 200 })
    const path = pathOf(played)
    const across = machine({ base: 40, at: "at", trigger: "cz", modes: [{ id: "cz", atCeiling: 800 }], bonusMiss: "restarts", ceilingAcrossBonuses: 1600 }, [1], [1])
    const standing = path === undefined ? undefined : standingOf(path, across)
    expect(standing).toEqual({ sinceTrigger: 60, sinceAt: 60, misses: 0, afterReset: false, sinceAtAcrossBonuses: 300 })
    expect(standing === undefined ? undefined : ceilingsOf(standing, across).at).toBe(740)
    expect(ceilingsOf({ sinceTrigger: 60, sinceAt: 60, misses: 0, afterReset: false, sinceAtAcrossBonuses: 1500 }, across).at).toBe(100)
    expect(huntSeatsOf(machine({ base: 40, at: "at", trigger: "cz", modes: [{ id: "cz" }], bonusMiss: "restarts", ceilingAcrossBonuses: 1600 }, [1], [1]), false, 0).at(-1)?.sinceAt).toBe(1500)
  })

  test("hunt seats say the games since the side bonus where the machine has one and they are given", () => {
    const sided = machine({ base: 40, at: "at", modes: [{ id: "at", ceiling: 500 }], sideBonus: { id: "fran", ceiling: 300, payout: { medals: 100 } } }, [1], [1])
    expect(huntSeatsOf(sided, false, 0, undefined, 120).every((seat) => seat.sinceSideBonus === 120)).toBe(true)
    expect(huntSeatsOf(sided, false, 0, undefined, 450).every((seat) => seat.sinceSideBonus === 299)).toBe(true)
    const unceiled = machine({ base: 40, at: "at", modes: [{ id: "at", ceiling: 500 }], sideBonus: { id: "fran", payout: { medals: 100 } } }, [1], [1])
    expect(huntSeatsOf(unceiled, false, 0, undefined, 120).some((seat) => seat.sinceSideBonus !== undefined)).toBe(false)
    expect(huntSeatsOf(sided, false, 0).some((seat) => seat.sinceSideBonus !== undefined)).toBe(false)
    const plain = machine({ base: 40, at: "at", modes: [{ id: "at", ceiling: 500 }] }, [1], [1])
    expect(huntSeatsOf(plain, false, 0, undefined, 120).some((seat) => seat.sinceSideBonus !== undefined)).toBe(false)
  })

  test("the seat may give the games since the AT itself across the bonuses that started the counter again, and the path starts from them", () => {
    const first = atSeatCheckpoint({ sinceAt: 120, sinceCz: undefined, misses: 0, afterReset: false, held: undefined, sinceAtAcrossBonuses: 900, mode: undefined }, at)
    expect(first.counter).toEqual({ spins: 120, sinceAtAcrossBonuses: 900 })
    expect(parsePlayLog(`${JSON.stringify(first)}\n`)).toEqual({ ok: true, value: [first] })
    expect(pathOf(log(first, { spins: 30 }))?.start).toEqual({ sinceTrigger: 120, sinceAt: 120, misses: 0, afterReset: false, sinceAtAcrossBonuses: 900 })
    expect(pathOf(log(seat(120)))?.start.sinceAtAcrossBonuses).toBeUndefined()
    const below = atSeatCheckpoint({ sinceAt: 120, sinceCz: undefined, misses: 0, afterReset: false, held: undefined, sinceAtAcrossBonuses: 80, mode: undefined }, at)
    expect(pathOf(log(below))?.start.sinceAtAcrossBonuses).toBe(120)
    const across = machine({ base: 40, at: "at", trigger: "cz", modes: [{ id: "cz", atCeiling: 800 }], bonusMiss: "restarts", ceilingAcrossBonuses: 1600 }, [1], [1])
    const path = pathOf(log(first, { spins: 30, event: { kind: "bonus-missed" } }, { spins: 50 }))
    expect(path === undefined ? undefined : standingOf(path, across)).toEqual({ sinceTrigger: 20, sinceAt: 20, misses: 0, afterReset: false, sinceAtAcrossBonuses: 950 })
    expect(parsePlayLog('{"spins":0,"counter":{"spins":5,"sinceAtAcrossBonuses":-1}}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "counter" } })
  })

  test("an AT found only after its line was written is a leg of no games", () => {
    expect(pathOf(log({ spins: 0 }, { spins: 0, event: { kind: "jackpot", approximate: true } }, { spins: 100 }))?.legs).toEqual([
      { games: 0, end: "won-at" },
      { games: 100, end: "going" },
    ])
  })

  test("a reading marked as a CZ missed carries it on its last line", () => {
    expect(czMissedAt([{ spins: 10, event: { kind: "jackpot", approximate: true } }, { spins: 50 }])).toEqual([
      { spins: 10, event: { kind: "jackpot", approximate: true } },
      { spins: 50, event: { kind: "cz-missed" } },
    ])
  })
})

describe("how far play is from each ceiling", () => {
  test("a machine without a CZ: its ceiling runs under the setting change's until the first AT", () => {
    const reset = { sinceTrigger: 100, sinceAt: 100, misses: 0, afterReset: true }
    expect(ceilingsOf(reset, direct)).toEqual({ trigger: 500, at: undefined, misses: undefined, zone: undefined })
    expect(ceilingsOf({ ...reset, afterReset: false }, direct).trigger).toBe(900)
    expect(ceilingsOf({ ...reset, sinceTrigger: 2000 }, direct).trigger).toBe(0)
    expect(hasCz(direct)).toBe(false)
    expect(resetMatters(direct)).toBe(true)
  })

  test("a CZ machine stored before each mode held its AT間天井: the machine's one is every mode's", () => {
    expect(ceilingsOf({ sinceTrigger: 100, sinceAt: 700, misses: 2, afterReset: false }, cz)).toEqual({
      trigger: 500,
      at: 300,
      misses: { missed: 2, limit: 3 },
      zone: undefined,
    })
    expect(hasCz(cz)).toBe(true)
    expect(resetMatters(cz)).toBe(false)
  })

  test("a CZ machine whose setting change shortens the AT間天井: the shorter until the first AT, the usual after one", () => {
    const shortened = machine(
      {
        base: 40,
        at: "at",
        trigger: "cz",
        modes: [
          { id: "cz", ceiling: 500, atCeiling: 980 },
          { id: "cz:reset", ceiling: 500, atCeiling: 630 },
        ],
        misses: 7,
      },
      [1, 0],
      [0, 1],
    )
    expect(ceilingsOf({ sinceTrigger: 50, sinceAt: 300, misses: 2, afterReset: true }, shortened)).toMatchObject({ trigger: 450, at: 330 })
    expect(ceilingsOf({ sinceTrigger: 50, sinceAt: 300, misses: 2, afterReset: false }, shortened)).toMatchObject({ trigger: 450, at: 680 })
    expect(resetMatters(shortened)).toBe(true)
  })

  test("a mode with no ceiling leaves the trigger's unknown", () => {
    const open = machine({ base: 40, at: "at", modes: [{ id: "at" }] }, [1], [1])
    expect(ceilingsOf({ sinceTrigger: 0, sinceAt: 0, misses: 0, afterReset: false }, open).trigger).toBeUndefined()
  })
})

describe("an AT's result and the 有利区間 it leaves", () => {
  const capped = machine(
    { base: 40, at: "at", modes: [{ id: "at", ceiling: 1000 }], cap: 2400, window: 32 },
    [1],
    [1],
  )
  const sets = { type: "sets" as const, first: 300, set: 100, continuationRate: 0.8 }
  const paid: NormalizedSpecDto = {
    ...capped,
    tables: [1, 6].map((settingLevel) => ({ settingLevel, events: [], at: { chance: 0.01, success: 1, allotments: { afterAt: [1], afterReset: [1] }, payout: sets } })),
  }

  test("what was seen of an AT ending is carried onto the leg its jackpot ended", () => {
    const played = log(
      seat(100, undefined, 0),
      { spins: 50, event: { kind: "jackpot" } },
      { spins: 50, event: { kind: "at-ended", completed: false, sets: 4 } },
      { spins: 60, counter: { spins: 10 } },
    )
    const path = pathOf(played)
    expect(path?.legs).toEqual([
      { games: 50, end: "won-at", at: { completed: false, sets: 4 } },
      { games: 10, end: "going" },
    ])
    const standing = path === undefined ? undefined : standingOf(path, paid)
    expect(standing).toEqual({ sinceTrigger: 10, sinceAt: 10, misses: 0, afterReset: false, held: 700 })
    expect(standing === undefined ? undefined : ceilingsOf(standing, capped).zone).toEqual({ games: 22, headroom: 2400 - (700 - 12.5) })
  })

  test("how an AT was said to end is carried onto its leg and where play stands, and let go of by a bonus that starts play again", () => {
    const ended: NormalizedSpecDto = {
      schemaVersion: 1,
      bet: 3,
      tables: [1, 6].map((settingLevel) => ({
        settingLevel,
        events: [],
        at: {
          chance: 0.01,
          success: 1,
          allotments: { afterAt: [0.3, 0.7], afterReset: [0, 1], afterEndings: [{ share: 0.3, afterAt: [1, 0] }, { share: 0.7, afterAt: [0, 1] }] },
          payout: { type: "fixed" as const, medals: 600 },
        },
      })),
      atRules: { base: 40, at: "at", modes: [{ id: "short", ceiling: 428 }, { id: "long", ceiling: 1009 }], endings: ["through", "rest"], bonusMiss: "restarts" },
    }
    const ending: Checkpoint = { spins: 50, event: { kind: "at-ended", ending: "through" } }
    const played = log(seat(100), { spins: 50, event: { kind: "jackpot" } }, ending, { spins: 80 })
    const path = pathOf(played)
    expect(path?.legs).toEqual([
      { games: 50, end: "won-at", at: { ending: "through" } },
      { games: 30, end: "going" },
    ])
    const standing = path === undefined ? undefined : standingOf(path, ended)
    expect(standing).toEqual({ sinceTrigger: 30, sinceAt: 30, misses: 0, afterReset: false, ending: "through" })
    expect(standing === undefined ? undefined : ceilingsOf(standing, ended).trigger).toBe(398)
    expect(ceilingsOf({ sinceTrigger: 30, sinceAt: 30, misses: 0, afterReset: false }, ended).trigger).toBe(979)
    const restarted = pathOf([...played, { spins: 90, event: { kind: "bonus-missed" } }])
    expect(restarted === undefined ? undefined : standingOf(restarted, ended).ending).toBeUndefined()
    expect(parsePlayLog(`${JSON.stringify(ending)}\n`)).toEqual({ ok: true, value: [ending] })
  })

  test("an AT won back in the window holds what the zone already held as well as its own", () => {
    const back = pathOf(
      log(
        atSeatCheckpoint({ sinceAt: 10, sinceCz: undefined, misses: 0, afterReset: false, held: 1500, sinceAtAcrossBonuses: undefined, mode: undefined }, at),
        { spins: 5, event: { kind: "jackpot" } },
        { spins: 5, event: { kind: "at-ended", completed: false, sets: 4 } },
      ),
    )
    const standing = back === undefined ? undefined : standingOf(back, paid)
    expect(standing?.held).toBe(1500 - 14 * 1.25 + 700)
    expect(standing === undefined ? undefined : ceilingsOf(standing, paid).zone).toEqual({ games: 32, headroom: 2400 - (1500 - 17.5 + 700) })
  })

  test("an AT that reached the cap leaves nothing held, and the seat may say what is", () => {
    const done = pathOf(log(seat(0), { spins: 5, event: { kind: "jackpot" } }, { spins: 5, event: { kind: "at-ended", completed: true, medals: 2400 } }))
    expect(done === undefined ? undefined : standingOf(done, paid).held).toBeUndefined()
    expect(pathOf(log(atSeatCheckpoint({ sinceAt: 5, sinceCz: undefined, misses: 0, afterReset: false, held: 900, sinceAtAcrossBonuses: undefined, mode: undefined }, at)))?.start.held).toBe(900)
    expect(ceilingsOf({ sinceTrigger: 40, sinceAt: 40, misses: 0, afterReset: false, held: 900 }, capped).zone).toBeUndefined()
  })
})

describe("the log keeps what an AT machine's play needs", () => {
  test("a setting change only as true, a CZ missed as an event, and the seat's CZ counts on the counter", () => {
    expect(parsePlayLog('{"spins":0,"afterReset":true}')).toEqual({ ok: true, value: [{ spins: 0, afterReset: true }] })
    expect(parsePlayLog('{"spins":0,"afterReset":false}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "afterReset" } })
    expect(parsePlayLog('{"spins":5,"event":{"kind":"cz-missed"},"counter":{"spins":5,"sinceCz":0,"misses":1}}')).toEqual({
      ok: true,
      value: [{ spins: 5, event: { kind: "cz-missed" }, counter: { spins: 5, sinceCz: 0, misses: 1 } }],
    })
    expect(parsePlayLog('{"spins":5,"event":{"kind":"cz-missed","approximate":true}}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "event" } })
    expect(parsePlayLog('{"spins":5,"event":{"kind":"at-ended","completed":true,"medals":2400}}')).toEqual({
      ok: true,
      value: [{ spins: 5, event: { kind: "at-ended", completed: true, medals: 2400 } }],
    })
    expect(parsePlayLog('{"spins":5,"event":{"kind":"at-ended","sets":-1}}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "event" } })
    expect(parsePlayLog('{"spins":5,"event":{"kind":"at-ended","ending":"through"}}')).toEqual({ ok: true, value: [{ spins: 5, event: { kind: "at-ended", ending: "through" } }] })
    expect(parsePlayLog('{"spins":5,"event":{"kind":"at-ended","ending":""}}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "event" } })
  })
})

describe("taking the last AT won or CZ missed back", () => {
  const AT = "2026-10-05T12:00:00.000Z"
  const seat = { spins: 0, outlay: 0, at: AT, counter: { spins: 300 } }
  const plain = { spins: 120, outlay: 5000, at: AT, counter: { spins: 420 } }
  const won = { ...plain, event: { kind: "jackpot" as const } }
  const missed = { ...plain, event: { kind: "cz-missed" as const } }

  test("keeps the reading it was kept at as a plain one, and lets go of how the AT went", () => {
    expect(withLastTakenBack([seat, won], "at")).toEqual({ ok: true, value: [seat, plain] })
    expect(withLastTakenBack([seat, won, { spins: 120, at: AT, event: { kind: "at-ended" as const, completed: true } }], "at")).toEqual({ ok: true, value: [seat, plain] })
    expect(withLastTakenBack([seat, missed], "cz-missed")).toEqual({ ok: true, value: [seat, plain] })
  })

  test("is refused where there is none, or the play has gone on past it", () => {
    expect(withLastTakenBack([seat], "at")).toEqual({ ok: false, error: { type: "none", taken: "at" } })
    expect(withLastTakenBack([seat, won], "cz-missed")).toEqual({ ok: false, error: { type: "none", taken: "cz-missed" } })
    expect(withLastTakenBack([seat, won, { spins: 200, at: AT, counter: { spins: 80 } }], "at")).toEqual({ ok: false, error: { type: "played-on", taken: "at" } })
    expect(withLastTakenBack([seat, missed, { spins: 200, at: AT, counter: { spins: 500 } }], "cz-missed")).toEqual({ ok: false, error: { type: "played-on", taken: "cz-missed" } })
  })
})

describe("whether an AT machine's play is in an AT", () => {
  test("it is from the line an AT was won on until a reading of the games after it, how it went said or not", () => {
    const won: Checkpoint = { spins: 120, at, counter: { spins: 420 }, event: { kind: "jackpot" } }
    expect(inAt(log(seat(300)))).toBe(false)
    expect(inAt(log(seat(300), won))).toBe(true)
    expect(inAt(log(seat(300), won, { spins: 120, at, event: { kind: "at-ended", completed: true } }))).toBe(true)
    expect(inAt(log(seat(300), won, { spins: 150, at, counter: { spins: 30 } }))).toBe(false)
  })
})

describe("the seats 天井狙い is tabled at", () => {
  test("run by the games since the last AT short of the deepest ceiling, a CZ's own where none was missed", () => {
    const shortened = machine(
      {
        base: 40,
        at: "at",
        trigger: "cz",
        modes: [
          { id: "cz", ceiling: 500, atCeiling: 980 },
          { id: "cz:reset", ceiling: 500, atCeiling: 630 },
        ],
        misses: 7,
      },
      [1, 0],
      [0, 1],
    )
    expect(huntSeatsOf(shortened, false, 0).map((seat) => seat.sinceAt)).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400, 450])
    expect(huntSeatsOf(shortened, false, 2).map((seat) => seat.sinceAt)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900])
    expect(huntSeatsOf(shortened, true, 2).map((seat) => seat.sinceAt)).toEqual([0, 100, 200, 300, 400, 500, 600])
    expect(huntSeatsOf(shortened, false, 2)[3]).toEqual({ sinceTrigger: 0, sinceAt: 300, misses: 2, afterReset: false })
    expect(huntSeatsOf(shortened, false, 0)[3]).toEqual({ sinceTrigger: 150, sinceAt: 150, misses: 0, afterReset: false })
    expect(huntSeatsOf(direct, false, 0).map((seat) => seat.sinceAt)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900])
  })

  test("never at or past a CZ a ceiling from the AT forces where it certainly succeeds, whatever was missed", () => {
    const forced = (forcedCz: "drawn" | "wins") =>
      machine(
        {
          base: 40,
          at: "at",
          trigger: "cz",
          modes: [
            { id: "cz", sinceAtCeiling: 650 },
            { id: "cz:reset", sinceAtCeiling: 350 },
          ],
          forcedCz,
        },
        [1, 0],
        [0, 1],
      )
    expect(huntSeatsOf(forced("wins"), false, 2).map((seat) => seat.sinceAt)).toEqual([0, 100, 200, 300, 400, 500, 600])
    expect(huntSeatsOf(forced("wins"), true, 2).map((seat) => seat.sinceAt)).toEqual([0, 50, 100, 150, 200, 250, 300])
    expect(huntSeatsOf(forced("drawn"), false, 2).at(-1)?.sinceAt).toBe(900)
  })

  test("after an AT said to have ended a given way, each seat says so and reaches only the modes it allots play to", () => {
    const ended: NormalizedSpecDto = {
      schemaVersion: 1,
      bet: 3,
      tables: [1, 6].map((settingLevel) => ({
        settingLevel,
        events: [],
        at: {
          chance: 0.01,
          success: 1,
          allotments: { afterAt: [0.3, 0.7], afterReset: [0, 1], afterEndings: [{ share: 0.3, afterAt: [1, 0] }, { share: 0.7, afterAt: [0, 1] }] },
          payout: { type: "fixed" as const, medals: 600 },
        },
      })),
      atRules: { base: 40, at: "at", modes: [{ id: "short", ceiling: 428 }, { id: "long", ceiling: 1009 }], endings: ["through", "rest"] },
    }
    expect(huntSeatsOf(ended, false, 0).at(-1)).toEqual({ sinceTrigger: 1000, sinceAt: 1000, misses: 0, afterReset: false })
    expect(huntSeatsOf(ended, false, 0, "through").map((seat) => seat.sinceAt)).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400])
    expect(huntSeatsOf(ended, false, 0, "through")[1]).toEqual({ sinceTrigger: 50, sinceAt: 50, misses: 0, afterReset: false, ending: "through" })
    expect(huntSeatsOf(ended, false, 0, "rest").at(-1)?.sinceAt).toBe(1000)
    expect(huntSeatsOf(ended, true, 0, "through").every((seat) => seat.ending === undefined)).toBe(true)
    expect(huntSeatsOf(ended, false, 0, "upper").every((seat) => seat.ending === undefined)).toBe(true)
    expect(atEndingsOf(ended, { through: "駆け抜け" })).toEqual([
      { id: "through", label: "駆け抜け" },
      { id: "rest", label: "rest" },
    ])
    expect(atEndingsOf(direct, {})).toEqual([])
  })
})

describe("a seat that says the mode play is in", () => {
  const rules = { base: 40, at: "at", trigger: "cz", modes: [{ id: "long", ceiling: 599 }, { id: "short", ceiling: 299 }], misses: 6 }
  const kept = machine(rules, [0.9, 0.1], [0.5, 0.5])
  const moving: NormalizedSpecDto = { ...kept, tables: kept.tables.map((table) => (table.at === undefined ? table : { ...table, at: { ...table.at, redraws: [[1, 0], [1, 0]], ceilingRedraws: [[0, 1], [0, 1]] } })) }
  const said = atSeatCheckpoint({ sinceAt: 250, sinceCz: undefined, misses: 0, afterReset: false, held: undefined, sinceAtAcrossBonuses: undefined, mode: "short" }, at)

  test("starts the path in it, reaches its ceiling alone, and offers it among the machine's modes", () => {
    const path = pathOf(log(said))
    expect(path?.start.mode).toBe("short")
    expect(path === undefined ? undefined : ceilingsOf(path.start, kept).trigger).toBe(49)
    expect(huntSeatsOf(kept, false, 0, undefined, undefined, "short").every((seat) => seat.mode === "short" && seat.sinceAt < 299)).toBe(true)
    expect(atModesOf(kept, { long: "599G", short: "299G" })).toEqual([{ id: "long", label: "599G" }, { id: "short", label: "299G" }])
  })

  test("is kept past a missed CZ where play stays in its mode, and let go of where a miss may move it, or at an AT", () => {
    const missed = log(said, { spins: 30, counter: { spins: 280 }, event: { kind: "cz-missed" } })
    const keptPath = pathOf(missed)
    expect(keptPath === undefined ? undefined : standingOf(keptPath, kept).mode).toBe("short")
    expect(keptPath === undefined ? undefined : standingOf(keptPath, moving).mode).toBeUndefined()
    const won = pathOf(log(said, { spins: 30, counter: { spins: 280 }, event: { kind: "jackpot" } }))
    expect(won === undefined ? undefined : standingOf(won, kept).mode).toBeUndefined()
  })
})
