import { describe, expect, test } from "bun:test"

import type { SpecDto } from "@p-lens/contracts/pachislot"
import atSpec from "@p-lens/contracts/fixtures/pachislot/made-up-at/spec.json"
import capSpec from "@p-lens/contracts/fixtures/pachislot/made-up-cap/spec.json"
import czSpec from "@p-lens/contracts/fixtures/pachislot/made-up-cz/spec.json"
import modesSpec from "@p-lens/contracts/fixtures/pachislot/made-up-modes/spec.json"
import rateSpec from "@p-lens/contracts/fixtures/pachislot/made-up-rate/spec.json"
import spec from "@p-lens/contracts/fixtures/pachislot/made-up/spec.json"

import { readDistributionForm, sharesTotal } from "../../../src/ui/features/pachislot/formulas/distribution-form"
import {
  EMPTY_GATE,
  EMPTY_LAW,
  hasCz,
  hasModes,
  isAtMachine,
  STARTING_AT_MANUAL,
  STARTING_MANUAL,
  STARTING_WORLD,
  everyEndingAllotted,
  freshKey,
  manualFormOf,
  newRow,
  readManualForm,
  readWorldForm,
  worldFormOf,
} from "../../../src/ui/features/pachislot/formulas/world-form"

const madeUp = spec as SpecDto

/** The made-up machine of modes with a CZ bringing its AT, a failed CZ in 通常 moving play to 天国 at a share, and 天国's CZ winning at its own rate; a failed CZ that came on 通常's ceiling always moves play to 天国. */
const chainedModes = (): SpecDto => {
  const modes = modesSpec as SpecDto
  const { firstHit: _, ...components } = modes.components
  const levels = (low: number, high: number) => [
    { settingLevel: 1, value: low },
    { settingLevel: 6, value: high },
  ]
  return {
    ...modes,
    entities: [...modes.entities, "cz"],
    components: {
      ...components,
      label: { ...modes.components.label, cz: "CZ" },
      cz: ["cz"],
      firstHit: { cz: [{ settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 15_000 } }, { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 12_000 } }] },
      success: { cz: levels(3_000, 4_000), heaven: levels(6_000, 8_000) },
      redraw: { normal: [{ to: "heaven", share: levels(2_500, 5_000) }, { to: "normal", share: levels(7_500, 5_000) }] },
      ceilingRedraw: { normal: [{ to: "heaven", share: levels(10_000, 10_000) }] },
    },
  }
}

describe("the 解析値 form", () => {
  test("a stored world read back into the form comes out as the same world", () => {
    expect(readWorldForm(worldFormOf(madeUp))).toEqual({ ok: true, value: { spec: madeUp, conditions: { payoutRate: { type: "from-spec" } } } })
  })

  test("a chance reads as one in so many, with or without its 1/, or as a percentage", () => {
    const form = {
      settingLevels: [1, 6],
      bet: "3",
      rows: [{ key: "big", label: "BIG", kind: "bonus" as const, of: "", trials: "", payout: "２５２", chances: { "1": "1/273.1", "6": "２５５" }, chanceKind: "combined" as const, ceiling: "", resetCeiling: "", atCeiling: "", resetAllotment: {}, success: {}, misses: "", net: "", unitCeiling: "", resetUnitCeiling: "", atUnitCeiling: "", trigger: "cz" as const, bonusShares: {}, bonusMiss: "counted" as const, forcedCz: "drawn" as const, ceilingAt: "outright" as const, ceilingPayout: "", ceilingAcrossBonuses: "", gates: [], redraw: {}, ceilingRedraw: {}, triggerChances: {}, directBonuses: {}, expiryGames: "", expiryTo: "", sinceAtCeiling: "", resetSinceAtCeiling: "", meterFull: "", meterGains: [], endings: [], endingAllotment: {}, law: EMPTY_LAW }],
      base: "",
      lcdRate: "",
      unitName: "",
      unitGames: "",
      cap: "",
    }
    const read = readWorldForm(form)
    expect(read.ok && read.value.spec.components.chance?.["big"]).toEqual([
      { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 27_310 } },
      { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 25_500 } },
    ])
    const percent = readWorldForm({ ...form, rows: [{ ...form.rows[0]!, chances: { "1": "16%", "6": "16.67%" } }] })
    expect(percent.ok && percent.value.spec.components.chance?.["big"]?.map((each) => each.value)).toEqual([
      { type: "percent", basisPoints: 1_600 },
      { type: "percent", basisPoints: 1_667 },
    ])
  })

  test("what is missing is named by the row and the setting level", () => {
    const read = readWorldForm({ ...STARTING_WORLD, settingLevels: [1, 6] })
    expect(read.ok).toBe(false)
    expect(!read.ok && read.error.slice(0, 3)).toEqual([
      { field: "BIG 枚数", reason: "required" },
      { field: "BIG 設定1", reason: "required" },
      { field: "BIG 設定6", reason: "required" },
    ])
  })

  test("a bonus split into parts takes its chance from them, and a part must belong to a bonus", () => {
    const parted = worldFormOf(madeUp)
    expect(parted.rows.find((row) => row.key === "reg")?.chances).toEqual({})
    const astray = { ...parted, rows: parted.rows.map((row) => (row.key === "reg-solo" ? { ...row, of: "grape" } : row)) }
    const read = readWorldForm(astray)
    expect(!read.ok && read.error).toContainEqual({ field: "単独REG どのボーナスの内訳か", reason: "required" })
  })

  test("a watch over a bonus and its cue come back as the same world, and a cue must belong to a watch", () => {
    const watched: SpecDto = {
      ...madeUp,
      entities: [...madeUp.entities, "big-games", "big-suika"],
      components: {
        ...madeUp.components,
        label: { ...madeUp.components.label, "big-games": "BIG中", "big-suika": "BIG中スイカ" },
        chance: {
          ...madeUp.components.chance,
          "big-suika": [
            { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 4_290 } },
            { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 2_800 } },
          ],
        },
        watch: { "big-games": "big" },
        trials: { "big-games": 20 },
        cue: { "big-suika": "big-games" },
      },
    }
    expect(readWorldForm(worldFormOf(watched))).toEqual({ ok: true, value: { spec: watched, conditions: { payoutRate: { type: "from-spec" } } } })
    const astray = worldFormOf(watched)
    const read = readWorldForm({ ...astray, rows: astray.rows.map((row) => (row.key === "big-suika" ? { ...row, of: "big" } : row)) })
    expect(!read.ok && read.error).toContainEqual({ field: "BIG中スイカ どの場面の示唆か", reason: "required" })
  })

  test("a new row's key is one no row has, and stays however the row is relabelled", () => {
    const rows = [...STARTING_WORLD.rows, { ...newRow(STARTING_WORLD.rows, "role"), label: "ベル" }]
    expect(rows.at(-1)?.key).toBe("e6")
    expect(freshKey([...rows, { ...rows[0]!, key: "e7" }, { ...rows[0]!, key: "e8" }])).toBe("e9")
  })
})

