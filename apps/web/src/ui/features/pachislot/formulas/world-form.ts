import type { BySettingLevelDto, ConditionsDto, GateDto, MeterDto, OtherNetDto, SpecDto, PayoutRowDto, ProbabilityDto, RedrawDto } from "@p-lens/contracts/pachislot"
import { SPEC_VERSION } from "@p-lens/contracts/pachislot"

import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/** A field that could not be read, named as the form names it. */
export interface FormProblem {
  readonly field: string
  readonly reason: "required" | "not-a-number" | "too-fine" | "out-of-range" | "no-bonus" | "not-whole"
}

type Read<T> = Result<T, FormProblem>

/** Every setting level a machine may have. */
export const ALL_SETTING_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6]

/** What a row of the 解析値 is. */
export type EntityKindName = "bonus" | "part" | "role" | "replay" | "at" | "cz" | "mode" | "watch" | "cue" | "side"

/**
 * One entity of the world as typed: a bonus, a part of one, a small win, a
 * replay, an AT or a CZ, with its chance under each setting level — an AT's
 * or a CZ's being its 初当たり as published, ceilings included; an AT a CZ
 * brings has none — a mode, whose `chances` are its 振り分け after an AT,
 * in percent, or what a player watches over each of a bonus — a watch, with
 * no chance of its own, and its cues, each with its chance on a trial. Its key is its entity's id, made once when the row is and kept
 * however it is relabelled, so the counts a play files under it stay where
 * they are.
 */
export interface EntityRow {
  readonly key: string
  readonly label: string
  readonly kind: EntityKindName
  /** The key of the row it belongs to: a part's bonus or a watch's, a cue's watch. */
  readonly of: string
  /** A watch's trials each of its bonus gives, as typed: a BIG's games for a スイカ; empty for one. */
  readonly trials: string
  readonly payout: string
  /** Each setting level's chance as typed — `1/273.1`, `273.1`, `16%` — by the level. */
  readonly chances: Readonly<Record<string, string>>
  /** How the chances of a CZ, an AT won directly or a side bonus are typed: as published, ceilings included, or a regular game's below the ceilings. */
  readonly chanceKind: ChanceKind
  /** The trigger's 天井 in regular games — an AT's, a CZ's or a mode's — or an AT's AT間天井 where a CZ brings it, as typed; empty for none. */
  readonly ceiling: string
  /** The trigger's ceiling after a setting change, as typed; empty for the same as ever. */
  readonly resetCeiling: string
  /** A mode's own AT間天井 where a CZ brings the AT, as typed; empty for the AT's. */
  readonly atCeiling: string
  /** Its ceiling counted in the machine's unit — the trigger's, or the AT間天井 on an AT a CZ brings — as typed; empty for none. */
  readonly unitCeiling: string
  /** The same after a setting change, as typed; empty for the same as ever. */
  readonly resetUnitCeiling: string
  /** A mode's own AT間天井 counted in the machine's unit, as typed; empty for the AT's. */
  readonly atUnitCeiling: string
  /** A CZ's chance of winning the AT, in percent by the level. */
  readonly success: Readonly<Record<string, string>>
  /** A CZ's スルー天井 — or a mode's own, where a CZ brings the AT — the misses after which the next CZ wins it, as typed; empty for none. */
  readonly misses: string
  /** A CZ that is a bonus: its 純増, the medals a game of it gains, as typed; empty where its games are not counted. */
  readonly net: string
  /** What a CZ row is: a CZ, a bonus that wins the AT at a share, or a CZ whose success brings a bonus that does. */
  readonly trigger: CzTrigger
  /** Where a CZ's success brings a bonus: how often the bonus wins the AT, in percent by the level; empty for every time. */
  readonly bonusShares: Readonly<Record<string, string>>
  /** Where a CZ's success brings a bonus: what one that misses the AT does — counted as a miss, or starting play again as after an AT. */
  readonly bonusMiss: "counted" | "restarts"
  /** How the CZ a CZ's ceiling counted from the AT forces fares: at the CZ's rate, or certainly succeeding. */
  readonly forcedCz: "drawn" | "wins"
  /** How an AT a CZ brings is won on its AT間天井: outright, or by the CZ or bonus it brings, which certainly wins it and is counted in the 合算. */
  readonly ceilingAt: "outright" | "triggered"
  /** Where an AT's AT間天井 brings a bonus: what that bonus pays, as typed, where it is one of its own; empty for the trigger's medals. */
  readonly ceilingPayout: string
  /** An AT's AT間天井 counted from the last AT across the bonuses that start play again, which none of them starts again, as typed; empty for none. */
  readonly ceilingAcrossBonuses: string
  /** A mode's zones, or a CZ's on a machine without modes, in the order typed. */
  readonly gates: readonly GateForm[]
  /** Where a failed CZ in a mode moves play: each mode by its key, with its share in percent by the level; empty where play stays. */
  readonly redraw: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** Where a failed CZ that came on the mode's ceiling moves play, where that differs: as `redraw`. */
  readonly ceilingRedraw: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** A mode's own CZ chance a game, as typed by the level; empty for the one read back from the 合算. */
  readonly triggerChances: Readonly<Record<string, string>>
  /** An AT a CZ brings, where the CZ's success brings a bonus: how often a game brings that bonus outright, past the CZ, as typed by the level; empty for never. */
  readonly directBonuses: Readonly<Record<string, string>>
  /** The games since the last CZ after which, none come, play leaves the mode, as typed; empty for never. */
  readonly expiryGames: string
  /** The key of the mode play leaves to. */
  readonly expiryTo: string
  /** A CZ's ceiling counted from the last AT, which it comes on once, as typed — or a mode's own in place of the CZ's; empty for none, or for the CZ's. */
  readonly sinceAtCeiling: string
  /** A CZ's ceiling counted from the last AT after a setting change, on a machine without modes, as typed; empty for the same. */
  readonly resetSinceAtCeiling: string
  /** A CZ's meter: the points that fill it, as typed; empty for none. */
  readonly meterFull: string
  /** What a failed CZ adds to its meter, in the order typed. */
  readonly meterGains: readonly MeterGainForm[]
  /** A mode's 振り分け after a setting change, in percent by the level; empty for the same as after an AT. */
  readonly resetAllotment: Readonly<Record<string, string>>
  /** An AT's endings — the ways it ends that its modes are allotted by — in the order typed; empty where it has none. */
  readonly endings: readonly EndingForm[]
  /** A mode's 振り分け after an AT that ended a given way: each ending by its key, in percent by the level; an ending left empty takes the mode's 振り分け after an AT. */
  readonly endingAllotment: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** An AT's medals beyond their average, and its 有利区間. */
  readonly law: AtLawForm
}

/** One way an AT ends, as typed: its key — its entity's id, made once and kept — its name, and its share of ATs in percent by the level. */
export interface EndingForm {
  readonly key: string
  readonly label: string
  readonly shares: Readonly<Record<string, string>>
}

/** A zone as typed: the regular game since the last AT it is on, and the shares of play still going there that it brings the trigger to and wins the AT outright on, in percent by the level — the AT's left empty where there is none. */
export interface GateForm {
  readonly game: string
  /** The games it draws over, as typed; empty for one. */
  readonly span: string
  readonly trigger: Readonly<Record<string, string>>
  readonly at: Readonly<Record<string, string>>
}

/** What a failed CZ adds to its meter, as typed: so many points, at its share of failures in percent by the level. */
export interface MeterGainForm {
  readonly points: string
  readonly shares: Readonly<Record<string, string>>
}

/** A meter gain not yet typed. */
export const EMPTY_METER_GAIN: MeterGainForm = { points: "", shares: {} }

/** How a chance is typed: as published, its ceilings included, or a regular game's below them. */
export type ChanceKind = "combined" | "below"

/** A zone not yet typed. */
export const EMPTY_GATE: GateForm = { game: "", span: "", trigger: {}, at: {} }

/** What brings the AT on a CZ row: the CZ, a bonus in its place, or a CZ whose success brings a bonus before the AT. */
export type CzTrigger = "cz" | "bonus" | "cz-then-bonus"

/** How an AT's medals are given: their average, sets carried on at a 継続率, a table, or the 機械割 they follow from with the AT's 純増. */
export type PayoutShape = "average" | "sets" | "table" | "rate"

/** One row of an AT's table of medals as typed: so many medals, and how often under each level, in percent. */
export interface PayoutRowForm {
  readonly medals: string
  readonly shares: Readonly<Record<string, string>>
}

/** A share of an AT's medals won at another 純増, as typed: the 純増 there, and the share in percent. */
export interface OtherNetForm {
  readonly net: string
  readonly share: string
}

export const EMPTY_OTHER_NET: OtherNetForm = { net: "", share: "" }

/**
 * What an AT gains past its average, as typed: its sets — the first's
 * medals, each further set's and each level's 継続率 in percent — or its
 * table of medals; and the games its 有利区間 carries on after an AT short of
 * the cap, and whether reaching the cap starts play again as after a
 * setting change.
 */
