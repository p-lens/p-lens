import type { AnalysisDto, AtRulesDto, ComponentsDto, ProbabilityDto, SettingLevelFiguresDto, SpecDto } from "@p-lens/contracts/pachislot"

import { prologNumber } from "../../grounds/term"
import type { SettingLevelFigures } from "../figures"
import type { Basis } from "../formula"
import { atCeilingOf, missesOf } from "../path"

const given = (fact: string): string => `given(${fact}).`

/** Whether a formula's grounds can be reasoned: an AT machine whose 純増 ties its 機械割 to what its AT gains. */
export const reasonsGrounds = (basis: Basis): boolean => basis.normalized.atRules?.netPerGame !== undefined

/** The 機械割 a spec states for its AT under a setting level, as a ratio; none where the AT's medals are given another way. */
const statedRate = (spec: SpecDto, at: string, settingLevel: number): number | undefined => {
  const points = spec.components.rate?.[at]?.find((each) => each.settingLevel === settingLevel)?.value
  return points === undefined ? undefined : points / 10_000
}

/** A probability as an analysis sheet writes it, as a number. */
const chanceOf = (written: ProbabilityDto): number => (written.type === "ratio" ? (written.numerator * 100) / written.denominatorHundredths : written.basisPoints / 10_000)

/** What a spec says under one setting level, where it says anything. */
const under = <T>(values: readonly { readonly settingLevel: number; readonly value: T }[] | undefined, settingLevel: number): T | undefined =>
  values?.find((each) => each.settingLevel === settingLevel)?.value

/**
 * What an AT gains under a setting level as its sheet gives it: its payout,
 * its sets carried on at the level's 継続率, or the level's table of medals
 * and how often each comes. None where its medals are to follow from the
 * 機械割.
 */
const lawFacts = (spec: SpecDto, at: string, level: number): readonly string[] => {
  const sets = spec.components.sets?.[at]
  const carry = under(spec.components.continuationRate?.[at], level)
  if (sets !== undefined && carry !== undefined) return [given(`law(${level}, sets(${prologNumber(sets.first)}, ${prologNumber(sets.set)}, ${prologNumber(carry / 10_000)}))`)]
  const rows = under(spec.components.payoutTable?.[at], level)
  if (rows !== undefined) return [given(`law(${level}, table)`), ...rows.map((row) => given(`payout_row(${level}, ${prologNumber(row.medals)}, ${prologNumber(row.share / 10_000)})`))]
  const payout = spec.components.payout?.[at]
  return payout === undefined ? [] : [given(`law(${level}, fixed(${prologNumber(payout)}))`)]
}

/**
 * A setting level's facts: what the sheet publishes of it — the 初当たり of
 * the trigger, the CZ's success rate, the AT's medals or the 機械割 they are
 * to follow from — and what the engine came to: the trigger's chance below
 * its ceilings, which it read back from the 初当たり, the games of a cycle,
 * what the AT gains with the share that reach the cap, and the 機械割.
 */
const levelFacts = (figures: SettingLevelFiguresDto, spec: SpecDto, at: string, trigger: string | undefined, chance: number | undefined): readonly string[] => {
  const level = figures.settingLevel
  const cycle = figures.bonuses.find((bonus) => bonus.id === at)?.chance
  const published = under(spec.components.firstHit?.[trigger ?? at], level)
  const success = trigger === undefined ? undefined : under(spec.components.success?.[trigger], level)
  const bonusShare = trigger === undefined ? undefined : under(spec.components.bonusShare?.[trigger], level)
  const stated = statedRate(spec, at, level)
  return [
    given(`level(${level})`),
    ...(published === undefined ? [] : [given(`first_hit(${level}, ${prologNumber(chanceOf(published))})`)]),
    ...(chance === undefined ? [] : [given(`chance(${level}, ${prologNumber(chance)})`)]),
    ...(success === undefined ? [] : [given(`success(${level}, ${prologNumber((success / 10_000) * ((bonusShare ?? 10_000) / 10_000))})`)]),
    ...(success === undefined || bonusShare === undefined ? [] : [given(`staged(${level}, ${prologNumber(success / 10_000)}, ${prologNumber(bonusShare / 10_000)})`)]),
    ...(cycle === undefined ? [] : [given(`engine(cycle_games(${level}), ${prologNumber(1 / cycle)})`)]),
    ...(stated === undefined ? lawFacts(spec, at, level) : [given(`stated_rate(${level}, ${prologNumber(stated)})`)]),
    ...(figures.at === undefined ? [] : [given(`engine(gain(${level}), ${prologNumber(figures.at.gain)})`), given(`engine(completion(${level}), ${prologNumber(figures.at.completion)})`)]),
    given(`engine(rate(${level}), ${prologNumber(figures.payoutRate)})`),
    ...((triggerChance) => (cycle === undefined || triggerChance === undefined ? [] : [given(`engine(cycle_triggers(${level}), ${prologNumber(triggerChance / cycle)})`)]))(trigger === undefined ? undefined : figures.bonuses.find((bonus) => bonus.id === trigger)?.chance),
  ]
}