describe("a formula typed in by hand", () => {
  test("is a world of its bonuses with each setting level's 機械割 measured, payouts optional", () => {
    const form = {
      world: {
        ...STARTING_MANUAL.world,
        settingLevels: [1, 6],
        rows: STARTING_MANUAL.world.rows.map((row) => ({ ...row, chances: { "1": "1/273.1", "6": "1/229.1" } })),
      },
      rates: { "1": "97.0", "6": "109.4" },
    }
    const read = readManualForm(form)
    expect(read.ok && read.value.conditions).toEqual({
      payoutRate: { type: "measured", bySettingLevel: [{ settingLevel: 1, value: 9_700 }, { settingLevel: 6, value: 10_940 }] },
    })
    expect(read.ok && read.value.spec.components.payout).toBeUndefined()
    expect(read.ok && manualFormOf(read.value.spec, read.value.conditions).rates).toEqual({ "1": "97", "6": "109.4" })
  })

  test("each setting level needs its 機械割", () => {
    const read = readManualForm({ ...STARTING_MANUAL, world: { ...STARTING_MANUAL.world, settingLevels: [6] } })
    expect(!read.ok && read.error).toContainEqual({ field: "機械割 設定6", reason: "required" })
  })
})

describe("a 設定配分 form", () => {
  test("reads each setting level's share, an empty one as none, summing to exactly 100%", () => {
    const form = { label: " 平日 ", shares: { "1": "60", "2": "30", "4": "", "6": "10%" } }
    expect(readDistributionForm(form, [1, 2, 4, 6])).toEqual({
      ok: true,
      value: {
        label: "平日",
        shares: [
          { settingLevel: 1, basisPoints: 6_000 },
          { settingLevel: 2, basisPoints: 3_000 },
          { settingLevel: 4, basisPoints: 0 },
          { settingLevel: 6, basisPoints: 1_000 },
        ],
      },
    })
  })

  test("says what the shares come to when they are not 100%", () => {
    const form = { label: "平日", shares: { "1": "60", "6": "33.33" } }
    expect(sharesTotal(form, [1, 6])).toBe(9_333)
    expect(readDistributionForm(form, [1, 6])).toEqual({ ok: false, error: [{ field: "合計", reason: "not-whole" }] })
    expect(readDistributionForm({ label: "", shares: {} }, [1])).toEqual({ ok: false, error: [{ field: "名前", reason: "required" }] })
  })
})