export interface AtLawForm {
  readonly shape: PayoutShape
  readonly first: string
  readonly set: string
  readonly continuationRate: Readonly<Record<string, string>>
  readonly rows: readonly PayoutRowForm[]
  /** 純増 as typed, where the medals follow from the 機械割. */
  readonly net: string
  /** The shares of the AT's medals won at another 純増, as typed. */
  readonly otherNets: readonly OtherNetForm[]
  readonly window: string
  readonly resetOnCap: boolean
}

export const EMPTY_LAW: AtLawForm = { shape: "average", first: "", set: "", continuationRate: {}, rows: [], net: "", otherNets: [], window: "", resetOnCap: false }

/** A row of a table of medals, nothing typed yet. */
export const EMPTY_PAYOUT_ROW: PayoutRowForm = { medals: "", shares: {} }

/** A machine's 解析値 as typed: its setting levels, its bet, its entities, and an AT machine's ベース. */
export interface WorldForm {
  readonly settingLevels: readonly number[]
  readonly bet: string
  readonly rows: readonly EntityRow[]
  /** ベース: regular games fifty medals last, for a machine of an AT. */
  readonly base: string
  /** The screen's games a regular game comes to, where the ceilings are counted on it; empty where they count regular games. */
  readonly lcdRate: string
  /** What the trigger's ceilings are counted in where it is not games — `pt`, `周期` — as typed; empty where they count games. */
  readonly unitName: string
  /** The regular games one of that unit comes to on average, as typed: 32 for a 周期 of 32 games. */
  readonly unitGames: string
  /** 有利区間の上限 in medals; empty where it is not modelled. */
  readonly cap: string
}

/** A formula typed in by hand: its bonuses, and each setting level's 機械割 as measured. */
export interface ManualForm {
  readonly world: WorldForm
  /** Each setting level's 機械割 in percent, as typed, by the level. */
  readonly rates: Readonly<Record<string, string>>
}

const row = (key: string, label: string, kind: EntityKindName, payout = ""): EntityRow => ({
  key,
  label,
  kind,
  of: "",
  trials: "",
  payout,
  chances: {},
  chanceKind: "combined",
  ceiling: "",
  resetCeiling: "",
  atCeiling: "",
  unitCeiling: "",
  resetUnitCeiling: "",
  atUnitCeiling: "",
  resetAllotment: {},
  success: {},
  misses: "",
  net: "",
  trigger: "cz",
  bonusShares: {},
  bonusMiss: "counted",
  forcedCz: "drawn",
  ceilingAt: "outright",
  ceilingPayout: "",
  ceilingAcrossBonuses: "",
  gates: [],
  redraw: {},
  ceilingRedraw: {},
  triggerChances: {},
  directBonuses: {},
  expiryGames: "",
  expiryTo: "",
  sinceAtCeiling: "",
  resetSinceAtCeiling: "",
  meterFull: "",
  meterGains: [],
  endings: [],
  endingAllotment: {},
  law: EMPTY_LAW,
})

/** Where a 解析値 starts: the six levels, three medals a game, and an A-type's usual rows. */
export const STARTING_WORLD: WorldForm = {
  settingLevels: ALL_SETTING_LEVELS,
  bet: "3",
  rows: [row("big", "BIG", "bonus"), row("reg", "REG", "bonus"), row("grape", "ブドウ", "role"), row("cherry", "チェリー", "role"), row("replay", "リプレイ", "replay")],
  base: "",
  lcdRate: "",
  unitName: "",
  unitGames: "",
  cap: "",
}

/** Where a typed-in formula starts: BIG and REG, and a 機械割 for each level. */
export const STARTING_MANUAL: ManualForm = {
  world: { settingLevels: ALL_SETTING_LEVELS, bet: "3", rows: [row("big", "BIG", "bonus"), row("reg", "REG", "bonus")], base: "", lcdRate: "", unitName: "", unitGames: "", cap: "" },
  rates: {},
}

/** Where a typed-in formula of an AT machine starts: its AT, its ベース, and a 機械割 for each level. */
export const STARTING_AT_MANUAL: ManualForm = {
  world: { settingLevels: ALL_SETTING_LEVELS, bet: "3", rows: [row("at", "AT", "at")], base: "", lcdRate: "", unitName: "", unitGames: "", cap: "" },
  rates: {},
}

/** Whether a world is of an AT machine: its AT, its modes if it has them, and its ベース, nothing else. */
export const isAtMachine = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "at")

/** Whether an AT machine has a side bonus: a bonus beside its trigger, with its own ceiling, winning nothing. */
export const hasSideBonus = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "side")

/** Whether a CZ brings an AT machine's AT. */
export const hasCz = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "cz")

/** Whether an AT machine's ceilings are its modes'. */
export const hasModes = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "mode")

/** Whether a CZ's success brings a bonus, which wins the AT at a share of its own. */
export const bringsBonus = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "cz" && each.trigger === "cz-then-bonus")

/** Whether the trigger an AT間天井 may bring is a bonus: a bonus that wins the AT at a share, or a CZ whose success brings one. */
export const ceilingBringsBonus = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "cz" && (each.trigger === "bonus" || each.trigger === "cz-then-bonus"))

/** Whether a CZ's bonus that misses the AT starts play again: ceilings, スルー天井 and modes counted again from it. */
export const restartsAtBonus = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "cz" && each.trigger === "cz-then-bonus" && each.bonusMiss === "restarts")

/** An AT row's AT間天井 as typed: after an AT or a setting change, in games or in the unit, and across bonuses where they start play again. */
const atCeilingsTyped = (form: WorldForm, at: EntityRow): readonly string[] => [
  at.ceiling,
  at.resetCeiling,
  at.unitCeiling,
  at.resetUnitCeiling,
  ...(restartsAtBonus(form) ? [at.ceilingAcrossBonuses] : []),
]

/** Whether an AT a CZ brings has an AT間天井 typed: its own, after an AT or a setting change, in games or in the unit, across bonuses, or a mode's. */
export const hasAtCeiling = (form: WorldForm): boolean =>
  hasCz(form) &&
  form.rows.some((each) => (each.kind === "at" ? atCeilingsTyped(form, each) : each.kind === "mode" ? [each.atCeiling, each.atUnitCeiling] : []).some((text) => text.trim() !== ""))

/** A key no row, nor any AT's ending, has yet. */
export const freshKey = (rows: readonly EntityRow[]): string => {
  const used = new Set(rows.flatMap((each) => [each.key, ...each.endings.map((ending) => ending.key)]))
  const next = (count: number): string => (used.has(`e${count}`) ? next(count + 1) : `e${count}`)
  return next(used.size + 1)
}

export const newRow = (rows: readonly EntityRow[], kind: EntityKindName): EntityRow => row(freshKey(rows), "", kind)

/** An ending of the AT not yet typed, under a key no row nor ending has. */
export const newEnding = (rows: readonly EntityRow[]): EndingForm => ({ key: freshKey(rows), label: "", shares: {} })

/** The AT's endings as typed, where the machine has modes for them to allot; none otherwise. */
export const atEndings = (form: WorldForm): readonly EndingForm[] => (hasModes(form) ? (form.rows.find((each) => each.kind === "at")?.endings ?? []) : [])

/**
 * Whether every mode has something typed for its allotment after every one
 * of the AT's endings: its allotment after an AT is then needed for none of
 * them, and may be left empty, the endings' mix standing for it.
 */
export const everyEndingAllotted = (form: WorldForm): boolean =>
  atEndings(form).length > 0 &&
  form.rows
    .filter((each) => each.kind === "mode")
    .every((mode) => atEndings(form).every((ending) => Object.values(mode.endingAllotment[ending.key] ?? {}).some((typed) => tidyTyped(typed) !== "")))

const DECIMAL = /^(\d+)(?:\.(\d+))?$/

/** A typed number as exact hundredths: `273.1` is `27310`. Never through a float, and no finer than a spec is kept: more places is `too-fine`. */
export const hundredthsOf = (text: string, field: string): Read<number> => {
  const plain = tidyTyped(text).replaceAll(",", "")
  if (plain === "") return Err({ field, reason: "required" })
  const match = DECIMAL.exec(plain)
  if (match === null) return Err({ field, reason: "not-a-number" })
  const [, whole = "0", fraction = ""] = match
  return fraction.length > 2 ? Err({ field, reason: "too-fine" }) : Ok(Number(whole) * 100 + Number(fraction.padEnd(2, "0")))
}

/**
 * A chance as an analysis sheet writes one: `16%`, or one in so many —
 * `1/273.1` or just `273.1` — each read exactly.
 */
