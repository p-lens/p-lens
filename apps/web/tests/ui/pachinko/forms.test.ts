import { describe, expect, test } from "bun:test"

import spec from "@p-lens/contracts/fixtures/pachinko/made-up/spec.json"
import type { SpecDto } from "@p-lens/contracts/pachinko"

import { EMPTY_MANUAL_FORM, STARTING_BASIS, basisFormOf, manualFormOf, readBasisForm, readManualForm } from "../../../src/ui/features/pachinko/formulas/formula-form"
import { modesOf, regularOf } from "../../../src/core/pachinko/world"
import { modeTitle } from "../../../src/ui/wording/pachinko/formula"

describe("the manual formula form", () => {
  test("needs only the 1R chance and the 1R payout", () => {
    expect(readManualForm({ ...EMPTY_MANUAL_FORM, roundChanceOneIn: "3.33", payoutPerRound: "140" })).toEqual({
      ok: true,
      value: { roundChanceOneIn: 3.33, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined },
    })
  })

  test("reads figures typed full-width", () => {
    expect(readManualForm({ ...EMPTY_MANUAL_FORM, roundChanceOneIn: "３．３３", payoutPerRound: "１４０" })).toEqual(
      readManualForm({ ...EMPTY_MANUAL_FORM, roundChanceOneIn: "3.33", payoutPerRound: "140" }),
    )
  })

  test("names every field it could not read", () => {
    expect(readManualForm({ ...EMPTY_MANUAL_FORM, payoutPerRound: "abc", spinsPerHour: "0" })).toEqual({
      ok: false,
      error: [
        { field: "1Rトータル確率", reason: "required" },
        { field: "1R平均出玉", reason: "not-a-number" },
        { field: "1時間の回転数", reason: "out-of-range" },
      ],
    })
  })
})

describe("a figure typed by hand", () => {
  test("is kept to as many places as it was typed", () => {
    const read = readManualForm({ roundChanceOneIn: "9.3016", payoutPerRound: "140", totalChanceOneIn: "77.694", spinsPerHour: "" })
    expect(read).toEqual({ ok: true, value: { roundChanceOneIn: 9.3016, payoutPerRound: 140, totalChanceOneIn: 77.694, spinsPerHour: undefined } })
  })

  test("is refused when it is nothing, not a number, or not above zero, each by its own reason", () => {
    const refusal = (roundChanceOneIn: string) => ((read) => (read.ok ? [] : read.error))(readManualForm({ roundChanceOneIn, payoutPerRound: "140", totalChanceOneIn: "", spinsPerHour: "" }))
    expect(refusal("")).toEqual([{ field: "1Rトータル確率", reason: "required" }])
    expect(refusal("九")).toEqual([{ field: "1Rトータル確率", reason: "not-a-number" }])
    expect(refusal("0.000")).toEqual([{ field: "1Rトータル確率", reason: "out-of-range" }])
  })

  test("is shown again to four places when a formula is remade from it", () => {
    expect(manualFormOf({ roundChanceOneIn: 9.30164, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined }).roundChanceOneIn).toBe("9.3016")
  })
})

describe("a spec value typed", () => {
  test("is refused as too fine, not as no number, when it has more than two places", () => {
    const read = readBasisForm({ ...STARTING_BASIS, regularOneIn: "319.688" })
    expect(read.ok ? [] : read.error).toContainEqual({ field: "通常時の大当り確率", reason: "too-fine" })
  })
})

