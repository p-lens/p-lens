import type { AnalysisDto, SpecDto } from "@p-lens/contracts/pachislot"

/** A bonus's odds under one setting, as an analysis sheet prints them: one in so many games. */
export interface BonusOdds {
  readonly id: string
  readonly label: string
  readonly oneIn: number
}

/**
 * What a pachislot formula comes to under one setting: its 機械割 and its
 * bonuses' odds, each and together. Everything shown of a formula and
 * everything a play is weighed against is read from these.
 */
export interface SettingLevelFigures {
  readonly settingLevel: number
  /** 機械割 as a ratio: `1.055` is 105.5%. */
  readonly payoutRate: number
  readonly bonuses: readonly BonusOdds[]
  /** 合算: one bonus of any kind in so many games. */
  readonly combinedOneIn: number
  /** On an AT machine: the medals an AT gains on average, and the share that reach the 有利区間's cap. */
  readonly at?: { readonly gain: number; readonly completion: number }
}

/**
 * Whether a setting level's 合算 says more than its bonuses one by one: on a
 * machine of bonuses that has several. An AT machine's 合算 is its AT's own
 * odds, its CZ's being no win, and one bonus's is that bonus's.
 */
export const combinedTellsMore = (figures: SettingLevelFigures): boolean => figures.at === undefined && figures.bonuses.length > 1

/** A bonus's label from the spec, or its id when the spec gives none. */
const labelOf = (spec: SpecDto, id: string): string => spec.components.label?.[id] || id

const oneIn = (chance: number): number => (chance > 0 ? 1 / chance : Number.POSITIVE_INFINITY)

/** Each setting's figures, read off what the engine solved, labelled by the spec. */
export const figuresFromAnalysis = (analysis: AnalysisDto, spec: SpecDto): readonly SettingLevelFigures[] =>
  analysis.settingLevels.map((figures) => ({
    settingLevel: figures.settingLevel,
    payoutRate: figures.payoutRate,
    bonuses: figures.bonuses.map((bonus) => ({ id: bonus.id, label: labelOf(spec, bonus.id), oneIn: oneIn(bonus.chance) })),
    combinedOneIn: oneIn(figures.combined),
    ...(figures.at === undefined ? {} : { at: figures.at }),
  }))
