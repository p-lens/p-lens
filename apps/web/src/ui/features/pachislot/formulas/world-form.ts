import type { BySettingLevelDto, ConditionsDto, OtherNetDto, SpecDto, PayoutRowDto, ProbabilityDto } from "@p-lens/contracts/pachislot"
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
export type EntityKindName = "bonus" | "part" | "role" | "replay" | "at" | "cz" | "mode" | "watch" | "cue"

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
  /** The trigger's 天井 in regular games — an AT's, a CZ's or a mode's — or an AT's AT間天井 where a CZ brings it, as typed; empty for none. */
  readonly ceiling: string
  /** The trigger's ceiling after a setting change, as typed; empty for the same as ever. */
  readonly resetCeiling: string
  /** A mode's own AT間天井 where a CZ brings the AT, as typed; empty for the AT's. */
  readonly atCeiling: string
  /** A CZ's chance of winning the AT, in percent by the level. */
  readonly success: Readonly<Record<string, string>>
  /** A CZ's スルー天井: the misses after which the next CZ wins the AT, as typed; empty for none. */
  readonly misses: string
  /** A mode's 振り分け after a setting change, in percent by the level; empty for the same as after an AT. */
  readonly resetAllotment: Readonly<Record<string, string>>
  /** An AT's medals beyond their average, and its 有利区間. */
  readonly law: AtLawForm
}

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
  ceiling: "",
  resetCeiling: "",
  atCeiling: "",
  resetAllotment: {},
  success: {},
  misses: "",
  law: EMPTY_LAW,
})

/** Where a 解析値 starts: the six levels, three medals a game, and an A-type's usual rows. */
export const STARTING_WORLD: WorldForm = {
  settingLevels: ALL_SETTING_LEVELS,
  bet: "3",
  rows: [row("big", "BIG", "bonus"), row("reg", "REG", "bonus"), row("grape", "ブドウ", "role"), row("cherry", "チェリー", "role"), row("replay", "リプレイ", "replay")],
  base: "",
  lcdRate: "",
  cap: "",
}

/** Where a typed-in formula starts: BIG and REG, and a 機械割 for each level. */
export const STARTING_MANUAL: ManualForm = {
  world: { settingLevels: ALL_SETTING_LEVELS, bet: "3", rows: [row("big", "BIG", "bonus"), row("reg", "REG", "bonus")], base: "", lcdRate: "", cap: "" },
  rates: {},
}

/** Where a typed-in formula of an AT machine starts: its AT, its ベース, and a 機械割 for each level. */
export const STARTING_AT_MANUAL: ManualForm = {
  world: { settingLevels: ALL_SETTING_LEVELS, bet: "3", rows: [row("at", "AT", "at")], base: "", lcdRate: "", cap: "" },
  rates: {},
}

/** Whether a world is of an AT machine: its AT, its modes if it has them, and its ベース, nothing else. */
export const isAtMachine = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "at")

/** Whether a CZ brings an AT machine's AT. */
export const hasCz = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "cz")

/** Whether an AT machine's ceilings are its modes'. */
export const hasModes = (form: WorldForm): boolean => form.rows.some((each) => each.kind === "mode")

/** A key no row has yet. */
export const freshKey = (rows: readonly EntityRow[]): string => {
  const used = new Set(rows.map((each) => each.key))
  const next = (count: number): string => (used.has(`e${count}`) ? next(count + 1) : `e${count}`)
  return next(rows.length + 1)
}

export const newRow = (rows: readonly EntityRow[], kind: EntityKindName): EntityRow => row(freshKey(rows), "", kind)

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
  readonly resetAllotment: readonly BySettingLevelDto<number>[] | undefined
  readonly success: readonly BySettingLevelDto<number>[] | undefined
  readonly misses: number | undefined
  /** A watch's trials, where more than one. */
  readonly trials: number | undefined
  readonly law: ReadLaw | undefined
}

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

