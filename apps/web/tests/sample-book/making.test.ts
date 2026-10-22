import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { renderEntry, type Entry } from "../../src/core/journal/entry"
import { madeAll, makingOf, nextDayOf, type Making, type SampleOrder } from "../../src/core/sample-book/book"
import type { DayPlayed } from "../../src/core/sample-book/day"
import { drawsFrom, type Draws } from "../../src/core/sample-book/draws"
import * as Pachinko from "../../src/core/sample-book/pachinko"
import * as Pachislot from "../../src/core/sample-book/pachislot"
import { settingLevelOf } from "../../src/core/sample-book/pachislot/setting-level"
import { sampleParlorsOf } from "../../src/core/sample-book/parlors"
import { daysBetween, playDaysOf, threeYearsTo } from "../../src/core/sample-book/schedule"
import type { Sitting } from "../../src/core/sample-book/sitting"
import { LINEUP, PACHINKO_SEAT, PACHISLOT_SEAT, PARLOR_LIST, playIdOn } from "./fixtures"

const FROM = "2024-01-01" as IsoDate

const THROUGH = "2024-06-30" as IsoDate

const TOKYO = { latitude: 35.6, longitude: 139.7 }

const orderOf = (seed: string): SampleOrder => ({
  from: FROM,
  through: THROUGH,
  parlors: sampleParlorsOf(PARLOR_LIST, TOKYO, FROM, THROUGH, drawsFrom(seed))[0].parlors,
  lineup: LINEUP,
  seed,
  playIdOn,
})

const daysOf = (order: SampleOrder): readonly DayPlayed[] => {
  const walk = (making: Making, played: readonly DayPlayed[]): readonly DayPlayed[] => {
    if (madeAll(making)) return played
    const next = nextDayOf(order, making)
    if (!next.ok) throw new Error(JSON.stringify(next.error))
    return walk(next.value.making, next.value.day === undefined ? played : [...played, next.value.day])
  }
  return walk(makingOf(order), [])
}

const tagOf = (entry: Entry, tag: string): string | undefined => entry.tags.find(([name]) => name === tag)?.[1]

const tallies = (days: readonly DayPlayed[]): readonly Entry[] => days.flatMap((day) => day.entries.filter((entry) => tagOf(entry, "play-id") !== undefined))

describe("the days a sample book is played on", () => {
  test("run three to five played and two to four rested, weekends among them", () => {
    const [days] = playDaysOf("2024-01-01" as IsoDate, "2026-12-31" as IsoDate, drawsFrom("days"))
    const gaps = days.slice(1).map((day, index) => daysBetween(days[index] as IsoDate, day))
    expect(gaps.every((gap) => gap === 1 || (gap >= 3 && gap <= 5))).toBe(true)
    const perWeek = (days.length / daysBetween("2024-01-01" as IsoDate, "2026-12-31" as IsoDate)) * 7
    expect(perWeek).toBeGreaterThan(3.8)
    expect(perWeek).toBeLessThan(5)
    expect(new Set(days.map((day) => new Date(`${day}T00:00:00Z`).getUTCDay())).size).toBe(7)
  })

  test("are three years to the day", () => {
    expect(threeYearsTo("2026-10-17" as IsoDate)).toBe("2023-10-18" as IsoDate)
    expect(threeYearsTo("2028-02-29" as IsoDate)).toBe("2025-03-01" as IsoDate)
  })
})

describe("the parlors a sample book plays at", () => {
  test("are eight or nine of the prefecture the device is in, nearest first", () => {
    const [{ prefecture, parlors }] = sampleParlorsOf(PARLOR_LIST, TOKYO, FROM, THROUGH, drawsFrom("parlors"))
    expect(prefecture).toBe("東京都")
    expect(parlors.length).toBeGreaterThanOrEqual(8)
    expect(parlors.length).toBeLessThanOrEqual(9)
    expect(parlors.every((sample) => sample.parlor.name.startsWith("東京都"))).toBe(true)
    expect(parlors[0]?.parlor.name).toBe("東京都ホール0")
    expect(parlors.map((sample) => sample.pull).slice(0, 4)).toEqual([5, 3, 2, 1])
  })

  test("are chosen from every parlor in the country in a moment, a name two parlors share kept once", () => {
    const many = Array.from({ length: 8000 }, (_, index) => ({ ...PARLOR_LIST[index % PARLOR_LIST.length], id: `many-${String(index)}`, name: `ホール${String(index % 7000)}`, prefecture: index % 2 === 0 ? "東京都" : "大阪府" }) as (typeof PARLOR_LIST)[number])
    const started = performance.now()
    const [{ parlors }] = sampleParlorsOf(many, TOKYO, FROM, THROUGH, drawsFrom("many"))
    expect(performance.now() - started).toBeLessThan(500)
    expect(new Set(parlors.map((sample) => sample.parlor.name)).size).toBe(parlors.length)
  })

  test("are of a prefecture with enough of them where the device does not know where it is", () => {
    const [{ parlors }] = sampleParlorsOf(PARLOR_LIST, undefined, FROM, THROUGH, drawsFrom("anywhere"))
    expect(parlors.every((sample) => sample.parlor.name.startsWith("東京都"))).toBe(true)
  })
})