/**
 * The modes play is in between ATs, as the sheet gives them and in the
 * engine's order: each one's ceiling, as the sheet counts it, and its
 * AT間天井 in regular games, and under each setting level how often play
 * enters it after an AT and after a setting change. A machine without
 * modes has its trigger's ceiling as its one mode, and its ceilings after a
 * setting change — the trigger's where a setting change leaves it be — as
 * a second that only a setting change enters.
 */
const modeFacts = (spec: SpecDto, rules: AtRulesDto, levels: readonly number[]): readonly string[] => {
  const own = spec.components.mode ?? []
  const modes = rules.modes.map((mode) => mode.id)
  const trigger = rules.trigger ?? rules.at
  const ceilingOf = (mode: string, index: number): number | undefined =>
    own.includes(mode)
      ? spec.components.ceiling?.[mode]
      : index === 0
        ? spec.components.ceiling?.[trigger]
        : (spec.components.resetCeiling?.[trigger] ?? spec.components.ceiling?.[trigger])
  const share = (allotment: ComponentsDto["allotment"], mode: string, level: number): number | undefined => {
    const points = under(allotment?.[mode], level)
    return points === undefined ? undefined : points / 10_000
  }
  const allotted = (mode: string, index: number, level: number): readonly [number, number] => {
    if (!own.includes(mode)) return modes.length === 1 ? [1, 1] : index === 0 ? [1, 0] : [0, 1]
    const afterAt = share(spec.components.allotment, mode, level) ?? 0
    return [afterAt, share(spec.components.resetAllotment, mode, level) ?? afterAt]
  }
  return rules.modes.flatMap((mode, index) => [
    given(`mode(${index}, ${ceilingOf(mode.id, index) ?? "none"}, ${atCeilingOf(rules, mode) ?? "none"})`),
    ...levels.map((level) => given(`allotted(${level}, ${index}, ${allotted(mode.id, index, level).map(prologNumber).join(", ")})`)),
  ])
}

/**
 * The AT's 純増 as its spec gives it: its own, each share of its medals won
 * at another, and the 純増 over all of them as the engine normalised it, to
 * check against. An AT with no other 純増 has the one figure.
 */
const netFacts = (spec: SpecDto, at: string, overAll: number): readonly string[] => {
  const others = spec.components.otherNet?.[at] ?? []
  return [
    given(`net_per_game(${prologNumber(others.length === 0 ? overAll : (spec.components.netPerGame?.[at] ?? overAll))})`),
    ...others.map((other) => given(`other_net(${prologNumber(other.net)}, ${prologNumber(other.shareBasisPoints / 10_000)})`)),
    ...(others.length === 0 ? [] : [given(`engine(net, ${prologNumber(overAll)})`)]),
  ]
}

/** A sampled formula's 95% margin of the 機械割 it stores under a setting level. */
export interface SampledMargin {
  readonly settingLevel: number
  readonly payoutRateMargin: number
}

/** The 機械割 a formula stores under a setting level: exact, or for a sampled formula an estimate with its margin. */
const storedFact = (stored: SettingLevelFigures, margin: SampledMargin | undefined): string =>
  margin === undefined
    ? given(`stored(rate(${stored.settingLevel}), ${prologNumber(stored.payoutRate)})`)
    : given(`sampled(${stored.settingLevel}, ${prologNumber(stored.payoutRate)}, ${prologNumber(margin.payoutRateMargin)})`)

/**
 * The スルー天井: one for every mode, or where a スルー天井 is drawn after
 * each AT — a mode for each — each mode's own, in the engine's order.
 */