describe("an AT machine typed in by hand", () => {
  const measured = {
    payoutRate: {
      type: "measured" as const,
      bySettingLevel: [
        { settingLevel: 1, value: 9_700 },
        { settingLevel: 6, value: 11_000 },
      ],
    },
  }

  test("a stored AT machine read back into the form comes out as the same world", () => {
    const madeUp = atSpec as SpecDto
    expect(readManualForm(manualFormOf(madeUp, measured))).toEqual({ ok: true, value: { spec: madeUp, conditions: measured } })
  })

  test("ceilings in games and in another unit read back the same, a spec counting its ceilings in the unit is typed again in it, and a unit of no games is refused", () => {
    const at = atSpec as SpecDto
    const { ceiling: _, resetCeiling: __, ...components } = at.components
    const counted: SpecDto = { ...at, components: { ...components, ceiling: { at: 900 }, unitCeiling: { at: 30 }, resetUnitCeiling: { at: 20 } }, resources: { ...at.resources, ceilingUnit: { name: "周期", perGame: 1 / 32 } } }
    const form = manualFormOf(counted, measured)
    expect([form.world.unitName, form.world.unitGames]).toEqual(["周期", "32"])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: counted, conditions: measured } })
    const written: SpecDto = { ...at, resources: { ...at.resources, ceilingUnit: { name: "周期", perGame: 1 / 32 } } }
    const typed = manualFormOf(written, measured).world.rows.find((row) => row.kind === "at")
    expect([typed?.ceiling, typed?.resetCeiling, typed?.unitCeiling, typed?.resetUnitCeiling]).toEqual(["", "", "1000", "600"])
    const read = readManualForm({ ...form, world: { ...form.world, unitGames: "0" } })
    expect(!read.ok && read.error).toEqual([{ field: "1周期あたりのG数", reason: "out-of-range" }])
  })

  test("an AT machine of modes read back into the form comes out as the same world", () => {
    const madeUp = modesSpec as SpecDto
    const form = manualFormOf(madeUp, measured)
    expect(hasModes(form.world)).toBe(true)
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: madeUp, conditions: measured } })
  })

  test("an AT's endings and each mode's 振り分け after them read back the same, an ending is named and shared, and a mode left empty after one is left out", () => {
    const modes = modesSpec as SpecDto
    const levels = (low: number, high: number) => [
      { settingLevel: 1, value: low },
      { settingLevel: 6, value: high },
    ]
    const ended: SpecDto = {
      ...modes,
      entities: ["at", "through", "rest", "heaven", "normal"],
      components: {
        ...modes.components,
        label: { ...modes.components.label, through: "駆け抜け", rest: "それ以外" },
        ending: { through: levels(3_000, 4_000), rest: levels(7_000, 6_000) },
        endingAllotment: { heaven: { through: levels(1_000, 2_000) }, normal: { through: levels(9_000, 8_000) } },
      },
    }
    const form = manualFormOf(ended, measured)
    expect(form.world.rows.map((row) => row.key)).toEqual(["at", "heaven", "normal"])
    expect(form.world.rows.find((row) => row.kind === "at")?.endings.map((ending) => [ending.key, ending.label, ending.shares])).toEqual([
      ["through", "駆け抜け", { "1": "30", "6": "40" }],
      ["rest", "それ以外", { "1": "70", "6": "60" }],
    ])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: ended, conditions: measured } })
    expect(freshKey(form.world.rows)).toBe("e6")
    const unnamed = form.world.rows.map((row) => (row.kind === "at" ? { ...row, endings: row.endings.map((ending, index) => (index === 0 ? { ...ending, label: "", shares: { "1": "30" } } : ending)) } : row))
    const refused = readManualForm({ ...form, world: { ...form.world, rows: unnamed } })
    expect(!refused.ok && refused.error).toEqual([
      { field: "ATの終わり方1 名前", reason: "required" },
      { field: "ATの終わり方1 割合 設定6", reason: "required" },
    ])
    const plain = form.world.rows.map((row) => (row.key === "heaven" || row.key === "normal" ? { ...row, endingAllotment: {} } : row))
    const read = readManualForm({ ...form, world: { ...form.world, rows: plain } })
    expect(read.ok && read.value.spec.components.endingAllotment).toBeUndefined()
    expect(read.ok && read.value.spec.components.ending).toEqual(ended.components.ending)
    const withoutModes = { ...form.world, rows: form.world.rows.filter((row) => row.kind === "at") }
    const bare = readManualForm({ ...form, world: withoutModes })
    expect(bare.ok && [bare.value.spec.entities, bare.value.spec.components.ending]).toEqual([["at"], undefined])
  })

  test("a mode's 振り分け after an AT may be left empty where every mode is allotted after every ending", () => {
    const modes = modesSpec as SpecDto
    const levels = (low: number, high: number) => [
      { settingLevel: 1, value: low },
      { settingLevel: 6, value: high },
    ]
    const { allotment: _, ...components } = modes.components
    const ended: SpecDto = {
      ...modes,
      entities: ["at", "through", "rest", "heaven", "normal"],
      components: {
        ...components,
        label: { ...modes.components.label, through: "駆け抜け", rest: "それ以外" },
        ending: { through: levels(3_000, 4_000), rest: levels(7_000, 6_000) },
        endingAllotment: { heaven: { through: levels(1_000, 2_000), rest: levels(3_000, 5_000) }, normal: { through: levels(9_000, 8_000), rest: levels(7_000, 5_000) } },
      },
    }
    const form = manualFormOf(ended, measured)
    expect(everyEndingAllotted(form.world)).toBe(true)
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: ended, conditions: measured } })
    const partly = form.world.rows.map((row) => (row.key === "heaven" ? { ...row, endingAllotment: { through: row.endingAllotment.through ?? {} } } : row))
    expect(everyEndingAllotted({ ...form.world, rows: partly })).toBe(false)
    const refused = readManualForm({ ...form, world: { ...form.world, rows: partly } })
    expect(!refused.ok && refused.error.some((problem) => problem.field.endsWith("振り分け 設定1") && problem.reason === "required")).toBe(true)
  })

  test("a capped machine in sets read back into the form comes out as the same world", () => {
    const madeUp = capSpec as SpecDto
    const form = manualFormOf(madeUp, measured)
    const at = form.world.rows.find((row) => row.kind === "at")
    expect(at?.law.shape).toBe("sets")
    expect(form.world.cap).toBe("2400")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: madeUp, conditions: measured } })
  })

  test("a table of medals reads row by row, each level's share asked for, and a 継続率 stays below 100%", () => {
    const form = manualFormOf(capSpec as SpecDto, measured)
    const tabled = form.world.rows.map((row) =>
      row.kind === "at"
        ? {
            ...row,
            law: { ...row.law, shape: "table" as const, rows: [{ medals: "300", shares: { "1": "60", "6": "50" } }, { medals: "1000", shares: { "1": "40" } }] },
          }
        : row,
    )
    const read = readManualForm({ ...form, world: { ...form.world, rows: tabled } })
    expect(!read.ok && read.error).toEqual([{ field: "AT 表2行目 設定6", reason: "required" }])
    const endless = form.world.rows.map((row) => (row.kind === "at" ? { ...row, law: { ...row.law, continuationRate: { "1": "80", "6": "100" } } } : row))
    const refused = readManualForm({ ...form, world: { ...form.world, rows: endless } })
    expect(!refused.ok && refused.error).toEqual([{ field: "AT 継続率 設定6", reason: "out-of-range" }])
  })

  test("a CZ machine read back into the form comes out as the same world, its AT's ceiling the AT間天井", () => {
    const madeUp = czSpec as SpecDto
    const form = manualFormOf(madeUp, measured)
    expect(hasCz(form.world)).toBe(true)
    expect(form.world.rows.find((row) => row.kind === "at")?.ceiling).toBe("1000")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: madeUp, conditions: measured } })
  })

  test("a CZ that is a bonus keeps its medals and its 純増, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const bonus: SpecDto = { ...madeUp, components: { ...madeUp.components, payout: { ...madeUp.components.payout, cz: 100 }, netPerGame: { cz: 5 } } }
    const form = manualFormOf(bonus, measured)
    const row = form.world.rows.find((each) => each.kind === "cz")
    expect([row?.payout, row?.net]).toEqual(["100", "5"])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: bonus, conditions: measured } })
  })

  test("a CZ marked a bonus keeps its mark, its medals unknown, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const marked: SpecDto = { ...madeUp, components: { ...madeUp.components, bonus: ["cz"] } }
    const form = manualFormOf(marked, measured)
    expect(form.world.rows.find((row) => row.kind === "cz")?.trigger).toBe("bonus")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: marked, conditions: measured } })
  })

  test("a CZ whose success brings a bonus keeps the bonus's AT share and reads back the same; left empty, the bonus wins it every time", () => {
    const madeUp = czSpec as SpecDto
    const shares = [
      { settingLevel: 1, value: 5_000 },
      { settingLevel: 6, value: 6_000 },
    ]
    const staged: SpecDto = { ...madeUp, components: { ...madeUp.components, payout: { ...madeUp.components.payout, cz: 112 }, netPerGame: { cz: 2.5 }, bonusShare: { cz: shares } } }
    const form = manualFormOf(staged, measured)
    const row = form.world.rows.find((each) => each.kind === "cz")
    expect([row?.trigger, row?.bonusShares]).toEqual(["cz-then-bonus", { "1": "50", "6": "60" }])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: staged, conditions: measured } })
    const emptied = { ...form, world: { ...form.world, rows: form.world.rows.map((each) => (each.kind === "cz" ? { ...each, bonusShares: {} } : each)) } }
    const read = readManualForm(emptied)
    expect(read.ok && read.value.spec.components.bonusShare).toEqual({
      cz: [
        { settingLevel: 1, value: 10_000 },
        { settingLevel: 6, value: 10_000 },
      ],
    })
  })

  test("a CZ's zones read back the same, the AT's share left out where none is typed, and a zone without its game is refused", () => {
    const madeUp = czSpec as SpecDto
    const trigger = [
      { settingLevel: 1, value: 4_000 },
      { settingLevel: 6, value: 6_600 },
    ]
    const at = [
      { settingLevel: 1, value: 0 },
      { settingLevel: 6, value: 500 },
    ]
    const zoned: SpecDto = { ...madeUp, components: { ...madeUp.components, gates: { cz: [{ game: 100, trigger, at }, { game: 300, span: 66, trigger }] } } }
    const form = manualFormOf(zoned, measured)
    const row = form.world.rows.find((each) => each.kind === "cz")
    expect(row?.gates).toEqual([
      { game: "100", span: "", trigger: { "1": "40", "6": "66" }, at: { "1": "0", "6": "5" } },
      { game: "300", span: "66", trigger: { "1": "40", "6": "66" }, at: {} },
    ])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: zoned, conditions: measured } })
    const unplaced = { ...form, world: { ...form.world, rows: form.world.rows.map((each) => (each.kind === "cz" ? { ...each, gates: [{ ...EMPTY_GATE, trigger: { "1": "10", "6": "10" } }] } : each)) } }
    const read = readManualForm(unplaced)
    expect(!read.ok && read.error).toEqual([{ field: "CZ ゾーン ゲーム数", reason: "required" }])
  })

  test("a CZ's meter its failures fill reads back the same, and a gain with no points is refused", () => {
    const madeUp = czSpec as SpecDto
    const share = [
      { settingLevel: 1, value: 3_000 },
      { settingLevel: 6, value: 4_000 },
    ]
    const metered: SpecDto = { ...madeUp, components: { ...madeUp.components, meter: { cz: { full: 10, gains: [{ points: 1, share }, { points: 3, share }] } } } }
    const form = manualFormOf(metered, measured)
    const row = form.world.rows.find((each) => each.kind === "cz")
    expect([row?.meterFull, row?.meterGains]).toEqual(["10", [{ points: "1", shares: { "1": "30", "6": "40" } }, { points: "3", shares: { "1": "30", "6": "40" } }]])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: metered, conditions: measured } })
    const pointless = { ...form, world: { ...form.world, rows: form.world.rows.map((each) => (each.kind === "cz" ? { ...each, meterGains: [{ points: "", shares: { "1": "10", "6": "10" } }] } : each)) } }
    const read = readManualForm(pointless)
    expect(!read.ok && read.error).toEqual([{ field: "CZ メーター 1つ目 pt", reason: "required" }])
  })

  test("a CZ whose bonus restarts play, its ceiling from the AT a sure one, reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const shares = [
      { settingLevel: 1, value: 5_000 },
      { settingLevel: 6, value: 6_000 },
    ]
    const restarting: SpecDto = {
      ...madeUp,
      components: { ...madeUp.components, bonusShare: { cz: shares }, sinceAtCeiling: { cz: 1_500 }, restart: ["cz"], ceilingWins: ["cz"] },
    }
    const form = manualFormOf(restarting, measured)
    const row = form.world.rows.find((each) => each.kind === "cz")
    expect([row?.bonusMiss, row?.forcedCz]).toEqual(["restarts", "wins"])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: restarting, conditions: measured } })
  })

  test("an AT間天井 counted from the AT across bonuses reads back the same, and goes with the bonus that restarts play", () => {
    const madeUp = czSpec as SpecDto
    const shares = [
      { settingLevel: 1, value: 5_000 },
      { settingLevel: 6, value: 6_000 },
    ]
    const across: SpecDto = {
      ...madeUp,
      components: { ...madeUp.components, bonusShare: { cz: shares }, restart: ["cz"], ceilingAcrossBonuses: { at: 1_600 } },
    }
    const form = manualFormOf(across, measured)
    expect(form.world.rows.find((each) => each.kind === "at")?.ceilingAcrossBonuses).toBe("1600")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: across, conditions: measured } })
    const counted = { ...form, world: { ...form.world, rows: form.world.rows.map((each) => (each.kind === "cz" ? { ...each, bonusMiss: "counted" as const } : each)) } }
    const read = readManualForm(counted)
    expect(read.ok && read.value.spec.components.ceilingAcrossBonuses).toBeUndefined()
    const mistyped = { ...form, world: { ...form.world, rows: form.world.rows.map((each) => (each.kind === "at" ? { ...each, ceilingAcrossBonuses: "千六百" } : each)) } }
    const refused = readManualForm(mistyped)
    expect(!refused.ok && refused.error).toEqual([{ field: "AT ATから数えるAT間天井", reason: "not-a-number" }])
  })

  test("a mode's own CZ chance and the mode play leaves to after so many games read back the same", () => {
    const chained = chainedModes()
    const streak: SpecDto = {
      ...chained,
      components: {
        ...chained.components,
        triggerChance: {
          heaven: [
            { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 1_970 } },
            { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 1_500 } },
          ],
        },
        expiry: { heaven: { games: 20, to: "normal" } },
      },
    }
    const form = manualFormOf(streak, measured)
    const heaven = form.world.rows.find((each) => each.key === "heaven")
    expect([heaven?.triggerChances, heaven?.expiryGames, heaven?.expiryTo]).toEqual([{ "1": "1/19.7", "6": "1/15" }, "20", "normal"])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: streak, conditions: measured } })
    const nowhere = { ...form, world: { ...form.world, rows: form.world.rows.map((each) => (each.key === "heaven" ? { ...each, expiryTo: "" } : each)) } }
    const read = readManualForm(nowhere)
    expect(!read.ok && read.error).toEqual([{ field: "天国 抜けた先のモード", reason: "required" }])
  })

  test("a mode's own CZ success and where a failed CZ moves play read back the same", () => {
    const chained = chainedModes()
    const form = manualFormOf(chained, measured)
    const normal = form.world.rows.find((each) => each.key === "normal")
    expect(normal?.redraw).toEqual({ heaven: { "1": "25", "6": "50" }, normal: { "1": "75", "6": "50" } })
    expect(normal?.ceilingRedraw).toEqual({ heaven: { "1": "100", "6": "100" } })
    expect(form.world.rows.find((each) => each.key === "heaven")?.success).toEqual({ "1": "60", "6": "80" })
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: chained, conditions: measured } })
  })

  test("an AT a CZ brings keeps its chance of being won outright, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const direct: SpecDto = {
      ...madeUp,
      components: {
        ...madeUp.components,
        direct: {
          at: [
            { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 200_000 } },
            { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 150_000 } },
          ],
        },
      },
    }
    const form = manualFormOf(direct, measured)
    expect(form.world.rows.find((row) => row.kind === "at")?.chances).toEqual({ "1": "1/2000", "6": "1/1500" })
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: direct, conditions: measured } })
  })

  test("an AT whose CZ brings a bonus keeps its chance of that bonus outright, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const staged: SpecDto = {
      ...madeUp,
      components: {
        ...madeUp.components,
        payout: { ...madeUp.components.payout, cz: 200 },
        bonusShare: {
          cz: [
            { settingLevel: 1, value: 5000 },
            { settingLevel: 6, value: 5000 },
          ],
        },
        directBonus: {
          at: [
            { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 100_000 } },
            { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 80_000 } },
          ],
        },
      },
    }
    const form = manualFormOf(staged, measured)
    expect(form.world.rows.find((row) => row.kind === "at")?.directBonuses).toEqual({ "1": "1/1000", "6": "1/800" })
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: staged, conditions: measured } })
    const plain = { ...form, world: { ...form.world, rows: form.world.rows.map((row) => (row.kind === "cz" ? { ...row, trigger: "cz" as const } : row)) } }
    const read = readManualForm(plain)
    expect(read.ok && read.value.spec.components.directBonus).toBe(undefined)
  })

  test("a side bonus keeps its chance as published or below its ceiling, its ceiling and its medals, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const levels = [
      { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 25_000 } as const },
      { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 20_000 } as const },
    ]
    const published: SpecDto = {
      ...madeUp,
      entities: [...madeUp.entities, "fran"],
      components: {
        ...madeUp.components,
        label: { ...madeUp.components.label, fran: "フランボーナス" },
        sideBonus: ["fran"],
        firstHit: { ...madeUp.components.firstHit, fran: levels },
        ceiling: { ...madeUp.components.ceiling, fran: 300 },
        payout: { ...madeUp.components.payout, fran: 100 },
        netPerGame: { fran: 4 },
      },
    }
    const form = manualFormOf(published, measured)
    const side = form.world.rows.find((row) => row.kind === "side")
    expect([side?.chanceKind, side?.chances, side?.ceiling, side?.payout, side?.net]).toEqual(["combined", { "1": "1/250", "6": "1/200" }, "300", "100", "4"])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: published, conditions: measured } })
    const { fran: _, ...firstHit } = published.components.firstHit ?? {}
    const below: SpecDto = { ...published, components: { ...published.components, firstHit, chance: { fran: levels } } }
    const typed = manualFormOf(below, measured)
    expect(typed.world.rows.find((row) => row.kind === "side")?.chanceKind).toBe("below")
    expect(readManualForm(typed)).toEqual({ ok: true, value: { spec: below, conditions: measured } })
    const unpaid = { ...form, world: { ...form.world, rows: form.world.rows.map((row) => (row.kind === "side" ? { ...row, payout: "" } : row)) } }
    expect(readManualForm(unpaid).ok).toBe(false)
  })

  test("a CZ's chance given below its ceilings is kept as such, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const { firstHit, ...rest } = madeUp.components
    const below: SpecDto = { ...madeUp, components: { ...rest, chance: { cz: firstHit?.["cz"] ?? [] } } }
    const form = manualFormOf(below, measured)
    const cz = form.world.rows.find((row) => row.kind === "cz")
    expect([cz?.chanceKind, cz?.chances]).toEqual(["below", { "1": "1/150", "6": "1/120" }])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: below, conditions: measured } })
    const back = manualFormOf(madeUp, measured)
    expect(back.world.rows.find((row) => row.kind === "cz")?.chanceKind).toBe("combined")
    expect(readManualForm(back)).toEqual({ ok: true, value: { spec: madeUp, conditions: measured } })
  })

  test("a CZ keeps its ceiling counted from the AT, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const forced: SpecDto = { ...madeUp, components: { ...madeUp.components, sinceAtCeiling: { cz: 800 } } }
    const form = manualFormOf(forced, measured)
    expect(form.world.rows.find((row) => row.kind === "cz")?.sinceAtCeiling).toBe("800")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: forced, conditions: measured } })
  })

  test("a CZ keeps its ceiling counted from the AT after a setting change, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const shortened: SpecDto = { ...madeUp, components: { ...madeUp.components, sinceAtCeiling: { cz: 979 }, resetSinceAtCeiling: { cz: 579 } } }
    const form = manualFormOf(shortened, measured)
    expect(form.world.rows.find((row) => row.kind === "cz")?.resetSinceAtCeiling).toBe("579")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: shortened, conditions: measured } })
    const mistyped = { ...form, world: { ...form.world, rows: form.world.rows.map((row) => (row.kind === "cz" ? { ...row, resetSinceAtCeiling: "x" } : row)) } }
    const read = readManualForm(mistyped)
    expect(!read.ok && read.error).toEqual([{ field: "CZ リセット後のATから数える天井", reason: "not-a-number" }])
  })

  test("an AT whose AT間天井 brings the CZ keeps it, reads back the same, and lets it go with the AT間天井", () => {
    const madeUp = czSpec as SpecDto
    const triggered: SpecDto = { ...madeUp, components: { ...madeUp.components, ceilingTriggers: ["at"] } }
    const form = manualFormOf(triggered, measured)
    expect(form.world.rows.find((row) => row.kind === "at")?.ceilingAt).toBe("triggered")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: triggered, conditions: measured } })
    expect(manualFormOf(madeUp, measured).world.rows.find((row) => row.kind === "at")?.ceilingAt).toBe("outright")
    const unceiled = { ...form, world: { ...form.world, rows: form.world.rows.map((row) => (row.kind === "at" ? { ...row, ceiling: "", resetCeiling: "" } : row)) } }
    const read = readManualForm(unceiled)
    expect(read.ok && read.value.spec.components.ceilingTriggers).toBeUndefined()
  })

  test("a bonus the AT間天井 brings keeps its own medals, reads back the same, and lets them go with the ceiling's trigger", () => {
    const madeUp = czSpec as SpecDto
    const paying: SpecDto = { ...madeUp, components: { ...madeUp.components, bonus: ["cz"], payout: { ...madeUp.components.payout, cz: 85 }, ceilingTriggers: ["at"], ceilingPayout: { at: 100 } } }
    const form = manualFormOf(paying, measured)
    expect(form.world.rows.find((row) => row.kind === "at")?.ceilingPayout).toBe("100")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: paying, conditions: measured } })
    const outright = { ...form, world: { ...form.world, rows: form.world.rows.map((row) => (row.kind === "at" ? { ...row, ceilingAt: "outright" as const } : row)) } }
    const read = readManualForm(outright)
    expect(read.ok && read.value.spec.components.ceilingPayout).toBeUndefined()
  })

  test("a mode of a CZ machine keeps a ceiling counted from the AT of its own, which makes the CZ's sure one, and the CZ's after a setting change is the modes'", () => {
    const madeUp = czSpec as SpecDto
    const { ceiling, resetCeiling, ...rest } = madeUp.components
    const share = (points: number) => [1, 6].map((settingLevel) => ({ settingLevel, value: points }))
    const moded: SpecDto = {
      ...madeUp,
      entities: [...madeUp.entities, "normal", "reset"],
      components: {
        ...rest,
        ceiling: { at: ceiling?.["at"] ?? 1000, normal: 600, reset: 600 },
        label: { ...rest.label, normal: "通常", reset: "リセット" },
        mode: ["normal", "reset"],
        allotment: { normal: share(10_000), reset: share(0) },
        resetAllotment: { normal: share(0), reset: share(10_000) },
        sinceAtCeiling: { reset: 579 },
        ceilingWins: ["cz"],
      },
    }
    const form = manualFormOf(moded, measured)
    expect(form.world.rows.find((row) => row.key === "reset")?.sinceAtCeiling).toBe("579")
    expect(form.world.rows.find((row) => row.kind === "cz")?.forcedCz).toBe("wins")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: moded, conditions: measured } })
    const typedOnCz = { ...form, world: { ...form.world, rows: form.world.rows.map((row) => (row.kind === "cz" ? { ...row, resetSinceAtCeiling: "400" } : row)) } }
    const read = readManualForm(typedOnCz)
    expect(read.ok && read.value.spec.components.resetSinceAtCeiling).toBeUndefined()
    expect(resetCeiling?.["cz"]).toBe(300)
  })

  test("a mode of a CZ machine keeps a スルー天井 of its own, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const { ceiling, resetCeiling, ...rest } = madeUp.components
    const share = (points: number) => [1, 6].map((settingLevel) => ({ settingLevel, value: points }))
    const drawn: SpecDto = {
      ...madeUp,
      entities: [...madeUp.entities, "m2", "m6"],
      components: {
        ...rest,
        ceiling: { at: ceiling?.["at"] ?? 1000, m2: 600, m6: 600 },
        label: { ...rest.label, m2: "スルー2回", m6: "スルー6回" },
        mode: ["m2", "m6"],
        misses: { cz: 3, m2: 2, m6: 6 },
        allotment: { m2: share(5000), m6: share(5000) },
      },
    }
    const form = manualFormOf(drawn, measured)
    expect(form.world.rows.find((row) => row.key === "m2")?.misses).toBe("2")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: drawn, conditions: measured } })
    expect(resetCeiling?.["cz"]).toBe(300)
  })

  test("an AT machine's small win is its chance alone, to be counted, and reads back the same", () => {
    const madeUp = czSpec as SpecDto
    const belled: SpecDto = {
      ...madeUp,
      entities: [...madeUp.entities, "bell"],
      components: {
        ...madeUp.components,
        label: { ...madeUp.components.label, bell: "共通ベル" },
        chance: {
          ...madeUp.components.chance,
          bell: [
            { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 730 } },
            { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 690 } },
          ],
        },
      },
    }
    const form = manualFormOf(belled, measured)
    expect(form.world.rows.find((row) => row.label === "共通ベル")?.kind).toBe("role")
    const read = readManualForm(form)
    expect(read).toEqual({ ok: true, value: { spec: belled, conditions: measured } })
    expect(read.ok && read.value.spec.components.payout?.["bell"]).toBeUndefined()
  })

  test("a CZ machine's AT takes an AT間天井 after a setting change, and reads back the same", () => {
    const shortened = { ...(czSpec as SpecDto), components: { ...(czSpec as SpecDto).components, resetCeiling: { ...(czSpec as SpecDto).components.resetCeiling, at: 630 } } }
    const form = manualFormOf(shortened, measured)
    expect(form.world.rows.find((row) => row.kind === "at")?.resetCeiling).toBe("630")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: shortened, conditions: measured } })
  })

  test("a CZ machine's mode takes an AT間天井 of its own, and reads back the same", () => {
    const { resetCeiling: _, ...components } = (czSpec as SpecDto).components
    const shares = (low: number, high: number) => [
      { settingLevel: 1, value: low },
      { settingLevel: 6, value: high },
    ]
    const drawn: SpecDto = {
      ...(czSpec as SpecDto),
      entities: [...(czSpec as SpecDto).entities, "short", "long"],
      components: {
        ...components,
        label: { ...components.label, short: "450G", long: "999G" },
        ceiling: { at: 999 },
        mode: ["short", "long"],
        allotment: { short: shares(4_000, 5_000), long: shares(6_000, 5_000) },
        atCeiling: { short: 450 },
      },
    }
    const form = manualFormOf(drawn, measured)
    expect(form.world.rows.find((row) => row.key === "short")?.atCeiling).toBe("450")
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: drawn, conditions: measured } })
  })

  test("a CZ asks for its 合算 and success rate setting by setting, and its スルー天井 is a whole count", () => {
    const form = manualFormOf(czSpec as SpecDto, measured)
    const rows = form.world.rows.map((row) => (row.kind === "cz" ? { ...row, success: { "1": "30" }, misses: "2.5" } : row))
    const read = readManualForm({ ...form, world: { ...form.world, rows } })
    expect(!read.ok && read.error).toEqual([
      { field: "CZ スルー天井", reason: "out-of-range" },
      { field: "CZ 成功率 設定6", reason: "required" },
    ])
  })

  test("a mode's 振り分け is asked for setting by setting, and its reset one may be left out whole", () => {
    const form = manualFormOf(modesSpec as SpecDto, measured)
    const rows = form.world.rows.map((row) => (row.key === "heaven" ? { ...row, chances: { "1": "30" }, resetAllotment: {} } : row))
    const read = readManualForm({ ...form, world: { ...form.world, rows } })
    expect(!read.ok && read.error).toEqual([{ field: "天国 振り分け 設定6", reason: "required" }])
  })

  test("an AT whose medals follow from the 機械割 states it in its world beside its 純増, and reads back the same", () => {
    const stated = rateSpec as SpecDto
    const form = manualFormOf(stated, { payoutRate: { type: "from-spec" } })
    expect(form.rates).toEqual({ "1": "97.5", "6": "110" })
    expect(form.world.rows[0]?.law).toMatchObject({ shape: "rate", net: "4" })
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: stated, conditions: { payoutRate: { type: "from-spec" } } } })
    const [at] = form.world.rows
    const bare = readManualForm({ ...form, world: { ...form.world, rows: [{ ...at!, law: { ...at!.law, net: "0" } }] } })
    expect(!bare.ok && bare.error).toEqual([{ field: "AT 純増", reason: "out-of-range" }])
  })

  test("an AT with medals won at another 純増 states each with its share, and reads back the same", () => {
    const stated = rateSpec as SpecDto
    const shared: SpecDto = { ...stated, components: { ...stated.components, otherNet: { at: [{ net: 8, shareBasisPoints: 2550 }] } } }
    const form = manualFormOf(shared, { payoutRate: { type: "from-spec" } })
    expect(form.world.rows[0]?.law.otherNets).toEqual([{ net: "8", share: "25.5" }])
    expect(readManualForm(form)).toEqual({ ok: true, value: { spec: shared, conditions: { payoutRate: { type: "from-spec" } } } })
    const [at] = form.world.rows
    const bare = readManualForm({ ...form, world: { ...form.world, rows: [{ ...at!, law: { ...at!.law, otherNets: [{ net: "0", share: "" }] } }] } })
    expect(!bare.ok && bare.error).toEqual([
      { field: "AT 別の純増1", reason: "out-of-range" },
      { field: "AT 別の純増1 割合", reason: "required" },
    ])
  })

  test("starts with its AT, and asks for its ベース, its payout and a whole ceiling", () => {
    expect(isAtMachine(STARTING_AT_MANUAL.world)).toBe(true)
    const [at] = STARTING_AT_MANUAL.world.rows
    const form = {
      ...STARTING_AT_MANUAL,
      world: { ...STARTING_AT_MANUAL.world, settingLevels: [1], rows: [{ ...at!, chances: { "1": "1/500" }, ceiling: "999.5" }] },
      rates: { "1": "97" },
    }
    const read = readManualForm(form)
    expect(!read.ok && read.error).toEqual([
      { field: "ベース", reason: "required" },
      { field: "AT 枚数", reason: "required" },
      { field: "AT 天井", reason: "out-of-range" },
    ])
  })
})
