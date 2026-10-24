import type { SettingLevelFigures } from "../../../core/pachislot/figures"
import { weighted, type Draws, type Drawn } from "../draws"

/** The setting levels a sample book's pachislot is played at: the high ones, 4 to 6. */
const HIGH_LEVELS = [4, 5, 6] as const

/**
 * The setting level a sitting's machine was at: one of its high levels,
 * 4 to 6, each as likely — a sample book plays the high settings and
 * nothing else — or its highest where it has none of them.
 */
export const settingLevelOf = (levels: readonly SettingLevelFigures[], draws: Draws): Drawn<SettingLevelFigures | undefined> => {
  const high = levels.filter((figures) => (HIGH_LEVELS as readonly number[]).includes(figures.settingLevel))
  const highest = levels.toSorted((left, right) => right.settingLevel - left.settingLevel)[0]
  const [drawn, next] = weighted(draws, high, () => 1)
  return [drawn ?? highest, next]
}