const chanceOf = (text: string, field: string): Read<ProbabilityDto> => {
  const plain = tidyTyped(text)
  if (plain.endsWith("%")) {
    const read = hundredthsOf(plain.slice(0, -1), field)
    if (!read.ok) return read
    return read.value > 10_000 ? Err({ field, reason: "out-of-range" }) : Ok({ type: "percent", basisPoints: read.value })
  }
  const read = hundredthsOf(plain.replace(/^1\//, ""), field)
  if (!read.ok) return read
  return read.value < 100 ? Err({ field, reason: "out-of-range" }) : Ok({ type: "ratio", numerator: 1, denominatorHundredths: read.value })
}

/** A chance written back the way it is typed. */
const chanceText = (chance: ProbabilityDto): string =>
  chance.type === "percent" ? `${chance.basisPoints / 100}%` : `1/${chance.denominatorHundredths / 100 / chance.numerator}`

const medalsOf = (text: string, field: string): Read<number> => {
  const read = hundredthsOf(text, field)
  return read.ok ? Ok(read.value / 100) : read
}

const betOf = (text: string): Read<number> => {
  const read = hundredthsOf(text, "1Gの枚数")
  return !read.ok ? read : read.value === 0 || read.value % 100 !== 0 ? Err({ field: "1Gの枚数", reason: "out-of-range" }) : Ok(read.value / 100)
}

/** A ceiling in regular games: empty for none, else a whole number of games. */
const ceilingOf = (text: string, field: string): Read<number | undefined> => {
  if (tidyTyped(text) === "") return Ok(undefined)
  const read = hundredthsOf(text, field)
  return !read.ok ? read : read.value === 0 || read.value % 100 !== 0 ? Err({ field, reason: "out-of-range" }) : Ok(read.value / 100)
}

/** ベース: games fifty medals last, above none. */
const baseOf = (text: string): Read<number> => {
  const read = hundredthsOf(text, "ベース")
  return !read.ok ? read : read.value === 0 ? Err({ field: "ベース", reason: "out-of-range" }) : Ok(read.value / 100)
}

/** A share in percent as basis points: `30` is `3000`, no more than the whole. */
const shareOf = (text: string, field: string): Read<number> => {
  const read = hundredthsOf(tidyTyped(text).replace(/%$/, ""), field)
  return read.ok && read.value > 10_000 ? Err({ field, reason: "out-of-range" }) : read
}

/** The screen's games a regular game comes to: empty for none, else one or more. */
const lcdRateOf = (text: string): Read<number | undefined> => {
  if (tidyTyped(text) === "") return Ok(undefined)
  const read = hundredthsOf(text, "液晶の加算")
  return !read.ok ? read : read.value < 100 ? Err({ field: "液晶の加算", reason: "out-of-range" }) : Ok(read.value / 100)
}

/** What the trigger's ceilings are counted in, read: none where no name is typed, else the name and how much of it a regular game comes to — one over the games one of it takes. */
const ceilingUnitOf = (form: WorldForm): Read<{ readonly name: string; readonly perGame: number } | undefined> => {
  const name = tidyTyped(form.unitName)
  if (name === "") return Ok(undefined)
  const read = hundredthsOf(form.unitGames, `1${name}あたりのG数`)
  return !read.ok ? read : read.value === 0 ? Err({ field: `1${name}あたりのG数`, reason: "out-of-range" }) : Ok({ name, perGame: 100 / read.value })
}

/** A share for each setting level, read; or none where every one is left empty and that is allowed. */
const sharesOf = (form: WorldForm, values: Readonly<Record<string, string>>, name: string, optional: boolean): readonly Read<BySettingLevelDto<number>>[] | undefined => {
  if (optional && form.settingLevels.every((level) => tidyTyped(values[String(level)] ?? "") === "")) return undefined
  return form.settingLevels.map((level) => {
    const read = shareOf(values[String(level)] ?? "", `${name} 設定${level}`)
    return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
  })
}

/** A 機械割 in percent as basis points: `97.0` is `9700`. */
const rateOf = (text: string, field: string): Read<number> => {
  const read = hundredthsOf(text, field)
  return read.ok && read.value === 0 ? Err({ field, reason: "out-of-range" }) : read
}

/** Whether a row takes zones: a mode, or the CZ of a machine without modes. */
export const takesGates = (form: WorldForm, entity: EntityRow): boolean => entity.kind === "mode" || (entity.kind === "cz" && !hasModes(form))

/** A zone read: its game, a whole number of games, and its shares under every level, the AT's where any is typed; the first thing wrong with it otherwise. */
const gateOf = (form: WorldForm, gate: GateForm, name: string): Read<GateDto> => {
  const field = `${name} ゾーン${tidyTyped(gate.game) === "" ? "" : ` ${tidyTyped(gate.game)}G`}`
  const game = ceilingOf(gate.game, `${field} ゲーム数`)
  if (!game.ok) return game
  if (game.value === undefined) return Err({ field: `${field} ゲーム数`, reason: "required" })
  const span = ceilingOf(gate.span, `${field} 長さ`)
  if (!span.ok) return span
  const trigger = sharesOf(form, gate.trigger, `${field} CZ`, false) ?? []
  const at = sharesOf(form, gate.at, `${field} AT`, true)
  const [problem] = problemsOf([...trigger, ...(at ?? [])])
  if (problem !== undefined) return Err(problem)
  return Ok({ game: game.value, ...(span.value === undefined || span.value === 1 ? {} : { span: span.value }), trigger: valuesOf(trigger), ...(at === undefined ? {} : { at: valuesOf(at) }) })
}

/**
 * A CZ's meter read: the points that fill it, a whole number, and each gain
 * its points and its shares under every level; none where nothing is
 * typed; the first thing wrong with it otherwise.
 */
const meterOf = (form: WorldForm, entity: EntityRow, name: string): Read<MeterDto | undefined> => {
  if (tidyTyped(entity.meterFull) === "" && entity.meterGains.length === 0) return Ok(undefined)
  const full = ceilingOf(entity.meterFull, `${name} メーター満タン`)
  if (!full.ok) return full
  if (full.value === undefined) return Err({ field: `${name} メーター満タン`, reason: "required" })
  const gains = entity.meterGains.map((gain, index): Read<MeterDto["gains"][number]> => {
    const field = `${name} メーター ${String(index + 1)}つ目`
    const points = ceilingOf(gain.points, `${field} pt`)
    if (!points.ok) return points
    if (points.value === undefined) return Err({ field: `${field} pt`, reason: "required" })
    const shares = sharesOf(form, gain.shares, field, false) ?? []
    const [problem] = problemsOf(shares)
    return problem === undefined ? Ok({ points: points.value, share: valuesOf(shares) }) : Err(problem)
  })
  const [problem] = problemsOf(gains)
  return problem === undefined ? Ok({ full: full.value, gains: valuesOf(gains) }) : Err(problem)
}

/** Where a failed CZ in a mode moves play, read: each mode some share is typed for, with its shares under every level; none where nothing is typed and play stays. */
const redrawOf = (form: WorldForm, typed: EntityRow["redraw"], name: string): readonly Read<RedrawDto>[] =>
  form.rows
    .filter((to) => to.kind === "mode")
    .flatMap((to) => {
      const shares = sharesOf(form, typed[to.key] ?? {}, `${name} → ${nameOf(to)}`, true)
      if (shares === undefined) return []
      const [problem] = problemsOf(shares)
      return [problem === undefined ? Ok({ to: to.key, share: valuesOf(shares) }) : Err(problem)]
    })

/** Where play leaves a mode, read: none where no games are typed, else the games and the mode it leaves to, which must be one. */
const expiryOf = (form: WorldForm, entity: EntityRow, name: string): Read<{ readonly games: number; readonly to: string } | undefined> => {
  const games = ceilingOf(entity.expiryGames, `${name} 抜けるまでのゲーム数`)
  if (!games.ok || games.value === undefined) return games.ok ? Ok(undefined) : games
  return form.rows.some((to) => to.kind === "mode" && to.key === entity.expiryTo) ? Ok({ games: games.value, to: entity.expiryTo }) : Err({ field: `${name} 抜けた先のモード`, reason: "required" })
}

/** A share of every time under each level: a bonus a CZ's success brings, its share left empty, wins the AT each time. */
const everyTime = (form: WorldForm): readonly Read<BySettingLevelDto<number>>[] => form.settingLevels.map((level) => Ok({ settingLevel: level, value: 10_000 }))

const nameOf = (entity: EntityRow): string => (entity.label.trim() === "" ? "名前のない行" : entity.label.trim())

const problemsOf = (reads: readonly Read<unknown>[]): readonly FormProblem[] => reads.flatMap((read) => (read.ok ? [] : [read.error]))

const valuesOf = <T,>(reads: readonly Read<T>[]): readonly T[] => reads.flatMap((read) => (read.ok ? [read.value] : []))

/** The bonus keys some part belongs to: their chance is their parts'. */
const splitBonuses = (form: WorldForm): ReadonlySet<string> => new Set(form.rows.filter((each) => each.kind === "part").map((each) => each.of))

/** What a row's components come to, read: its chance per level, its payout, and where it belongs. */
interface ReadRow {
  readonly entity: EntityRow
  readonly chance: readonly BySettingLevelDto<ProbabilityDto>[] | undefined
  /** A mode's 振り分け after an AT, in basis points. */
  readonly allotment: readonly BySettingLevelDto<number>[] | undefined
  readonly payout: number | undefined
  readonly ceiling: number | undefined
  readonly resetCeiling: number | undefined
  readonly atCeiling: number | undefined
  /** Its ceilings counted in the machine's unit, where typed. */
  readonly unitCeiling: number | undefined
  readonly resetUnitCeiling: number | undefined
  readonly atUnitCeiling: number | undefined
  readonly resetAllotment: readonly BySettingLevelDto<number>[] | undefined
  readonly success: readonly BySettingLevelDto<number>[] | undefined
  /** Where a CZ's success brings a bonus: how often it wins the AT. */
  readonly bonusShare: readonly BySettingLevelDto<number>[] | undefined
  /** A mode's zones, or a CZ's; none where it has none. */
  readonly gates: readonly GateDto[] | undefined
  /** Where a failed CZ in a mode moves play; none where it stays. */
  readonly redraw: readonly RedrawDto[] | undefined
  /** Where a failed ceiling CZ in a mode moves play; none where `redraw` says. */
  readonly ceilingRedraw: readonly RedrawDto[] | undefined
  /** A mode's own CZ chance a game; none where it takes the 合算's. */
  readonly triggerChance: readonly BySettingLevelDto<ProbabilityDto>[] | undefined
  /** Where play leaves a mode after so many games without a CZ; none where it stays. */
  readonly expiry: { readonly games: number; readonly to: string } | undefined
  readonly misses: number | undefined
  /** A watch's trials, where more than one. */
  readonly trials: number | undefined
  /** A CZ that is a bonus: its 純増, where given. */
  readonly net: number | undefined
  /** A CZ's ceiling counted from the last AT, or a mode's own, where given. */
  readonly sinceAtCeiling: number | undefined
  /** A CZ's ceiling counted from the last AT after a setting change, where given. */
  readonly resetSinceAtCeiling: number | undefined
  /** A CZ's meter, where it has one. */
  readonly meter: MeterDto | undefined
  /** An AT's AT間天井 counted from the last AT across the bonuses that start play again, where given. */
  readonly ceilingAcrossBonuses: number | undefined
  /** What the bonus an AT's AT間天井 brings pays, where given. */
  readonly ceilingPayout: number | undefined
  /** An AT a CZ brings: how often a regular game wins it outright, where given. */
  readonly direct: readonly BySettingLevelDto<ProbabilityDto>[] | undefined
  /** An AT a CZ brings, whose success brings a bonus: how often a regular game brings the bonus outright, where given. */
  readonly directBonus: readonly BySettingLevelDto<ProbabilityDto>[] | undefined
  /** An AT's endings, each with its share in basis points, where the machine has modes for them to allot. */
  readonly endings: readonly ReadEnding[] | undefined
  /** A mode's 振り分け after each ending typed for it, in basis points, by the ending's key. */
  readonly endingAllotment: Readonly<Record<string, readonly BySettingLevelDto<number>[]>> | undefined
  readonly law: ReadLaw | undefined
}

/** An ending read: its key, its name, and its share of ATs under each level. */
interface ReadEnding {
  readonly key: string
  readonly label: string
  readonly share: readonly BySettingLevelDto<number>[]
}

/** An ending of the AT read: a name, and a share under every level; the first thing wrong otherwise. */
const endingOf = (form: WorldForm, ending: EndingForm, index: number): Result<ReadEnding, readonly FormProblem[]> => {
  const name = ending.label.trim() === "" ? `ATの終わり方${index + 1}` : ending.label.trim()
  const label: Read<string> = ending.label.trim() === "" ? Err({ field: `ATの終わり方${index + 1} 名前`, reason: "required" }) : Ok(ending.label.trim())
  const shares = sharesOf(form, ending.shares, `${name} 割合`, false) ?? []
  const problems = problemsOf([label, ...shares])
  return problems.length > 0 || !label.ok ? Err(problems) : Ok({ key: ending.key, label: label.value, share: valuesOf(shares) })
}

/** A mode's 振り分け after each of the AT's endings, read: those typed for it, by the ending's key; none where none is. */
const endingAllotmentOf = (form: WorldForm, entity: EntityRow, name: string): readonly Read<readonly [string, readonly BySettingLevelDto<number>[]]>[] =>
  atEndings(form).flatMap((ending, index) => {
    const shares = sharesOf(form, entity.endingAllotment[ending.key] ?? {}, `${name} ${ending.label.trim() === "" ? `ATの終わり方${index + 1}` : ending.label.trim()}のあとの振り分け`, true)
    if (shares === undefined) return []
    const [problem] = problemsOf(shares)
    return [problem === undefined ? Ok([ending.key, valuesOf(shares)] as const) : Err(problem)]
  })

/** An AT's law and 有利区間, read into the components they become. */
interface ReadLaw {
  readonly sets: { readonly first: number; readonly set: number } | undefined
  readonly continuationRate: readonly BySettingLevelDto<number>[] | undefined
  readonly table: readonly BySettingLevelDto<readonly PayoutRowDto[]>[] | undefined
  readonly net: number | undefined
  readonly otherNets: readonly OtherNetDto[] | undefined
  readonly window: number | undefined
  readonly resetOnCap: boolean
}

/** A 継続率 in percent as basis points, below the whole: an AT ends some time. */
const continuationRateOf = (text: string, field: string): Read<number> => {
  const read = shareOf(text, field)
  return read.ok && read.value >= 10_000 ? Err({ field, reason: "out-of-range" }) : read
}

/** A set's medals: more than none. */
const setOf = (text: string, field: string): Read<number> => {
  const read = medalsOf(text, field)
  return read.ok && read.value === 0 ? Err({ field, reason: "out-of-range" }) : read
}

const readLaw = (form: WorldForm, entity: EntityRow, name: string): Result<ReadLaw, readonly FormProblem[]> => {
  const law = entity.law
  const first = law.shape === "sets" ? medalsOf(law.first, `${name} 初期枚数`) : Ok(0)
  const set = law.shape === "sets" ? setOf(law.set, `${name} 1セットの枚数`) : Ok(0)
  const continuationRate: readonly Read<BySettingLevelDto<number>>[] =
    law.shape === "sets"
      ? form.settingLevels.map((level) => {
          const read = continuationRateOf(law.continuationRate[String(level)] ?? "", `${name} 継続率 設定${level}`)
          return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
        })
      : []
  const noRows: Read<true> = law.shape === "table" && law.rows.length === 0 ? Err({ field: `${name} 獲得枚数の表`, reason: "required" }) : Ok(true)
  const rows =
    law.shape === "table"
      ? law.rows.map((row, index) => ({
          medals: medalsOf(row.medals, `${name} 表${index + 1}行目 枚数`),
          shares: form.settingLevels.map((level) => {
            const read = shareOf(row.shares[String(level)] ?? "", `${name} 表${index + 1}行目 設定${level}`)
            return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
          }),
        }))
      : []
  const net: Read<number | undefined> = law.shape === "rate" ? setOf(law.net, `${name} 純増`) : Ok(undefined)
  const otherNets =
    law.shape === "rate"
      ? law.otherNets.map((other, index) => ({ net: setOf(other.net, `${name} 別の純増${index + 1}`), share: shareOf(other.share, `${name} 別の純増${index + 1} 割合`) }))
      : []
  const window = ceilingOf(law.window, `${name} 引き戻し`)
  const problems = problemsOf([first, set, noRows, net, window, ...continuationRate, ...rows.flatMap((row) => [row.medals, ...row.shares]), ...otherNets.flatMap((other) => [other.net, other.share])])
  if (problems.length > 0 || !first.ok || !set.ok || !net.ok || !window.ok) return Err(problems)
  const table = form.settingLevels.map((level) => ({
    settingLevel: level,
    value: rows.flatMap((row) => {
      const share = valuesOf(row.shares).find((each) => each.settingLevel === level)
      return row.medals.ok && share !== undefined ? [{ medals: row.medals.value, share: share.value }] : []
    }),
  }))
  return Ok({
    sets: law.shape === "sets" ? { first: first.value, set: set.value } : undefined,
    continuationRate: law.shape === "sets" ? valuesOf(continuationRate) : undefined,
    table: law.shape === "table" ? table : undefined,
    net: net.value,
    otherNets: otherNets.length === 0 ? undefined : otherNets.flatMap((other) => (other.net.ok && other.share.ok ? [{ net: other.net.value, shareBasisPoints: other.share.value }] : [])),
    window: window.value,
    resetOnCap: law.resetOnCap,
  })
}

/** What a row that belongs to another must name: a part and a watch a bonus, a cue a watch. */
const OWNERS: Partial<Readonly<Record<EntityKindName, { readonly kind: EntityKindName; readonly field: string }>>> = {
  part: { kind: "bonus", field: "どのボーナスの内訳か" },
  watch: { kind: "bonus", field: "どのボーナスで見るか" },
  cue: { kind: "watch", field: "どの場面の示唆か" },
}

/** The row a row belongs to, where it is one that belongs to another. */
const ofRead = (form: WorldForm, entity: EntityRow, name: string): Read<string> => {
  const owner = OWNERS[entity.kind]
  if (owner === undefined) return Ok("")
  return form.rows.some((other) => other.key === entity.of && other.kind === owner.kind) ? Ok(entity.of) : Err({ field: `${name} ${owner.field}`, reason: "required" })
}

/** A watch's trials: empty for one, else a whole number above none; one is left out of the world. */
const trialsOf = (text: string, field: string): Read<number | undefined> => {
  const read = ceilingOf(text, field)
  return read.ok && read.value === 1 ? Ok(undefined) : read
}

/** Whether a row's payout must be given, may be, or is not had at all. */
type PayoutRule = "required" | "optional" | "none"

/** Whether a row's chances may be typed as published or below its ceilings: a CZ's, an AT's, a side bonus's. */
export const givesChanceKind = (entity: EntityRow): boolean => entity.kind === "cz" || entity.kind === "at" || entity.kind === "side"

/** What a row's typed chances are, in a word after its name: a 合算 where a CZ's or a side bonus's are published, the chance below the ceilings where they are given so. */
const chanceWord = (entity: EntityRow): string => {
  if (!givesChanceKind(entity)) return ""
  if (entity.chanceKind === "below") return " 天井を除いた確率"
  return entity.kind === "at" ? "" : " 合算"
}

const readRow = (form: WorldForm, entity: EntityRow, payoutRule: (entity: EntityRow) => PayoutRule): Result<ReadRow, readonly FormProblem[]> => {
  const name = nameOf(entity)
  const label: Read<string> = entity.label.trim() === "" ? Err({ field: "名前", reason: "required" }) : Ok(entity.label.trim())
  const isMode = entity.kind === "mode"
  const isCz = entity.kind === "cz"
  const brought = entity.kind === "at" && hasCz(form)
  const isWatch = entity.kind === "watch"
  const isSide = entity.kind === "side"
  const hasChance = !isMode && !isWatch && !brought && !(entity.kind === "bonus" && splitBonuses(form).has(entity.key))
  const chances: readonly Read<BySettingLevelDto<ProbabilityDto>>[] = hasChance
    ? form.settingLevels.map((level) => {
        const read = chanceOf(entity.chances[String(level)] ?? "", `${name}${chanceWord(entity)} 設定${level}`)
        return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
      })
    : []
  const typedDirect = brought && form.settingLevels.some((level) => tidyTyped(entity.chances[String(level)] ?? "") !== "")
  const direct: readonly Read<BySettingLevelDto<ProbabilityDto>>[] = typedDirect
    ? form.settingLevels.map((level) => {
        const read = chanceOf(entity.chances[String(level)] ?? "", `${name} 直撃 設定${level}`)
        return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
      })
    : []
  const typedDirectBonus = brought && bringsBonus(form) && form.settingLevels.some((level) => tidyTyped(entity.directBonuses[String(level)] ?? "") !== "")
  const directBonus: readonly Read<BySettingLevelDto<ProbabilityDto>>[] = typedDirectBonus
    ? form.settingLevels.map((level) => {
        const read = chanceOf(entity.directBonuses[String(level)] ?? "", `${name} 直撃ボーナス 設定${level}`)
        return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
      })
    : []
  const allotment = isMode ? sharesOf(form, entity.chances, `${name} 振り分け`, everyEndingAllotted(form)) : undefined
  const resetAllotment = isMode ? sharesOf(form, entity.resetAllotment, `${name} リセット時の振り分け`, true) : undefined
  const ownSuccess = isMode && hasCz(form)
  const success = isCz ? (sharesOf(form, entity.success, `${name} 成功率`, false) ?? []) : ownSuccess ? (sharesOf(form, entity.success, `${name} CZ成功率`, true) ?? []) : []
  const redraw = ownSuccess ? redrawOf(form, entity.redraw, name) : []
  const ceilingRedraw = ownSuccess ? redrawOf(form, entity.ceilingRedraw, `${name} 天井CZ`) : []
  const typedChance = isMode && form.settingLevels.some((level) => tidyTyped(entity.triggerChances[String(level)] ?? "") !== "")
  const triggerChance: readonly Read<BySettingLevelDto<ProbabilityDto>>[] = typedChance
    ? form.settingLevels.map((level) => {
        const read = chanceOf(entity.triggerChances[String(level)] ?? "", `${name} CZ確率 設定${level}`)
        return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
      })
    : []
  const expiry = isMode ? expiryOf(form, entity, name) : Ok(undefined)
  const bonusShare = isCz && entity.trigger === "cz-then-bonus" ? (sharesOf(form, entity.bonusShares, `${name} ボーナスからのAT率`, true) ?? everyTime(form)) : []
  const gates = takesGates(form, entity) ? entity.gates.map((gate) => gateOf(form, gate, name)) : []
  const misses = isCz || (isMode && hasCz(form)) ? ceilingOf(entity.misses, `${name} スルー天井`) : Ok(undefined)
  const net: Read<number | undefined> = (isCz || isSide) && tidyTyped(entity.net) !== "" ? setOf(entity.net, `${name} 純増`) : Ok(undefined)
  const sinceAtCeiling = isCz || (isMode && hasCz(form)) ? ceilingOf(entity.sinceAtCeiling, `${name} ATから数える天井`) : Ok(undefined)
  const resetSinceAtCeiling = isCz && !hasModes(form) ? ceilingOf(entity.resetSinceAtCeiling, `${name} リセット後のATから数える天井`) : Ok(undefined)
  const meter = isCz ? meterOf(form, entity, name) : Ok(undefined)
  const ceilingAcrossBonuses = brought && restartsAtBonus(form) ? ceilingOf(entity.ceilingAcrossBonuses, `${name} ATから数えるAT間天井`) : Ok(undefined)
  const ceilingPayout: Read<number | undefined> =
    brought && entity.ceilingAt === "triggered" && ceilingBringsBonus(form) && tidyTyped(entity.ceilingPayout) !== "" ? medalsOf(entity.ceilingPayout, `${name} 天井で当たるボーナスの枚数`) : Ok(undefined)
  const rule = payoutRule(entity)
  const payout: Read<number | undefined> =
    rule === "none" || (rule === "optional" && tidyTyped(entity.payout) === "") ? Ok(undefined) : medalsOf(entity.payout, `${name} 枚数`)
  const of = ofRead(form, entity, name)
  const trials = isWatch ? trialsOf(entity.trials, `${name} ボーナス1回の回数`) : Ok(undefined)
  const ceiling = entity.kind === "at" || isCz || isMode || isSide ? ceilingOf(entity.ceiling, `${name} ${brought ? "AT間天井" : "天井"}`) : Ok(undefined)
  const resetCeiling =
    (entity.kind === "at" && !hasModes(form)) || isCz ? ceilingOf(entity.resetCeiling, `${name} ${brought ? "リセット後のAT間天井" : "リセット後の天井"}`) : Ok(undefined)
  const atCeiling = isMode && hasCz(form) ? ceilingOf(entity.atCeiling, `${name} AT間天井`) : Ok(undefined)
  const unit = tidyTyped(form.unitName)
  const counted = unit !== ""
  const unitCeiling = counted && (entity.kind === "at" || isCz || isMode) ? ceilingOf(entity.unitCeiling, `${name} ${brought ? "AT間天井" : "天井"}（${unit}）`) : Ok(undefined)
  const resetUnitCeiling =
    counted && ((entity.kind === "at" && !hasModes(form)) || isCz) ? ceilingOf(entity.resetUnitCeiling, `${name} ${brought ? "リセット後のAT間天井" : "リセット後の天井"}（${unit}）`) : Ok(undefined)
  const atUnitCeiling = counted && isMode && hasCz(form) ? ceilingOf(entity.atUnitCeiling, `${name} AT間天井（${unit}）`) : Ok(undefined)
  const law = entity.kind === "at" ? readLaw(form, entity, name) : Ok(undefined)
  const endings = entity.kind === "at" && hasModes(form) ? entity.endings.map((ending, index) => endingOf(form, ending, index)) : []
  const endingAllotment = isMode ? endingAllotmentOf(form, entity, name) : []
  const problems = [
    ...endings.flatMap((read) => (read.ok ? [] : read.error)),
    ...problemsOf(endingAllotment),
    ...problemsOf([label, payout, of, trials, net, sinceAtCeiling, resetSinceAtCeiling, meter, ceilingAcrossBonuses, ceilingPayout, ...direct, ...directBonus, ceiling, resetCeiling, atCeiling, unitCeiling, resetUnitCeiling, atUnitCeiling, misses, ...chances, ...(allotment ?? []), ...(resetAllotment ?? []), ...success, ...bonusShare, ...gates, ...redraw, ...ceilingRedraw, ...triggerChance, expiry]),
    ...(law.ok ? [] : law.error),
  ]
  if (problems.length > 0 || !law.ok) return Err(problems)
  return Ok({
    entity,
    chance: hasChance ? valuesOf(chances) : undefined,
    direct: typedDirect ? valuesOf(direct) : undefined,
    directBonus: typedDirectBonus ? valuesOf(directBonus) : undefined,
    allotment: allotment === undefined ? undefined : valuesOf(allotment),
    payout: payout.ok ? payout.value : undefined,
    ceiling: ceiling.ok ? ceiling.value : undefined,
    resetCeiling: resetCeiling.ok ? resetCeiling.value : undefined,
    atCeiling: atCeiling.ok ? atCeiling.value : undefined,
    unitCeiling: unitCeiling.ok ? unitCeiling.value : undefined,
    resetUnitCeiling: resetUnitCeiling.ok ? resetUnitCeiling.value : undefined,
    atUnitCeiling: atUnitCeiling.ok ? atUnitCeiling.value : undefined,
    resetAllotment: resetAllotment === undefined ? undefined : valuesOf(resetAllotment),
    success: isCz || success.length > 0 ? valuesOf(success) : undefined,
    redraw: redraw.length > 0 ? valuesOf(redraw) : undefined,
    ceilingRedraw: ceilingRedraw.length > 0 ? valuesOf(ceilingRedraw) : undefined,
    triggerChance: typedChance ? valuesOf(triggerChance) : undefined,
    expiry: expiry.ok ? expiry.value : undefined,
    bonusShare: isCz && entity.trigger === "cz-then-bonus" ? valuesOf(bonusShare) : undefined,
    gates: gates.length > 0 ? valuesOf(gates) : undefined,
    misses: misses.ok ? misses.value : undefined,
    trials: trials.ok ? trials.value : undefined,
    net: net.ok ? net.value : undefined,
    sinceAtCeiling: sinceAtCeiling.ok ? sinceAtCeiling.value : undefined,
    resetSinceAtCeiling: resetSinceAtCeiling.ok ? resetSinceAtCeiling.value : undefined,
    meter: meter.ok ? meter.value : undefined,
    ceilingAcrossBonuses: ceilingAcrossBonuses.ok ? ceilingAcrossBonuses.value : undefined,
    ceilingPayout: ceilingPayout.ok ? ceilingPayout.value : undefined,
    endings: endings.length > 0 ? endings.flatMap((read) => (read.ok ? [read.value] : [])) : undefined,
    endingAllotment: endingAllotment.length > 0 ? Object.fromEntries(valuesOf(endingAllotment)) : undefined,
    law: law.value,
  })
}

/** The world the rows make: a table per component, keyed by each row's key. */
/** What only an AT machine has: its ベース, and its screen's rate and 有利区間の上限 where it has them. */
interface MachineResources {
  readonly base: number
  readonly lcdRate: number | undefined
  readonly ceilingUnit: { readonly name: string; readonly perGame: number } | undefined
  readonly cap: number | undefined
}

const worldOf = (form: WorldForm, bet: number, at: MachineResources | undefined, rows: readonly ReadRow[]): SpecDto => {
  const keyed = <T,>(pick: (read: ReadRow) => T | undefined): Readonly<Record<string, T>> =>
    Object.fromEntries(rows.flatMap((read) => {
      const value = pick(read)
      return value === undefined ? [] : [[read.entity.key, value] as const]
    }))
  const listed = (kind: EntityKindName): readonly string[] => rows.filter((read) => read.entity.kind === kind).map((read) => read.entity.key)
  const owned = (kind: EntityKindName): Readonly<Record<string, string>> => keyed((read) => (read.entity.kind === kind ? read.entity.of : undefined))
  const bonuses = rows.filter((read) => read.entity.kind === "bonus" || (read.entity.kind === "cz" && read.entity.trigger === "bonus")).map((read) => read.entity.key)
  const restarting = rows.filter((read) => read.entity.kind === "cz" && read.entity.trigger === "cz-then-bonus" && read.entity.bonusMiss === "restarts").map((read) => read.entity.key)
  const forcedFromAt = rows.some((read) => (read.entity.kind === "cz" || read.entity.kind === "mode") && read.sinceAtCeiling !== undefined)
  const sure = rows.filter((read) => read.entity.kind === "cz" && read.entity.forcedCz === "wins" && forcedFromAt).map((read) => read.entity.key)
  const atCeiled = rows.some((read) =>
    read.entity.kind === "at"
      ? [read.ceiling, read.resetCeiling, read.unitCeiling, read.resetUnitCeiling, read.ceilingAcrossBonuses].some((ceiling) => ceiling !== undefined)
      : read.entity.kind === "mode" && (read.atCeiling !== undefined || read.atUnitCeiling !== undefined),
  )
  const triggering = rows.filter((read) => read.entity.kind === "at" && read.entity.ceilingAt === "triggered" && hasCz(form) && atCeiled).map((read) => read.entity.key)
  const parts = owned("part")
  const watches = owned("watch")
  const cues = owned("cue")
  const trials = keyed((read) => read.trials)
  const sinceAtCeilings = keyed((read) => read.sinceAtCeiling)
  const resetSinceAtCeilings = keyed((read) => read.resetSinceAtCeiling)
  const ceilingsAcrossBonuses = keyed((read) => read.ceilingAcrossBonuses)
  const ceilingPayouts = keyed((read) => (triggering.includes(read.entity.key) ? read.ceilingPayout : undefined))
  const directs = keyed((read) => read.direct)
  const directBonuses = keyed((read) => read.directBonus)
  const isMode = (read: ReadRow): boolean => read.entity.kind === "mode"
  const published = (read: ReadRow): boolean => givesChanceKind(read.entity) && read.entity.chanceKind === "combined"
  const firstHits = keyed((read) => (published(read) ? read.chance : undefined))
  const successes = keyed((read) => read.success)
  const bonusShares = keyed((read) => read.bonusShare)
  const gates = keyed((read) => read.gates)
  const meters = keyed((read) => read.meter)
  const redraws = keyed((read) => read.redraw)
  const ceilingRedraws = keyed((read) => read.ceilingRedraw)
  const triggerChances = keyed((read) => read.triggerChance)
  const expiries = keyed((read) => read.expiry)
  const misses = keyed((read) => read.misses)
  const ceilings = keyed((read) => read.ceiling)
  const resetCeilings = keyed((read) => read.resetCeiling)
  const resetAllotments = keyed((read) => read.resetAllotment)
  const atCeilings = keyed((read) => read.atCeiling)
  const unitCeilings = keyed((read) => read.unitCeiling)
  const resetUnitCeilings = keyed((read) => read.resetUnitCeiling)
  const atUnitCeilings = keyed((read) => read.atUnitCeiling)
  const sets = keyed((read) => read.law?.sets)
  const carries = keyed((read) => read.law?.continuationRate)
  const tables = keyed((read) => read.law?.table)
  const nets = keyed((read) => read.law?.net ?? read.net)
  const otherNets = keyed((read) => read.law?.otherNets)
  const windows = keyed((read) => read.law?.window)
  const resetOnCap = rows.filter((read) => read.law?.resetOnCap === true).map((read) => read.entity.key)
  const endings = rows.flatMap((read) => read.endings ?? [])
  const endingAllotments = keyed((read) => read.endingAllotment)
  return {
    v: SPEC_VERSION,
    entities: rows.flatMap((read) => [read.entity.key, ...(read.endings ?? []).map((ending) => ending.key)]),
    components: {
      label: { ...keyed((read) => read.entity.label.trim()), ...Object.fromEntries(endings.map((ending) => [ending.key, ending.label])) },
      ...(rows.some((read) => !published(read) && !isMode(read) && read.entity.kind !== "watch") ? { chance: keyed((read) => (published(read) ? undefined : read.chance)) } : {}),
      ...(rows.some((read) => read.payout !== undefined) ? { payout: keyed((read) => read.payout) } : {}),
      ...(bonuses.length > 0 ? { bonus: bonuses } : {}),
      ...(listed("replay").length > 0 ? { replay: listed("replay") } : {}),
      ...(Object.keys(parts).length > 0 ? { partOf: parts } : {}),
      ...(listed("at").length > 0 ? { at: listed("at") } : {}),
      ...(listed("side").length > 0 ? { sideBonus: listed("side") } : {}),
      ...(listed("cz").length > 0 ? { cz: listed("cz"), success: successes } : {}),
      ...(Object.keys(bonusShares).length > 0 ? { bonusShare: bonusShares } : {}),
      ...(restarting.length > 0 ? { restart: restarting } : {}),
      ...(sure.length > 0 ? { ceilingWins: sure } : {}),
      ...(triggering.length > 0 ? { ceilingTriggers: triggering } : {}),
      ...(Object.keys(ceilingsAcrossBonuses).length > 0 ? { ceilingAcrossBonuses: ceilingsAcrossBonuses } : {}),
      ...(Object.keys(ceilingPayouts).length > 0 ? { ceilingPayout: ceilingPayouts } : {}),
      ...(Object.keys(firstHits).length > 0 ? { firstHit: firstHits } : {}),
      ...(Object.keys(misses).length > 0 ? { misses } : {}),
      ...(Object.keys(ceilings).length > 0 ? { ceiling: ceilings } : {}),
      ...(Object.keys(resetCeilings).length > 0 ? { resetCeiling: resetCeilings } : {}),
      ...(listed("mode").length > 0 ? { mode: listed("mode"), ...((allotments) => (Object.keys(allotments).length > 0 ? { allotment: allotments } : {}))(keyed((read) => read.allotment)) } : {}),
      ...(Object.keys(resetAllotments).length > 0 ? { resetAllotment: resetAllotments } : {}),
      ...(endings.length > 0 ? { ending: Object.fromEntries(endings.map((ending) => [ending.key, ending.share])) } : {}),
      ...(Object.keys(endingAllotments).length > 0 ? { endingAllotment: endingAllotments } : {}),
      ...(Object.keys(atCeilings).length > 0 ? { atCeiling: atCeilings } : {}),
      ...(Object.keys(unitCeilings).length > 0 ? { unitCeiling: unitCeilings } : {}),
      ...(Object.keys(resetUnitCeilings).length > 0 ? { resetUnitCeiling: resetUnitCeilings } : {}),
      ...(Object.keys(atUnitCeilings).length > 0 ? { atUnitCeiling: atUnitCeilings } : {}),
      ...(Object.keys(sets).length > 0 ? { sets, continuationRate: carries } : {}),
      ...(Object.keys(tables).length > 0 ? { payoutTable: tables } : {}),
      ...(Object.keys(nets).length > 0 ? { netPerGame: nets } : {}),
      ...(Object.keys(otherNets).length > 0 ? { otherNet: otherNets } : {}),
      ...(Object.keys(windows).length > 0 ? { window: windows } : {}),
      ...(resetOnCap.length > 0 ? { resetOnCap } : {}),
      ...(Object.keys(watches).length > 0 ? { watch: watches } : {}),
      ...(Object.keys(trials).length > 0 ? { trials } : {}),
      ...(Object.keys(cues).length > 0 ? { cue: cues } : {}),
      ...(Object.keys(sinceAtCeilings).length > 0 ? { sinceAtCeiling: sinceAtCeilings } : {}),
      ...(Object.keys(resetSinceAtCeilings).length > 0 ? { resetSinceAtCeiling: resetSinceAtCeilings } : {}),
      ...(Object.keys(directs).length > 0 ? { direct: directs } : {}),
      ...(Object.keys(directBonuses).length > 0 ? { directBonus: directBonuses } : {}),
      ...(Object.keys(gates).length > 0 ? { gates } : {}),
      ...(Object.keys(meters).length > 0 ? { meter: meters } : {}),
      ...(Object.keys(redraws).length > 0 ? { redraw: redraws } : {}),
      ...(Object.keys(ceilingRedraws).length > 0 ? { ceilingRedraw: ceilingRedraws } : {}),
      ...(Object.keys(triggerChances).length > 0 ? { triggerChance: triggerChances } : {}),
      ...(Object.keys(expiries).length > 0 ? { expiry: expiries } : {}),
    },
    resources: {
      settingLevels: form.settingLevels.toSorted((left, right) => left - right),
      bet,
      ...(at === undefined ? {} : { base: at.base }),
      ...(at?.lcdRate === undefined ? {} : { lcdRate: at.lcdRate }),
      ...(at?.ceilingUnit === undefined ? {} : { ceilingUnit: at.ceilingUnit }),
      ...(at?.cap === undefined ? {} : { cap: at.cap }),
    },
  }
}

const readRows = (form: WorldForm, payoutRule: (entity: EntityRow) => PayoutRule): Result<SpecDto, readonly FormProblem[]> => {
  const levels: Read<readonly number[]> = form.settingLevels.length === 0 ? Err({ field: "設定", reason: "required" }) : Ok(form.settingLevels)
  const bet = betOf(form.bet)
  const at = isAtMachine(form)
  const bonuses: Read<true> = at || form.rows.some((entity) => entity.kind === "bonus") ? Ok(true) : Err({ field: "ボーナス", reason: "no-bonus" })
  const base: Read<number | undefined> = at ? baseOf(form.base) : Ok(undefined)
  const lcdRate = at ? lcdRateOf(form.lcdRate) : Ok(undefined)
  const ceilingUnit = at ? ceilingUnitOf(form) : Ok(undefined)
  const cap = at ? ceilingOf(form.cap, "有利区間の上限") : Ok(undefined)
  const rows = form.rows.map((entity) => readRow(form, entity, payoutRule))
  const problems = [...problemsOf([levels, bet, bonuses, base, lcdRate, ceilingUnit, cap]), ...rows.flatMap((read) => (read.ok ? [] : read.error))]
  if (problems.length > 0 || !bet.ok || !base.ok || !lcdRate.ok || !ceilingUnit.ok || !cap.ok) return Err(problems)
  const machine = base.value === undefined ? undefined : { base: base.value, lcdRate: lcdRate.value, ceilingUnit: ceilingUnit.value, cap: cap.value }
  return Ok(worldOf(form, bet.value, machine, rows.flatMap((read) => (read.ok ? [read.value] : []))))
}

/** What the engine is given: the world, and how its 機械割 is come to. */
export interface ReadWorld {
  readonly spec: SpecDto
  readonly conditions: ConditionsDto
}

/**
 * A 解析値 read into the world the engine solves: every chance under every
 * setting level, the payout of each bonus and small win, and its 機械割
 * worked out from them.
 */
export const readWorldForm = (form: WorldForm): Result<ReadWorld, readonly FormProblem[]> => {
  const spec = readRows(form, (entity) => (entity.kind === "bonus" || entity.kind === "role" || entity.kind === "side" ? "required" : entity.kind === "cz" ? "optional" : "none"))
  return spec.ok ? Ok({ spec: spec.value, conditions: { payoutRate: { type: "from-spec" } } }) : spec
}

/**
 * A formula typed in by hand read into a world of its bonuses — their payout
 * may be left out — or of its AT, its payout given, with each setting level's
 * 機械割 as measured: all a setting level is inferred and a play weighed from.
 * An AT whose medals follow from the 機械割 has it stated in its world
 * instead, beside its 純増, and the engine works both out from there.
 */
export const readManualForm = (form: ManualForm): Result<ReadWorld, readonly FormProblem[]> => {
  const spec = readRows(form.world, (entity) =>
    entity.kind === "bonus" || entity.kind === "cz" ? "optional" : entity.kind === "side" || (entity.kind === "at" && entity.law.shape === "average") ? "required" : "none",
  )
  const rates: readonly Read<BySettingLevelDto<number>>[] = form.world.settingLevels.map((level) => {
    const read = rateOf(form.rates[String(level)] ?? "", `機械割 設定${level}`)
    return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
  })
  const problems = [...(spec.ok ? [] : spec.error), ...problemsOf(rates)]
  if (!spec.ok || problems.length > 0) return Err(problems)
  const fromRate = form.world.rows.filter((entity) => entity.kind === "at" && entity.law.shape === "rate").map((entity) => entity.key)
  if (fromRate.length === 0) return Ok({ spec: spec.value, conditions: { payoutRate: { type: "measured", bySettingLevel: valuesOf(rates) } } })
  const stated = Object.fromEntries(fromRate.map((key) => [key, valuesOf(rates)]))
  return Ok({ spec: { ...spec.value, components: { ...spec.value.components, rate: stated } }, conditions: { payoutRate: { type: "from-spec" } } })
}

const kindOf = (spec: SpecDto, entity: string): EntityKindName => {
  const components = spec.components
  if (components.at?.includes(entity) === true) return "at"
  if (components.cz?.includes(entity) === true) return "cz"
  if (components.sideBonus?.includes(entity) === true) return "side"
  if (components.mode?.includes(entity) === true) return "mode"
  if (components.bonus?.includes(entity) === true) return "bonus"
  if (components.replay?.includes(entity) === true) return "replay"
  if (components.watch?.[entity] !== undefined) return "watch"
  if (components.cue?.[entity] !== undefined) return "cue"
  return components.partOf?.[entity] === undefined ? "role" : "part"
}

const percentText = (points: number): string => String(points / 100)

/** An AT's law and 有利区間 as typed again, from the components it became. */
const lawFormOf = (spec: SpecDto, entity: string): AtLawForm => {
  const components = spec.components
  const sets = components.sets?.[entity]
  const table = components.payoutTable?.[entity] ?? []
  const shape: PayoutShape = components.rate?.[entity] !== undefined ? "rate" : sets !== undefined ? "sets" : table.length > 0 ? "table" : "average"
  const rowCount = table[0]?.value.length ?? 0
  return {
    shape,
    first: sets === undefined ? "" : String(sets.first),
    set: sets === undefined ? "" : String(sets.set),
    continuationRate: Object.fromEntries((components.continuationRate?.[entity] ?? []).map((each) => [String(each.settingLevel), percentText(each.value)])),
    rows: Array.from({ length: rowCount }, (_, index) => ({
      medals: String(table[0]?.value[index]?.medals ?? ""),
      shares: Object.fromEntries(table.map((each) => [String(each.settingLevel), percentText(each.value[index]?.share ?? 0)])),
    })),
    net: components.netPerGame?.[entity] === undefined ? "" : String(components.netPerGame[entity]),
    otherNets: (components.otherNet?.[entity] ?? []).map((other) => ({ net: String(other.net), share: percentText(other.shareBasisPoints) })),
    window: components.window?.[entity] === undefined ? "" : String(components.window[entity]),
    resetOnCap: components.resetOnCap?.includes(entity) === true,
  }
}

/** A stored mode's moves as typed again: each mode by its key, with its shares in percent by the level. */
const redrawFormOf = (rows: readonly RedrawDto[] | undefined): EntityRow["redraw"] =>
  Object.fromEntries((rows ?? []).map((row) => [row.to, Object.fromEntries(row.share.map((each) => [String(each.settingLevel), String(each.value / 100)]))]))

/** A count as typed again: empty where there is none. */
const typedCount = (count: number | undefined): string => (count === undefined ? "" : String(count))

/**
 * An entity's ceilings as typed again, in games and in the machine's unit.
 * A spec written with a unit and no ceiling counted in it counted its
 * trigger's ceilings — a CZ's, a mode's, an AT's without a CZ — in the
 * unit: those are typed again as the unit's.
 */
const ceilingsOf = (spec: SpecDto, entity: string): Pick<EntityRow, "ceiling" | "resetCeiling" | "unitCeiling" | "resetUnitCeiling"> => {
  const components = spec.components
  const wholeUnit =
    spec.resources.ceilingUnit !== undefined && [components.unitCeiling, components.resetUnitCeiling, components.atUnitCeiling].every((ceilings) => Object.keys(ceilings ?? {}).length === 0)
  const trigger = components.cz?.includes(entity) === true || components.mode?.includes(entity) === true || (components.at?.includes(entity) === true && (components.cz ?? []).length === 0)
  const ceiling = typedCount(components.ceiling?.[entity])
  const resetCeiling = typedCount(components.resetCeiling?.[entity])
  return wholeUnit && trigger
    ? { ceiling: "", resetCeiling: "", unitCeiling: ceiling, resetUnitCeiling: resetCeiling }
    : { ceiling, resetCeiling, unitCeiling: typedCount(components.unitCeiling?.[entity]), resetUnitCeiling: typedCount(components.resetUnitCeiling?.[entity]) }
}

/** A stored zone as typed again. */
const gateFormOf = (gate: GateDto): GateForm => ({
  game: String(gate.game),
  span: gate.span === undefined ? "" : String(gate.span),
  trigger: Object.fromEntries(gate.trigger.map((each) => [String(each.settingLevel), String(each.value / 100)])),
  at: Object.fromEntries((gate.at ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)])),
})

