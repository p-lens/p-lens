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
  /** 最有力: the most likely setting, the higher on a tie. */
  readonly mostLikely: number | undefined
}

/** The setting at or above which a cabinet is called high, as players do by default. */
const HIGH_FROM = 4

export const readSettingLevels = (settingLevels: readonly WeightDto[], threshold: number = HIGH_FROM): SettingLevelReading => ({
  highShare: settingLevels.filter((weight) => weight.settingLevel >= threshold).reduce((sum, weight) => sum + weight.probability, 0),
  threshold,
  averageSettingLevel: settingLevels.reduce((sum, weight) => sum + weight.settingLevel * weight.probability, 0),
  mostLikely: settingLevels.reduce<WeightDto | undefined>(
    (best, weight) => (best === undefined || weight.probability >= best.probability ? weight : best),
    undefined,
  )?.settingLevel,
})
