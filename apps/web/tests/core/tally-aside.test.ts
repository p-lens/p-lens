import { describe, expect, test } from "bun:test"

import { renderEntry } from "../../src/core/journal/entry"
import { asideOf, asideTags, keptSpinPerformance } from "../../src/core/tally/aside"
import { appendCheckpoint } from "../../src/core/play-log/checkpoint"
import { composeTokenTallyEntry, composeYenTallyEntry } from "../../src/core/tally/compose"
import { netCountsOf } from "../../src/core/tally/net-counts"
import { mapOk } from "../../src/core/result/result"
import { dec, PRICES, RENTED_PLAY } from "../support/values"

describe("what is written beside a tally", () => {
  test("is its times as a clock shows them and its spin performance to a tenth, on the line of its description", () => {
    const play = { ...RENTED_PLAY, clock: { started: { hour: 9, minute: 5 }, finished: { hour: 18, minute: 40 } }, spinPerformance: keptSpinPerformance(18.249) }
    expect(asideTags(play)).toEqual([["started", "09:05"], ["finished", "18:40"], ["spin-performance", "18.2"]])
    const header = mapOk(composeTokenTallyEntry(play, PRICES), (entry) => renderEntry(entry).split("\n")[0])
    expect(header.ok && header.value?.endsWith("started: 09:05, finished: 18:40, spin-performance: 18.2")).toBe(true)
  })

  test("is nothing where nothing was said, and only what was", () => {
    expect(asideTags(RENTED_PLAY)).toEqual([])
    expect(asideTags({ ...RENTED_PLAY, clock: { started: undefined, finished: { hour: 0, minute: 30 } } })).toEqual([["finished", "00:30"]])
  })

  test("is who sent its play, by their invitation's id and the name they were given, with nothing that would end a tag", () => {
    const play = { ...RENTED_PLAY, sender: { id: "grant-1", name: "ハンマ, ハナヤマ" } }
    expect(asideTags(play)).toEqual([["sender-id", "grant-1"], ["sender", "ハンマ， ハナヤマ"]])
    const tags: Readonly<Record<string, string>> = { "sender-id": "grant-1", sender: "ハンマ" }
    expect(asideOf((name) => tags[name]).sender).toEqual({ id: "grant-1", name: "ハンマ" })
    expect(asideOf((name) => (name === "sender" ? "ハンマ" : undefined)).sender).toBeUndefined()
  })

  test("is read back from tags, a time that is no time read as none", () => {
    const tags: Readonly<Record<string, string>> = { started: "9:05", finished: "25:00", "spin-performance": "17.5" }
    const read = asideOf((name) => tags[name])
    expect(read.clock).toEqual({ started: { hour: 9, minute: 5 }, finished: undefined })
    expect(read.spinPerformance).toEqual(keptSpinPerformance(17.5))
  })
})

describe("what a play's log counted, beside its tally", () => {
  const log = [
    { spins: 0, outlay: 0 },
    { spins: 290, outlay: 10000, event: { kind: "jackpot" as const } },
    { spins: 520, outlay: 10000, phase: "special" as const, event: { kind: "jackpot" as const, bonus: { name: "10R", payout: 3000, spent: 200, jackpots: 2 } } },
    { spins: 700, outlay: 15000 },
  ].reduce<string>(appendCheckpoint, "")

  test("is the spins or games from the seat, a pachinko play's regular games among them, and the jackpots, ATs or bonuses, each jackpot of a run counted", () => {
    expect(netCountsOf(log, "pachinko")).toEqual({ type: "pachinko", spins: 700, regularSpins: 470, jackpots: 3 })
    expect(netCountsOf(log, "at-machine")).toEqual({ type: "at-machine", games: 700, ats: 3 })
    expect(netCountsOf(log, "bonus-machine")).toEqual({ type: "bonus-machine", games: 700, bonuses: 3 })
    expect(netCountsOf(log, "games")).toEqual({ type: "games", games: 700 })
    expect(netCountsOf("not a log", "pachinko")).toBeUndefined()
  })

  test("is written as the game counts and read back whole, and a set of counts not whole is read as none", () => {
    expect(asideTags({ ...RENTED_PLAY, netCounts: { type: "pachinko", spins: 700, regularSpins: 470, jackpots: 3 } })).toEqual([["net-spins", "700"], ["net-regular-spins", "470"], ["net-jackpots", "3"]])
    expect(asideTags({ ...RENTED_PLAY, netCounts: { type: "pachinko", spins: 700, regularSpins: undefined, jackpots: 3 } })).toEqual([["net-spins", "700"], ["net-jackpots", "3"]])
    expect(asideTags({ ...RENTED_PLAY, gameKind: "pachislot", netCounts: { type: "at-machine", games: 1800, ats: 2 } })).toEqual([["net-games", "1800"], ["net-ats", "2"]])
    expect(asideTags({ ...RENTED_PLAY, gameKind: "pachislot", netCounts: { type: "bonus-machine", games: 2400, bonuses: 11 } })).toEqual([["net-games", "2400"], ["net-bonuses", "11"]])
    const read = (tags: Readonly<Record<string, string>>) => asideOf((name) => tags[name]).netCounts
    expect(read({ "net-spins": "700", "net-regular-spins": "470", "net-jackpots": "3" })).toEqual({ type: "pachinko", spins: 700, regularSpins: 470, jackpots: 3 })
    expect(read({ "net-spins": "700", "net-jackpots": "3" })).toEqual({ type: "pachinko", spins: 700, regularSpins: undefined, jackpots: 3 })
    expect(read({ "net-regular-spins": "470", "net-jackpots": "3" })).toEqual({ type: "pachinko", spins: undefined, regularSpins: 470, jackpots: 3 })
    expect(read({ "net-games": "1800", "net-ats": "2" })).toEqual({ type: "at-machine", games: 1800, ats: 2 })
    expect(read({ "net-games": "2400", "net-bonuses": "11" })).toEqual({ type: "bonus-machine", games: 2400, bonuses: 11 })
    expect(read({ "net-games": "300" })).toEqual({ type: "games", games: 300 })
    expect([read({ "net-jackpots": "3" }), read({ "net-spins": "700" }), read({})]).toEqual([undefined, undefined, undefined])
  })

  test("writes a tally in yen's jackpots once, as its log counted them, whatever was told of it", () => {
    const tally = { id: "p" as never, date: "2026-10-04" as never, parlor: undefined, gameKind: "pachinko" as const, machine: "流星", cabinetNumber: undefined, outlay: dec("10000"), takings: dec("0"), settlement: undefined, theoreticalValue: undefined, told: { hours: dec("3"), netJackpots: 9, inferred: undefined }, netCounts: { type: "pachinko" as const, spins: 700, regularSpins: 470, jackpots: 3 } }
    const header = mapOk(composeYenTallyEntry(tally), (entry) => renderEntry(entry).split("\n")[0] ?? "")
    expect(header.ok && header.value.match(/net-jackpots: \d+/g)).toEqual(["net-jackpots: 3"])
  })
})