const readRow = (form: WorldForm, entity: EntityRow, payoutRule: (entity: EntityRow) => PayoutRule): Result<ReadRow, readonly FormProblem[]> => {
  const name = nameOf(entity)
  const label: Read<string> = entity.label.trim() === "" ? Err({ field: "名前", reason: "required" }) : Ok(entity.label.trim())
  const isMode = entity.kind === "mode"
  const isCz = entity.kind === "cz"
  const brought = entity.kind === "at" && hasCz(form)
  const isWatch = entity.kind === "watch"
  const hasChance = !isMode && !isWatch && !brought && !(entity.kind === "bonus" && splitBonuses(form).has(entity.key))
  const chances: readonly Read<BySettingLevelDto<ProbabilityDto>>[] = hasChance
    ? form.settingLevels.map((level) => {
        const read = chanceOf(entity.chances[String(level)] ?? "", `${name}${isCz ? " 合算" : ""} 設定${level}`)
        return read.ok ? Ok({ settingLevel: level, value: read.value }) : read
      })
    : []
  const allotment = isMode ? (sharesOf(form, entity.chances, `${name} 振り分け`, false) ?? []) : []
  const resetAllotment = isMode ? sharesOf(form, entity.resetAllotment, `${name} リセット時の振り分け`, true) : undefined
  const success = isCz ? (sharesOf(form, entity.success, `${name} 成功率`, false) ?? []) : []
  const misses = isCz ? ceilingOf(entity.misses, `${name} スルー天井`) : Ok(undefined)
  const rule = payoutRule(entity)
  const payout: Read<number | undefined> =
    rule === "none" || (rule === "optional" && tidyTyped(entity.payout) === "") ? Ok(undefined) : medalsOf(entity.payout, `${name} 枚数`)
  const of = ofRead(form, entity, name)
  const trials = isWatch ? trialsOf(entity.trials, `${name} ボーナス1回の回数`) : Ok(undefined)
  const ceiling = entity.kind === "at" || isCz || isMode ? ceilingOf(entity.ceiling, `${name} ${brought ? "AT間天井" : "天井"}`) : Ok(undefined)
  const resetCeiling =
    (entity.kind === "at" && !hasModes(form)) || isCz ? ceilingOf(entity.resetCeiling, `${name} ${brought ? "リセット後のAT間天井" : "リセット後の天井"}`) : Ok(undefined)
  const atCeiling = isMode && hasCz(form) ? ceilingOf(entity.atCeiling, `${name} AT間天井`) : Ok(undefined)
  const law = entity.kind === "at" ? readLaw(form, entity, name) : Ok(undefined)
  const problems = [
    ...problemsOf([label, payout, of, trials, ceiling, resetCeiling, atCeiling, misses, ...chances, ...allotment, ...(resetAllotment ?? []), ...success]),
    ...(law.ok ? [] : law.error),
  ]
  if (problems.length > 0 || !law.ok) return Err(problems)
  return Ok({
    entity,
    chance: hasChance ? valuesOf(chances) : undefined,
    allotment: isMode ? valuesOf(allotment) : undefined,
    payout: payout.ok ? payout.value : undefined,
    ceiling: ceiling.ok ? ceiling.value : undefined,
    resetCeiling: resetCeiling.ok ? resetCeiling.value : undefined,
    atCeiling: atCeiling.ok ? atCeiling.value : undefined,
    resetAllotment: resetAllotment === undefined ? undefined : valuesOf(resetAllotment),
    success: isCz ? valuesOf(success) : undefined,
    misses: misses.ok ? misses.value : undefined,
    trials: trials.ok ? trials.value : undefined,
    law: law.value,
  })
}