describe("the basis form", () => {
  test("a stored spec read back into the form comes out as the same spec", () => {
    const form = basisFormOf(spec as SpecDto, { roundPayout: { type: "from-spec" } }, undefined)
    expect(readBasisForm(form)).toEqual({ ok: true, value: { spec: spec as SpecDto, conditions: { roundPayout: { type: "from-spec" } }, spinsPerHour: undefined } })
  })

  test("reads percentages and denominators exactly, never through a float", () => {
    const read = readBasisForm({ ...STARTING_BASIS, regularOneIn: "319.68", modes: [{ ...STARTING_BASIS.modes[0]!, continuationRate: "81.5" }] })
    expect(read.ok && regularOf(read.value.spec)?.chance).toEqual({ type: "ratio", numerator: 1, denominatorHundredths: 31_968 })
    expect(read.ok && modesOf(read.value.spec)[0]?.kind).toEqual({ type: "rushing", continuationRate: { type: "percent", basisPoints: 8150 } })
  })

  test("a measured payout replaces the sheet's in the conditions", () => {
    const read = readBasisForm({ ...STARTING_BASIS, measuredPayout: "132.5" })
    expect(read.ok && read.value.conditions).toEqual({ roundPayout: { type: "measured", balls: 132.5 } })
  })

  test("a support gain goes into the conditions in basis points, signed as typed, and none where it is left empty or nought", () => {
    const read = readBasisForm({ ...STARTING_BASIS, supportGain: "−7.5" })
    expect(read.ok && read.value.conditions).toEqual({ roundPayout: { type: "from-spec" }, supportGain: { basisPoints: -750 } })
    expect(read.ok && basisFormOf(read.value.spec, read.value.conditions, undefined).supportGain).toBe("-7.5")
    expect(((each) => each.ok && each.value.conditions)(readBasisForm({ ...STARTING_BASIS, supportGain: "0" }))).toEqual({ roundPayout: { type: "from-spec" } })
    expect(((each) => (each.ok ? [] : each.error))(readBasisForm({ ...STARTING_BASIS, supportGain: "-100" }))).toEqual([{ field: "電サポ中の出玉増減", reason: "out-of-range" }])
  })

  test("a mode said to be played without the 電サポ is kept so, and read back so", () => {
    const read = readBasisForm({ ...STARTING_BASIS, modes: [{ ...STARTING_BASIS.modes[0]!, withoutSupport: true }] })
    expect(read.ok && read.value.spec.components.withoutSupport).toEqual(["m1"])
    expect(read.ok && basisFormOf(read.value.spec, read.value.conditions, undefined).modes[0]?.withoutSupport).toBe(true)
  })

  test("refuses a share above 100% and a fractional round count, by name", () => {
    const read = readBasisForm({ ...STARTING_BASIS, firstHit: [{ share: "120", rounds: "2.5", next: "regular", prize: "", count: "", others: [], jackpots: "" }] })
    expect(read.ok ? [] : read.error).toEqual([
      { field: "初当り 1行目の振分", reason: "out-of-range" },
      { field: "初当り 1行目のR数", reason: "not-whole" },
    ])
  })
})

describe("a share won over several jackpots", () => {
  const run = { share: "100", rounds: "20", next: "m1", prize: "", count: "", others: [], jackpots: "２" }
  const form = { ...STARTING_BASIS, firstHit: [run] }

  test("says how many in the spec, and one typed as one, or left empty, says nothing", () => {
    const read = readBasisForm(form)
    expect(read.ok && regularOf(read.value.spec)?.allotment).toEqual([{ shareBasisPoints: 10_000, rounds: 20, next: { type: "mode", mode: "m1" }, jackpots: 2 }])
    const one = readBasisForm({ ...form, firstHit: [{ ...run, jackpots: "1" }] })
    expect(one.ok && regularOf(one.value.spec)?.allotment).toEqual([{ shareBasisPoints: 10_000, rounds: 20, next: { type: "mode", mode: "m1" } }])
  })

  test("comes back as typed, and a number of jackpots that is none, or more than a bonus is taken to be won over, is refused by name", () => {
    const read = readBasisForm(form)
    if (!read.ok) throw new Error("the basis should read")
    expect(basisFormOf(read.value.spec, read.value.conditions, undefined).firstHit).toEqual([{ ...run, jackpots: "2" }])
    const refusal = (jackpots: string) => ((refused) => (refused.ok ? [] : refused.error))(readBasisForm({ ...form, firstHit: [{ ...run, jackpots }] }))
    expect(refusal("0")).toEqual([{ field: "初当り 1行目の大当り回数", reason: "out-of-range" }])
    expect(refusal("51")).toEqual([{ field: "初当り 1行目の大当り回数", reason: "out-of-range" }])
    expect(refusal("2.5")).toEqual([{ field: "初当り 1行目の大当り回数", reason: "not-whole" }])
  })
})