/** Whether a mode's trigger comes, once, on a game counted from the last AT: a cycle the reasoner takes from the engine, and says so. */
const forcedFacts = (rules: AtRulesDto): readonly string[] => (rules.modes.some((mode) => mode.sinceAtCeiling !== undefined) ? [given("forced_from_at")] : [])

/** Whether the AT is also won outright beside its CZ: a cycle the reasoner takes from the engine, and says so. */
const directFacts = (basis: Basis): readonly string[] => (basis.normalized.tables.some((table) => (table.at?.direct ?? 0) > 0) ? [given("direct_at")] : [])

const missesFacts = (rules: AtRulesDto): readonly string[] => {
  const each = rules.modes.map((mode) => missesOf(rules, mode))
  if (each.every((misses) => misses === each[0])) return each[0] === undefined ? [] : [given(`misses(${each[0]})`)]
  return [given("misses_by_mode"), ...each.map((misses, index) => given(`mode_misses(${index}, ${misses ?? "none"})`))]
}

/**
 * What the sheet says of the machine whatever the setting level: whether a
 * CZ brings its AT, with its スルー天井 and, where it is a bonus, its
 * medals and its 純増; the
 * 有利区間's cap, the games it carries on after an AT short of it, and
 * whether play starts again as after a setting change once an AT reaches
 * it; and the screen's games a regular game comes to, where ceilings are
 * counted on the screen.
 */
const machineFacts = (spec: SpecDto, rules: AtRulesDto): readonly string[] => {
  const { at, trigger } = rules
  const bonus = trigger === undefined ? undefined : spec.components.payout?.[trigger]
  const bonusNet = trigger === undefined ? undefined : spec.components.netPerGame?.[trigger]
  const window = spec.components.window?.[at]
  return [
    ...(trigger === undefined ? [] : [given("cz")]),
    ...missesFacts(rules),
    ...forcedFacts(rules),
    ...(bonus === undefined ? [] : [given(`trigger_payout(${prologNumber(bonus)})`)]),
    ...(bonus === undefined || bonusNet === undefined ? [] : [given(`trigger_net(${prologNumber(bonusNet)})`)]),
    ...(spec.resources.cap === undefined ? [] : [given(`cap(${prologNumber(spec.resources.cap)})`)]),
    ...(window === undefined ? [] : [given(`window(${window})`)]),
    ...(spec.components.resetOnCap?.includes(at) === true ? [given("reset_on_cap")] : []),
    ...(spec.resources.lcdRate === undefined ? [] : [given(`lcd_rate(${prologNumber(spec.resources.lcdRate)})`)]),
    ...(spec.resources.ceilingUnit === undefined ? [] : [given(`ceiling_unit(${prologNumber(spec.resources.ceilingUnit.perGame)})`)]),
  ]
}

/**
 * What the reasoner is told of an AT machine's formula, as Prolog facts:
 * its bet, its ベース as the engine normalised it and its 純増; what its
 * sheet says of the machine and of its modes; under each setting level
 * what its sheet publishes and what the engine came to; and the 機械割 the formula stores under each — for a
 * sampled formula, with its margin. Only numbers are written. Nothing
 * where the machine has no 純増: there is then nothing to reason a 機械割
 * from.
 */
export const groundsFacts = (basis: Basis, analysis: AnalysisDto, figures: readonly SettingLevelFigures[], margins: readonly SampledMargin[] | undefined): string => {
  const rules = basis.normalized.atRules
  if (rules?.netPerGame === undefined) return ""
  return [
    given(`bet(${prologNumber(basis.normalized.bet)})`),
    given(`base(${prologNumber(rules.base)})`),
    ...netFacts(basis.spec, rules.at, rules.netPerGame),
    ...machineFacts(basis.spec, rules),
    ...directFacts(basis),
    ...modeFacts(basis.spec, rules, analysis.settingLevels.map((solved) => solved.settingLevel)),
    ...analysis.settingLevels.flatMap((solved) => levelFacts(solved, basis.spec, rules.at, rules.trigger, basis.normalized.tables.find((table) => table.settingLevel === solved.settingLevel)?.at?.chance)),
    ...figures.map((stored) => storedFact(stored, margins?.find((margin) => margin.settingLevel === stored.settingLevel))),
  ].join("\n")
}
