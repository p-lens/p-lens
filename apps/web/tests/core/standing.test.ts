import { describe, expect, test } from "bun:test"

import { worthOf as pachinkoWorthOf } from "../../src/core/pachinko/formula"
import { worthOf as pachislotWorthOf } from "../../src/core/pachislot/formula"
import { autoSelect, ranked, sameWorth, scoreOf, selectById, usesWeighTheirMost, type FormulaListing, type Making, type Ranked, type Standing } from "../../src/core/formula/standing"

const listing = (id: string, standing: Partial<Standing>, createdAt = "2026-10-01T00:00:00.000Z"): FormulaListing<Ranked> => ({
  formula: { id, createdAt },
  standing: { verifications: 0, refutations: 0, adoptions: 0, rejections: 0, favorites: 0, uses: 0, ...standing },
})

describe("ranking formulas", () => {
  const ids = (order: readonly FormulaListing<Ranked>[]): readonly string[] => order.map((each) => each.formula.id)

  test("a score is checks, adoptions and uses, each by its weight, summed: a check is worth five adoptions, a hundred uses half of one", () => {
    expect(scoreOf(listing("x", { verifications: 1 }))).toBe(scoreOf(listing("y", { adoptions: 5 })))
    expect(scoreOf(listing("x", { adoptions: 1 }))).toBe(scoreOf(listing("y", { uses: 200 })))
    expect(scoreOf(listing("x", { verifications: 3, refutations: 3, adoptions: 2, rejections: 2, favorites: 900 }))).toBe(0)
  })

  const made = (id: string, kind: Making, standing: Partial<Standing>): FormulaListing<Ranked> => ({ ...listing(id, standing), formula: { id, createdAt: "2026-10-01T00:00:00.000Z", kind } })

  test("how a formula was made weighs too: worked out from a basis sixteen points, sampled three, typed in none, and a 設定配分 none", () => {
    expect([scoreOf(made("m", "manual", {})), scoreOf(made("s", "sampled", {})), scoreOf(made("b", "simulated", {})), scoreOf(listing("d", {}))]).toEqual([0, 300, 1_600, 0])
    expect(ids(ranked([made("typed", "manual", {}), made("sampled", "sampled", {}), made("worked", "simulated", {})], sameWorth))).toEqual(["worked", "sampled", "typed"])
    expect(ids(ranked([made("sampled", "sampled", {}), made("typed", "manual", { uses: 299 })], sameWorth))).toEqual(["sampled", "typed"])
  })

  test("uses weigh at most a hundredth short of sixteen points, however many they are", () => {
    expect([scoreOf(listing("x", { uses: 1_599 })), scoreOf(listing("x", { uses: 1_600 })), scoreOf(listing("x", { uses: 1_000_000 }))]).toEqual([1_599, 1_599, 1_599])
    expect(ids(ranked([made("typed", "manual", { uses: 1_000_000 }), made("worked", "simulated", {})], sameWorth))).toEqual(["worked", "typed"])
    expect(ids(ranked([made("worked", "simulated", {}), made("typed", "manual", { uses: 1_000_000, adoptions: 1 })], sameWorth))).toEqual(["typed", "worked"])
    expect([1_598, 1_599, 1_600].map((uses) => usesWeighTheirMost(listing("x", { uses }).standing))).toEqual([false, true, true])
  })

  test("all a maker can give their own formula never lifts it over the making above, and one more person's adoption does over one nobody marked", () => {
    const ownTyped = { adoptions: 1 }
    const ownSampled = { adoptions: 1, verifications: 1 }
    expect(ids(ranked([made("typed", "manual", ownTyped), made("sampled", "sampled", {})], sameWorth))).toEqual(["sampled", "typed"])
    expect(ids(ranked([made("sampled", "sampled", ownSampled), made("worked", "simulated", {})], sameWorth))).toEqual(["worked", "sampled"])
    expect(ids(ranked([made("sampled", "sampled", {}), made("typed", "manual", { adoptions: 2 })], sameWorth))).toEqual(["typed", "sampled"])
    expect(ids(ranked([made("worked", "simulated", {}), made("sampled", "sampled", { adoptions: 2, verifications: 1 })], sameWorth))).toEqual(["sampled", "worked"])
    expect(ids(ranked([made("worked", "simulated", {}), made("sampled", "sampled", { verifications: 2 })], sameWorth))).toEqual(["sampled", "worked"])
    expect(ids(ranked([made("worked", "simulated", {}), made("typed", "manual", { adoptions: 7 })], sameWorth))).toEqual(["worked", "typed"])
    expect(ids(ranked([made("worked", "simulated", {}), made("typed", "manual", { adoptions: 9 })], sameWorth))).toEqual(["typed", "worked"])
  })

  test("the higher score comes first, so many adoptions outweigh one check and one more adoption outweighs any use short of two hundred", () => {
    expect(ids(ranked([listing("checked", { verifications: 1 }), listing("adopted", { adoptions: 6 })], sameWorth))).toEqual(["adopted", "checked"])
    expect(ids(ranked([listing("adopted", { adoptions: 4 }), listing("checked", { verifications: 1 })], sameWorth))).toEqual(["checked", "adopted"])
    expect(ids(ranked([listing("used", { uses: 199 }), listing("adopted", { adoptions: 1 })], sameWorth))).toEqual(["adopted", "used"])
  })

  test("a refutation counts against a verification, a rejection against an adoption, and a favourite for nothing", () => {
    const order = ranked(
      [
        listing("refuted", { verifications: 3, refutations: 3, adoptions: 9 }),
        listing("held", { verifications: 2 }),
        listing("rejected", { adoptions: 10, rejections: 9, favorites: 900 }),
        listing("adopted", { adoptions: 2 }),
      ],
      sameWorth,
    )
    expect(ids(order)).toEqual(["held", "refuted", "adopted", "rejected"])
  })

  test("between two of the same score, the harsher comes first, then the older", () => {
    const worth: Readonly<Record<string, number>> = { kind: 15.2, harsh: 14.6, harshAndNewer: 14.6, harshAndOlder: 14.6 }
    const order = ranked(
      [
        listing("kind", { verifications: 1 }, "2026-09-01T00:00:00.000Z"),
        listing("harshAndNewer", { verifications: 1 }, "2026-10-03T00:00:00.000Z"),
        listing("harsh", { verifications: 1 }, "2026-10-02T00:00:00.000Z"),
        listing("harshAndOlder", { verifications: 1 }, "2026-10-01T00:00:00.000Z"),
        listing("kindButUsed", { verifications: 1, uses: 1 }, "2026-10-04T00:00:00.000Z"),
      ],
      (formula) => worth[formula.id] ?? 99,
    )
    expect(ids(order)).toEqual(["kindButUsed", "harshAndOlder", "harsh", "harshAndNewer", "kind"])
  })
})