describe("a sample book's days", () => {
  const order = orderOf("seed")
  const days = daysOf(order)

  test("are the same from the same seed", () => {
    expect(daysOf(orderOf("seed")).flatMap((day) => day.entries.map(renderEntry))).toEqual(days.flatMap((day) => day.entries.map(renderEntry)))
    expect(daysOf(orderOf("other")).flatMap((day) => day.entries.map(renderEntry))).not.toEqual(days.flatMap((day) => day.entries.map(renderEntry)))
  })

  test("begin at ten, end between six and nine, and sit at one to five machines, none before it was out", () => {
    expect(days.length).toBeGreaterThan(80)
    days.forEach((day) => {
      const entries = day.entries.filter((entry) => tagOf(entry, "play-id") !== undefined)
      expect(entries.length).toBeGreaterThanOrEqual(1)
      expect(entries.length).toBeLessThanOrEqual(5)
      expect(tagOf(entries[0] as Entry, "started")).toBe("10:00")
      const finished = tagOf(entries.at(-1) as Entry, "finished") ?? ""
      expect(finished <= "21:00").toBe(true)
      expect(new Set(day.machines).size).toBe(day.machines.length)
      day.machines.forEach((name) =>
        expect(((LINEUP.pachinko.find((machine) => machine.name === name) ?? LINEUP.pachislot.find((machine) => machine.name === name))?.releasedOn ?? "9999") <= day.date).toBe(true),
      )
    })
    expect(days.some((day) => day.machines.length >= 3)).toBe(true)
    expect(days.filter((day) => day.machines.length === 1).length).toBeGreaterThan(days.length / 4)
  })

  test("replay no more than a day's cap, spend cash, carry tokens from machine to machine, and now and then exchange for prizes", () => {
    const replayedOf = (entry: Entry): number =>
      -entry.postings.flatMap((posting) => (posting.kind === "balancing" ? [] : [posting])).filter((posting) => posting.account.startsWith("資産:貯") && posting.amount.quantity.mantissa < 0n).reduce((sum, posting) => sum + Number(posting.amount.quantity.mantissa), 0) -
      Number(tagOf(entry, "carried-in") ?? "0")
    const replays = days.map((day) => day.entries.filter((entry) => tagOf(entry, "play-id") !== undefined).reduce((sum, entry) => sum + replayedOf(entry), 0))
    expect(replays.every((replayed) => replayed >= 0 && replayed <= 2000)).toBe(true)
    expect(replays.some((replayed) => replayed > 0)).toBe(true)
    const rendered = tallies(days).map(renderEntry).join("\n")
    expect(rendered).toContain("資産:現金")
    expect(rendered).toContain("carried-in:")
    expect(days.flatMap((day) => day.entries).some((entry) => entry.description.endsWith("景品交換"))).toBe(true)
  })

  test("never raise cash, and describe every tally by its parlor and machine", () => {
    days
      .flatMap((day) => day.entries)
      .forEach((entry) => {
        entry.postings.flatMap((posting) => (posting.kind === "balancing" ? [] : [posting])).filter((posting) => posting.account === "資産:現金").forEach((posting) => expect(posting.amount.quantity.mantissa < 0n).toBe(true))
      })
    tallies(days).forEach((entry) => expect(entry.description).toMatch(/^.+ホール\d+ \| .+ \d+番台$/))
  })
})

describe("a pachislot machine's setting level", () => {
  const level = (settingLevel: number) => ({ settingLevel, payoutRate: 1, bonuses: [], combinedOneIn: 100 })
  test("is one of 4 to 6, each drawn, and the highest where the machine has none of them", () => {
    const six = [1, 2, 3, 4, 5, 6].map(level)
    const drawn = Array.from({ length: 300 }).reduce<readonly [readonly number[], Draws]>(
      ([seen, draws]) => {
        const [figures, next] = settingLevelOf(six, draws)
        return [[...seen, figures?.settingLevel ?? 0], next]
      },
      [[], drawsFrom("levels")],
    )[0]
    expect([...new Set(drawn)].toSorted()).toEqual([4, 5, 6])
    expect(settingLevelOf([1, 2, 3].map(level), drawsFrom("low"))[0]?.settingLevel).toBe(3)
  })
})

describe("a sitting, played out many times", () => {
  const sittingsOf = (sit: (draws: Draws) => readonly [Sitting, Draws], count: number): readonly Sitting[] =>
    Array.from({ length: count }).reduce<readonly [readonly Sitting[], Draws]>(
      ([made, draws]) => {
        const [sitting, next] = sit(draws)
        return [[...made, sitting], next]
      },
      [[], drawsFrom("sittings")],
    )[0]
  const netOf = (sittings: readonly Sitting[]): number => sittings.flatMap((sitting) => sitting.stretches).reduce((sum, stretch) => sum + stretch.won - stretch.shot, 0)
  const worthOf = (sittings: readonly Sitting[]): number => sittings.reduce((sum, sitting) => sum + sitting.theoreticalValue, 0)

  test("at pachinko comes to its theoretical value at 等価", () => {
    const sittings = sittingsOf(
      (draws) =>
        Pachinko.sittingOf(
          PACHINKO_SEAT,
          {
            minutes: 480,
            tokensPerThousand: 250,
            tokenValue: 4,
            givingUpAfter: 7000,
            leavingAfterRun: 0.15,
          },
          draws,
        ),
      2000,
    )
    expect(netOf(sittings) * 4).toBeGreaterThan(worthOf(sittings) * 0.7)
    expect(netOf(sittings) * 4).toBeLessThan(worthOf(sittings) * 1.3)
    expect(sittings.every((sitting) => (sitting.spinPerformance ?? 0) > 18)).toBe(true)
  })

  test("at pachislot comes to its theoretical value", () => {
    const sittings = sittingsOf(
      (draws) =>
        Pachislot.sittingOf(
          PACHISLOT_SEAT,
          {
            minutes: 480,
            tokensPerThousand: 50,
            tokenValue: 20,
            givingUpAfter: undefined,
            leavingAfterRun: 0,
          },
          draws,
        ),
      2000,
    )
    const net = netOf(sittings) * 20
    const worth = worthOf(sittings)
    expect(Math.abs(net - worth)).toBeLessThan(Math.abs(worth) * 0.3)
  })
})