/** The world the rows make: a table per component, keyed by each row's key. */
/** What only an AT machine has: its ベース, and its screen's rate and 有利区間の上限 where it has them. */
interface MachineResources {
  readonly base: number
  readonly lcdRate: number | undefined
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
  const parts = owned("part")
  const watches = owned("watch")
  const cues = owned("cue")
  const trials = keyed((read) => read.trials)
  const isAt = (read: ReadRow): boolean => read.entity.kind === "at"
  const isCz = (read: ReadRow): boolean => read.entity.kind === "cz"
  const isMode = (read: ReadRow): boolean => read.entity.kind === "mode"
  const firstHits = keyed((read) => (isAt(read) || isCz(read) ? read.chance : undefined))
  const successes = keyed((read) => read.success)
  const misses = keyed((read) => read.misses)
  const ceilings = keyed((read) => read.ceiling)
  const resetCeilings = keyed((read) => read.resetCeiling)
  const resetAllotments = keyed((read) => read.resetAllotment)
  const atCeilings = keyed((read) => read.atCeiling)
  const sets = keyed((read) => read.law?.sets)
  const carries = keyed((read) => read.law?.continuationRate)
  const tables = keyed((read) => read.law?.table)
  const nets = keyed((read) => read.law?.net)
  const otherNets = keyed((read) => read.law?.otherNets)
  const windows = keyed((read) => read.law?.window)
  const resetOnCap = rows.filter((read) => read.law?.resetOnCap === true).map((read) => read.entity.key)
  return {
    v: SPEC_VERSION,
    entities: rows.map((read) => read.entity.key),
    components: {
      label: keyed((read) => read.entity.label.trim()),
      ...(rows.some((read) => !isAt(read) && !isCz(read) && !isMode(read) && read.entity.kind !== "watch") ? { chance: keyed((read) => (isAt(read) || isCz(read) ? undefined : read.chance)) } : {}),
      ...(rows.some((read) => read.payout !== undefined) ? { payout: keyed((read) => read.payout) } : {}),
      ...(listed("bonus").length > 0 ? { bonus: listed("bonus") } : {}),
      ...(listed("replay").length > 0 ? { replay: listed("replay") } : {}),
      ...(Object.keys(parts).length > 0 ? { partOf: parts } : {}),
      ...(listed("at").length > 0 ? { at: listed("at") } : {}),
      ...(listed("cz").length > 0 ? { cz: listed("cz"), success: successes } : {}),
      ...(Object.keys(firstHits).length > 0 ? { firstHit: firstHits } : {}),
      ...(Object.keys(misses).length > 0 ? { misses } : {}),
      ...(Object.keys(ceilings).length > 0 ? { ceiling: ceilings } : {}),
      ...(Object.keys(resetCeilings).length > 0 ? { resetCeiling: resetCeilings } : {}),
      ...(listed("mode").length > 0 ? { mode: listed("mode"), allotment: keyed((read) => read.allotment) } : {}),
      ...(Object.keys(resetAllotments).length > 0 ? { resetAllotment: resetAllotments } : {}),
      ...(Object.keys(atCeilings).length > 0 ? { atCeiling: atCeilings } : {}),
      ...(Object.keys(sets).length > 0 ? { sets, continuationRate: carries } : {}),
      ...(Object.keys(tables).length > 0 ? { payoutTable: tables } : {}),
      ...(Object.keys(nets).length > 0 ? { netPerGame: nets } : {}),
      ...(Object.keys(otherNets).length > 0 ? { otherNet: otherNets } : {}),
      ...(Object.keys(windows).length > 0 ? { window: windows } : {}),
      ...(resetOnCap.length > 0 ? { resetOnCap } : {}),
      ...(Object.keys(watches).length > 0 ? { watch: watches } : {}),
      ...(Object.keys(trials).length > 0 ? { trials } : {}),
      ...(Object.keys(cues).length > 0 ? { cue: cues } : {}),
    },
    resources: {
      settingLevels: form.settingLevels.toSorted((left, right) => left - right),
      bet,
      ...(at === undefined ? {} : { base: at.base }),
      ...(at?.lcdRate === undefined ? {} : { lcdRate: at.lcdRate }),
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
  const cap = at ? ceilingOf(form.cap, "有利区間の上限") : Ok(undefined)
  const rows = form.rows.map((entity) => readRow(form, entity, payoutRule))
  const problems = [...problemsOf([levels, bet, bonuses, base, lcdRate, cap]), ...rows.flatMap((read) => (read.ok ? [] : read.error))]
  if (problems.length > 0 || !bet.ok || !base.ok || !lcdRate.ok || !cap.ok) return Err(problems)
  const machine = base.value === undefined ? undefined : { base: base.value, lcdRate: lcdRate.value, cap: cap.value }
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
  const spec = readRows(form, (entity) => (entity.kind === "bonus" || entity.kind === "role" ? "required" : "none"))
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
  const spec = readRows(form.world, (entity) => (entity.kind === "bonus" ? "optional" : entity.kind === "at" && entity.law.shape === "average" ? "required" : "none"))
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

/** A stored world as rows again, for a formula remade from it. */
export const worldFormOf = (spec: SpecDto): WorldForm => ({
  settingLevels: spec.resources.settingLevels,
  bet: String(spec.resources.bet),
  rows: spec.entities.map((entity) => ({
    key: entity,
    label: spec.components.label?.[entity] ?? entity,
    kind: kindOf(spec, entity),
    of: spec.components.partOf?.[entity] ?? spec.components.watch?.[entity] ?? spec.components.cue?.[entity] ?? "",
    trials: spec.components.trials?.[entity] === undefined ? "" : String(spec.components.trials[entity]),
    payout: spec.components.payout?.[entity] === undefined ? "" : String(spec.components.payout[entity]),
    chances: Object.fromEntries([
      ...(spec.components.chance?.[entity] ?? spec.components.firstHit?.[entity] ?? []).map((each) => [String(each.settingLevel), chanceText(each.value)]),
      ...(spec.components.allotment?.[entity] ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)]),
    ]),
    resetAllotment: Object.fromEntries((spec.components.resetAllotment?.[entity] ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)])),
    ceiling: spec.components.ceiling?.[entity] === undefined ? "" : String(spec.components.ceiling[entity]),
    resetCeiling: spec.components.resetCeiling?.[entity] === undefined ? "" : String(spec.components.resetCeiling[entity]),
    atCeiling: spec.components.atCeiling?.[entity] === undefined ? "" : String(spec.components.atCeiling[entity]),
    success: Object.fromEntries((spec.components.success?.[entity] ?? []).map((each) => [String(each.settingLevel), String(each.value / 100)])),
    misses: spec.components.misses?.[entity] === undefined ? "" : String(spec.components.misses[entity]),
    law: lawFormOf(spec, entity),
  })),
  base: spec.resources.base === undefined ? "" : String(spec.resources.base),
  lcdRate: spec.resources.lcdRate === undefined ? "" : String(spec.resources.lcdRate),
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