/** What a stored CZ is: a CZ whose success brings a bonus where it has the bonus's share, a bonus where it is marked one, else a CZ. */
const czTriggerOf = (spec: SpecDto, entity: string): CzTrigger => {
  if (spec.components.bonusShare?.[entity] !== undefined) return "cz-then-bonus"
  return spec.components.cz?.includes(entity) === true && spec.components.bonus?.includes(entity) === true ? "bonus" : "cz"
}

/** Shares in basis points as typed again, in percent by the level. */
const percentsOf = (values: readonly BySettingLevelDto<number>[] | undefined): Readonly<Record<string, string>> =>
  Object.fromEntries((values ?? []).map((each) => [String(each.settingLevel), percentText(each.value)]))

/** A stored AT's endings as typed again, in the order made; none on any other entity. */
const endingsFormOf = (spec: SpecDto, entity: string): readonly EndingForm[] =>
  spec.components.at?.includes(entity) === true
    ? spec.entities.flatMap((key) => {
        const shares = spec.components.ending?.[key]
        return shares === undefined ? [] : [{ key, label: spec.components.label?.[key] ?? key, shares: percentsOf(shares) }]
      })
    : []

/** A stored mode's 振り分け after each ending as typed again, by the ending's key. */
const endingAllotmentFormOf = (spec: SpecDto, entity: string): EntityRow["endingAllotment"] =>
  Object.fromEntries(Object.entries(spec.components.endingAllotment?.[entity] ?? {}).map(([ending, values]) => [ending, percentsOf(values)]))

