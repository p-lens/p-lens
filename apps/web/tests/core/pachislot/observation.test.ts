import { describe, expect, test } from "bun:test"

import { countedSegmentsOf, segmentsOf } from "../../../src/core/pachislot/observation"
import { parsePlayLog, type Checkpoint } from "../../../src/core/play-log/checkpoint"

const shownAs = (id: string): string | undefined => (id.startsWith("reg") ? "reg" : id === "big" ? "big" : undefined)

const log = (...lines: readonly Checkpoint[]): readonly Checkpoint[] => lines

describe("reading a pachislot log as what was seen", () => {
  test("a counter read at the seat and nothing counted is the day as the counter shows it, plus the play", () => {
    const seen = segmentsOf(log({ spins: 0, counter: { total: 2400, bonuses: { big: 9, reg: 7 } } }, { spins: 800 }), shownAs)
    expect(seen).toEqual({ ok: true, value: [{ games: 3200, counts: [{ id: "big", count: 9 }, { id: "reg", count: 7 }] }] })
  })

  test("the last counter reading stands for everything before it", () => {
    const seen = segmentsOf(
      log(
        { spins: 0, counter: { total: 1000, bonuses: { big: 2, reg: 2 } } },
        { spins: 900, counter: { total: 1900, bonuses: { big: 4, reg: 3 } } },
        { spins: 1000 },
      ),
      shownAs,
    )
    expect(seen).toEqual({ ok: true, value: [{ games: 2000, counts: [{ id: "big", count: 4 }, { id: "reg", count: 3 }] }] })
  })

  test("the stretch counted by hand is kept apart, parts and small wins and all", () => {
    const seen = segmentsOf(
      log(
        { spins: 0, counter: { total: 2000, bonuses: { big: 8, reg: 6 } } },
        { spins: 100, tally: {} },
        { spins: 400, tally: { grape: 50, "reg-cherry": 1 } },
        { spins: 700, tally: { grape: 101, "reg-cherry": 1, big: 1 } },
      ),
      shownAs,
    )
    expect(seen).toEqual({
      ok: true,
      value: [
        { games: 2100, counts: [{ id: "big", count: 8 }, { id: "reg", count: 6 }] },
        { games: 600, counts: [{ id: "grape", count: 101 }, { id: "reg-cherry", count: 1 }, { id: "big", count: 1 }] },
      ],
    })
  })

  test("bonuses counted before a counter reading are on it; those counted after are added to it", () => {
    const seen = segmentsOf(
      log(
        { spins: 0, counter: { total: 1000, bonuses: { big: 2, reg: 2 } } },
        { spins: 100, tally: {} },
        { spins: 100, tally: { big: 1 } },
        { spins: 500, counter: { total: 1500, bonuses: { big: 3, reg: 2 } } },
        { spins: 500, tally: { big: 1, "reg-solo": 1 } },
        { spins: 600 },
      ),
      shownAs,
    )
    expect(seen).toEqual({
      ok: true,
      value: [
        { games: 1100, counts: [{ id: "big", count: 2 }, { id: "reg", count: 2 }] },
        { games: 500, counts: [{ id: "big", count: 1 }, { id: "reg-solo", count: 1 }] },
      ],
    })
  })

  test("a count taken back counts as never made", () => {
    const seen = segmentsOf(
      log({ spins: 0, counter: { total: 0, bonuses: {} } }, { spins: 0, tally: {} }, { spins: 0, tally: { grape: 1 } }, { spins: 300, tally: { grape: 0 } }),
      shownAs,
    )
    expect(seen).toEqual({ ok: true, value: [{ games: 300, counts: [{ id: "grape", count: 0 }] }] })
  })

  test("with no counter read, the play alone is what was seen", () => {
    expect(segmentsOf(log({ spins: 0 }, { spins: 500 }), shownAs)).toEqual({ ok: true, value: [{ games: 500, counts: [] }] })
    expect(segmentsOf([], shownAs)).toEqual({ ok: true, value: [] })
  })

  test("a counter showing fewer bonuses than were counted is pointed out", () => {
    const seen = segmentsOf(
      log({ spins: 0, tally: {} }, { spins: 200, tally: { big: 1 } }, { spins: 300, counter: { total: 300, bonuses: { big: 0, reg: 0 } } }),
      shownAs,
    )
    expect(seen).toEqual({ ok: false, error: { type: "counter-below-counting", id: "big" } })
  })
})

describe("an AT machine's log as what was counted", () => {
  test("is the regular games since counting began with what was counted in them, and nothing before", () => {
    const seat: Checkpoint = { spins: 0, outlay: 0, counter: { spins: 300 } }
    expect(countedSegmentsOf(log(seat))).toEqual([])
    expect(countedSegmentsOf(log(seat, { spins: 40, tally: {} }))).toEqual([])
    const counted = log(seat, { spins: 40, tally: {} }, { spins: 40, tally: { bell: 1 } }, { spins: 160, counter: { spins: 460 } }, { spins: 160, tally: { bell: 18 } })
    expect(countedSegmentsOf(counted)).toEqual([{ games: 120, counts: [{ id: "bell", count: 18 }] }])
  })
})

describe("a pachislot log line", () => {
  test("keeps the counter's day, its bonuses and what was counted", () => {
    const parsed = parsePlayLog(['{"spins":0,"counter":{"spins":120,"total":2400,"bonuses":{"big":9,"reg":7}}}', '{"spins":300,"tally":{"grape":51,"big":1}}'].join("\n"))
    expect(parsed).toEqual({
      ok: true,
      value: [
        { spins: 0, counter: { spins: 120, total: 2400, bonuses: { big: 9, reg: 7 } } },
        { spins: 300, tally: { grape: 51, big: 1 } },
      ],
    })
  })

  test("refuses an event that is not a jackpot and a count that is not one", () => {
    expect(parsePlayLog('{"spins":1,"event":{"kind":"bonus","bonus":"big"}}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "event" } })
    expect(parsePlayLog('{"spins":1,"tally":{"grape":-1}}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "tally" } })
    expect(parsePlayLog('{"spins":1,"counter":{"bonuses":{"big":1.5}}}')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "counter" } })
  })
})