describe("a share that pays by a prize of its own", () => {
  const form = { ...STARTING_BASIS, firstHit: [{ share: "100", rounds: "4", next: "m1", prize: "１０", count: "", others: [], jackpots: "" }] }

  test("says its prize in the spec, and a share that names none says nothing", () => {
    const read = readBasisForm(form)
    expect(read.ok && regularOf(read.value.spec)?.allotment).toEqual([{ shareBasisPoints: 10_000, rounds: 4, next: { type: "mode", mode: "m1" }, prizeBalls: 10 }])
    expect(read.ok && modesOf(read.value.spec)[0]?.allotment[0]).toEqual({ shareBasisPoints: 10_000, rounds: 10, next: { type: "mode", mode: "m1" } })
  })

  test("comes back as typed, and a prize that is no count is refused by name", () => {
    const read = readBasisForm(form)
    if (!read.ok) throw new Error("the basis should read")
    expect(basisFormOf(read.value.spec, read.value.conditions, undefined).firstHit).toEqual([{ share: "100", rounds: "4", next: "m1", prize: "10", count: "", others: [], jackpots: "" }])
    const refused = readBasisForm({ ...form, firstHit: [{ share: "100", rounds: "4", next: "m1", prize: "0", count: "", others: [], jackpots: "" }] })
    expect(refused.ok ? [] : refused.error).toEqual([{ field: "初当り 1行目の賞球", reason: "out-of-range" }])
  })
})

describe("the 遊タイム in a basis", () => {
  const reliefDriveMode = { ...STARTING_BASIS.modes[0]!, key: "m2", label: "遊タイム", kind: "rapid" as const, spins: "379" }

  test("is none while its count is left empty", () => {
    const read = readBasisForm(STARTING_BASIS)
    expect(read.ok && regularOf(read.value.spec)?.reliefDrive).toBeUndefined()
  })

  test("is its count and the mode it leads to, and comes back as typed", () => {
    const form = { ...STARTING_BASIS, modes: [...STARTING_BASIS.modes, reliefDriveMode], reliefDriveGauge: "９５０", reliefDriveTo: "m2" }
    const read = readBasisForm(form)
    expect(read.ok && regularOf(read.value.spec)?.reliefDrive).toEqual({ gauge: 950, to: "m2" })
    if (!read.ok) throw new Error("the basis should read")
    expect(basisFormOf(read.value.spec, read.value.conditions, undefined).reliefDriveGauge).toBe("950")
  })

  test("needs a mode to lead to once it has a count", () => {
    const read = readBasisForm({ ...STARTING_BASIS, reliefDriveGauge: "950", reliefDriveTo: "" })
    expect(read).toEqual({ ok: false, error: [{ field: "遊タイムの移行先", reason: "required" }] })
  })
})

describe("a mode in a list of destinations", () => {
  test("goes by its name, and until it has one by its place among the modes", () => {
    expect(modeTitle(" RUSH ", 1)).toBe("RUSH")
    expect(modeTitle("", 2)).toBe("モード2")
    expect(modeTitle("  ", 3)).toBe("モード3")
  })
})

describe("a jackpot through two attackers", () => {
  const vRound = { rounds: "1", prize: "1", count: "" }
  const share = { share: "100", next: "m1", jackpots: "", ...vRound, others: [{ rounds: "9", prize: "", count: "" }, { rounds: "2", prize: "12", count: "５" }] }
  const form = { ...STARTING_BASIS, firstHit: [share] }

  test("says each attacker's rounds in the spec, by its own prize and count where it names them", () => {
    const read = readBasisForm(form)
    expect(read.ok && regularOf(read.value.spec)?.allotment).toEqual([
      { shareBasisPoints: 10_000, rounds: 1, prizeBalls: 1, next: { type: "mode", mode: "m1" }, otherRounds: [{ rounds: 9 }, { rounds: 2, prizeBalls: 12, count: 5 }] },
    ])
  })

  test("comes back as typed, and other rounds that are no count are refused by name", () => {
    const read = readBasisForm(form)
    if (!read.ok) throw new Error("the basis should read")
    expect(basisFormOf(read.value.spec, read.value.conditions, undefined).firstHit).toEqual([{ ...share, others: [{ rounds: "9", prize: "", count: "" }, { rounds: "2", prize: "12", count: "5" }] }])
    const refused = readBasisForm({ ...form, firstHit: [{ ...share, others: [{ rounds: "", prize: "", count: "0" }] }] })
    expect(refused.ok ? [] : refused.error.map((problem) => problem.field)).toEqual(["初当り 1行目の別アタッカー1のR数", "初当り 1行目の別アタッカー1のカウント"])
  })
})