/** A stored world as rows again, for a formula remade from it: an AT's endings typed on its row. */
export const worldFormOf = (spec: SpecDto): WorldForm => ({
  settingLevels: spec.resources.settingLevels,
  bet: String(spec.resources.bet),
  rows: spec.entities.filter((entity) => spec.components.ending?.[entity] === undefined).map((entity) => ({
    key: entity,
    label: spec.components.label?.[entity] ?? entity,
    kind: kindOf(spec, entity),
    of: spec.components.partOf?.[entity] ?? spec.components.watch?.[entity] ?? spec.components.cue?.[entity] ?? "",
    trials: spec.components.trials?.[entity] === undefined ? "" : String(spec.components.trials[entity]),
    payout: spec.components.payout?.[entity] === undefined ? "" : String(spec.components.payout[entity]),
    chances: Object.fromEntries([
      ...(spec.components.chance?.[entity] ?? spec.components.firstHit?.[entity] ?? spec.components.direct?.[entity] ?? []).map((each) => [String(each.settingLevel), chanceText(each.value)]),
      ...(spec.components.allotment?.[entity] ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)]),
    ]),
    chanceKind: [spec.components.sideBonus, spec.components.cz, spec.components.at].some((kind) => kind?.includes(entity) === true) && spec.components.chance?.[entity] !== undefined ? "below" : "combined",
    resetAllotment: Object.fromEntries((spec.components.resetAllotment?.[entity] ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)])),
    ...ceilingsOf(spec, entity),
    atCeiling: typedCount(spec.components.atCeiling?.[entity]),
    atUnitCeiling: typedCount(spec.components.atUnitCeiling?.[entity]),
    success: Object.fromEntries((spec.components.success?.[entity] ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)])),
    misses: spec.components.misses?.[entity] === undefined ? "" : String(spec.components.misses[entity]),
    net: (spec.components.cz?.includes(entity) === true || spec.components.sideBonus?.includes(entity) === true) && spec.components.netPerGame?.[entity] !== undefined ? String(spec.components.netPerGame[entity]) : "",
    trigger: czTriggerOf(spec, entity),
    bonusMiss: spec.components.restart?.includes(entity) === true ? "restarts" : "counted",
    forcedCz: spec.components.ceilingWins?.includes(entity) === true ? "wins" : "drawn",
    ceilingAt: spec.components.ceilingTriggers?.includes(entity) === true ? "triggered" : "outright",
    ceilingPayout: spec.components.ceilingPayout?.[entity] === undefined ? "" : String(spec.components.ceilingPayout[entity]),
    ceilingAcrossBonuses: typedCount(spec.components.ceilingAcrossBonuses?.[entity]),
    bonusShares: Object.fromEntries((spec.components.bonusShare?.[entity] ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)])),
    gates: (spec.components.gates?.[entity] ?? []).map(gateFormOf),
    redraw: redrawFormOf(spec.components.redraw?.[entity]),
    ceilingRedraw: redrawFormOf(spec.components.ceilingRedraw?.[entity]),
    triggerChances: Object.fromEntries((spec.components.triggerChance?.[entity] ?? []).map((each) => [String(each.settingLevel), chanceText(each.value)])),
    directBonuses: Object.fromEntries((spec.components.directBonus?.[entity] ?? []).map((each) => [String(each.settingLevel), chanceText(each.value)])),
    expiryGames: typedCount(spec.components.expiry?.[entity]?.games),
    expiryTo: spec.components.expiry?.[entity]?.to ?? "",
    sinceAtCeiling: spec.components.sinceAtCeiling?.[entity] === undefined ? "" : String(spec.components.sinceAtCeiling[entity]),
    resetSinceAtCeiling: typedCount(spec.components.resetSinceAtCeiling?.[entity]),
    meterFull: typedCount(spec.components.meter?.[entity]?.full),
    meterGains: (spec.components.meter?.[entity]?.gains ?? []).map((gain) => ({ points: String(gain.points), shares: Object.fromEntries(gain.share.map((each) => [String(each.settingLevel), String(each.value / 100)])) })),
    endings: endingsFormOf(spec, entity),
    endingAllotment: endingAllotmentFormOf(spec, entity),
    law: lawFormOf(spec, entity),
  })),
  base: spec.resources.base === undefined ? "" : String(spec.resources.base),
  lcdRate: spec.resources.lcdRate === undefined ? "" : String(spec.resources.lcdRate),
  unitName: spec.resources.ceilingUnit?.name ?? "",
  unitGames: spec.resources.ceilingUnit === undefined ? "" : String(Math.round(100 / spec.resources.ceilingUnit.perGame) / 100),
  cap: spec.resources.cap === undefined ? "" : String(spec.resources.cap),
})

/** The 機械割 a world states for an AT whose medals follow from it; none where no AT's do. */
const statedRates = (spec: SpecDto): readonly BySettingLevelDto<number>[] => Object.values(spec.components.rate ?? {})[0] ?? []

/**
 * Whether a basis states its 機械割 — measured, or given for an AT's medals
 * to follow from — rather than leaving it to come of the 解析値. Only the
 * form with a 機械割 to type can say such a basis again, whatever way its
 * formula was made.
 */
export const statesRate = (spec: SpecDto, conditions: ConditionsDto): boolean => conditions.payoutRate.type === "measured" || statedRates(spec).length > 0

/** A typed-in formula as typed again: its bonuses, and its 機械割 — as measured, or as its world states it. */
export const manualFormOf = (spec: SpecDto, conditions: ConditionsDto): ManualForm => ({
  world: worldFormOf(spec),
  rates: Object.fromEntries((conditions.payoutRate.type === "measured" ? conditions.payoutRate.bySettingLevel : statedRates(spec)).map((each) => [String(each.settingLevel), String(each.value / 100)])),
})