describe("choosing a machine's formula", () => {
  const verified = listing("verified", { verifications: 2, adoptions: 3 })
  const mine = listing("mine", { adoptions: 40 })
  const none: ReadonlySet<string> = new Set()

  test("the book's favourite is chosen, and says it was", () => {
    expect(autoSelect([verified, mine], sameWorth, new Set(["mine"]))).toEqual({ by: "favorite", listing: mine })
  })

  test("without a favourite, the best ranked is chosen", () => {
    expect(autoSelect([listing("x", {}), verified], sameWorth, none)).toEqual({ by: "ranking", listing: verified })
    expect(autoSelect([], sameWorth, none)).toBeUndefined()
  })

  test("a choice by hand is taken as given", () => {
    expect(selectById([verified, mine], "mine")).toEqual({ by: "person", listing: mine })
    expect(selectById([verified], "gone")).toBeUndefined()
  })
})

describe("what a formula makes a play worth", () => {
  test("is a pachinko formula's balls a spin: a round's balls over the spins a round takes", () => {
    const figures = { payoutPerRound: 140, roundChanceOneIn: 14, totalChanceOneIn: undefined, spinsPerHour: undefined }
    expect(pachinkoWorthOf({ figures })).toBe(10)
    expect(pachinkoWorthOf({ figures: { ...figures, roundChanceOneIn: 16 } })).toBeLessThan(10)
    expect(pachinkoWorthOf({ figures: { ...figures, payoutPerRound: 130 } })).toBeLessThan(10)
  })

  test("is a pachislot formula's 機械割 taken evenly over its setting levels", () => {
    const level = (settingLevel: number, payoutRate: number) => ({ settingLevel, payoutRate, bonuses: [], combinedOneIn: 100 })
    expect(pachislotWorthOf({ figures: [level(1, 0.97), level(6, 1.09)] })).toBeCloseTo(1.03, 12)
    expect(pachislotWorthOf({ figures: [] })).toBe(0)
  })
})
