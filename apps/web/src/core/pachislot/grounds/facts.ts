import type { AnalysisDto, SettingLevelFiguresDto, SpecDto } from "@p-lens/contracts/pachislot"

import { prologNumber } from "../../grounds/term"
import type { Basis } from "../formula"

const given = (fact: string): string => `given(${fact}).`

/** Whether a formula's grounds can be reasoned: an AT machine whose 純増 ties its 機械割 to what its AT gains. */
export const reasonsGrounds = (basis: Basis): boolean => basis.normalized.atRules?.netPerGame !== undefined

/** The 機械割 a spec states for its AT under a setting level, as a ratio; none where the AT's medals are given another way. */
const statedRate = (spec: SpecDto, at: string, settingLevel: number): number | undefined => {
  const points = spec.components.rate?.[at]?.find((each) => each.settingLevel === settingLevel)?.value
  return points === undefined ? undefined : points / 10_000
}

const levelFacts = (figures: SettingLevelFiguresDto, spec: SpecDto, at: string): readonly string[] => {
  const level = figures.settingLevel
  const chance = figures.bonuses.find((bonus) => bonus.id === at)?.chance
  const stated = statedRate(spec, at, level)
  return [
    given(`level(${level})`),
    ...(chance === undefined ? [] : [given(`cycle_games(${level}, ${prologNumber(1 / chance)})`)]),
    ...(figures.at === undefined ? [] : [given(`gain(${level}, ${prologNumber(figures.at.gain)})`), given(`engine(gain(${level}), ${prologNumber(figures.at.gain)})`)]),
    ...(stated === undefined ? [] : [given(`stated_rate(${level}, ${prologNumber(stated)})`)]),
    given(`engine(rate(${level}), ${prologNumber(figures.payoutRate)})`),
  ]
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

/**
 * What the reasoner is told of an AT machine's formula, as Prolog facts:
 * its bet, its ベース as the engine normalised it and its 純増, and under
 * each setting level the regular games a cycle lasts and what the AT gains
 * as the engine solved them, the 機械割 its spec states where the AT's
 * medals are to follow from it, and the engine's own figures to check
 * against. Nothing where the machine has no 純増: there is then nothing to
 * reason a 機械割 from.
 */
export const groundsFacts = (basis: Basis, analysis: AnalysisDto): string => {
  const rules = basis.normalized.atRules
  if (rules?.netPerGame === undefined) return ""
  return [
    given(`bet(${prologNumber(basis.normalized.bet)})`),
    given(`base(${prologNumber(rules.base)})`),
    ...netFacts(basis.spec, rules.at, rules.netPerGame),
    ...analysis.settingLevels.flatMap((figures) => levelFacts(figures, basis.spec, rules.at)),
  ].join("\n")
}
