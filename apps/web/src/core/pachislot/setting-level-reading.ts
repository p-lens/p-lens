import type { WeightDto } from "@p-lens/contracts/pachislot"

/**
 * What a posterior over settings says, in the words players use: how likely a
 * high setting is, the setting the odds average to, and the single most
 * likely one. The engine gives the distribution; these only read it.
 */
export interface SettingLevelReading {
  /** 高設定期待度: the chance the setting is at least `threshold`. */
  readonly highShare: number
  readonly threshold: number
  /** 期待設定: the settings averaged by their chance, `3.22` and the like. */
  readonly averageSettingLevel: number
  /** 最有力: the most likely setting; where several are as likely as each other, the middle one of them, the lower where two are in the middle. */
  readonly mostLikely: number | undefined
}

/** The setting at or above which a cabinet is called high, as players do by default. */
const HIGH_FROM = 4

/** How near two chances must be to count as the same: what the engine's arithmetic leaves between levels it weighs alike. */
const AS_LIKELY = 1e-9

/**
 * The most likely setting level. Where several are as likely as each
 * other, none of them is the likeliest, and the highest would be said of
 * every cabinet nothing tells apart — a 設定6 of an even spread. The one
 * in their middle is said, the lower where two are: all six alike is 3,
 * which is where their average falls, read down and not up, since a play
 * is better weighed too low than too high.
 */
const middleOfTheLikeliest = (settingLevels: readonly WeightDto[]): number | undefined => {
  const top = Math.max(...settingLevels.map((weight) => weight.probability))
  const likeliest = settingLevels
    .filter((weight) => top - weight.probability <= AS_LIKELY)
    .map((weight) => weight.settingLevel)
    .toSorted((lower, higher) => lower - higher)
  return likeliest[Math.floor((likeliest.length - 1) / 2)]
}

export const readSettingLevels = (settingLevels: readonly WeightDto[], threshold: number = HIGH_FROM): SettingLevelReading => ({
  highShare: settingLevels.filter((weight) => weight.settingLevel >= threshold).reduce((sum, weight) => sum + weight.probability, 0),
  threshold,
  averageSettingLevel: settingLevels.reduce((sum, weight) => sum + weight.settingLevel * weight.probability, 0),
  mostLikely: middleOfTheLikeliest(settingLevels),
})
