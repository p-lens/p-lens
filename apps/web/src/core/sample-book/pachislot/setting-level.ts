import type { SettingLevelFigures } from "../../pachislot/figures"
import type { SettingLevelShare } from "../../pachislot/formula"
import { weighted, type Draws, type Drawn } from "../draws"

/** How a parlor is taken to spread its setting levels where the machine has no 設定配分: most at the lowest, a few at the highest. */
const SPREAD_UNSTATED: Readonly<Record<number, number>> = {
  1: 50,
  2: 20,
  3: 15,
  4: 8,
  5: 5,
  6: 2,
}

/** The setting level a sitting's machine was at, drawn by the machine's 設定配分 where it has one, or by a spread most at the lowest. */
export const settingLevelOf = (levels: readonly SettingLevelFigures[], shares: readonly SettingLevelShare[] | undefined, draws: Draws): Drawn<SettingLevelFigures | undefined> => {
  const weightOf = (figures: SettingLevelFigures): number =>
    shares === undefined ? (SPREAD_UNSTATED[figures.settingLevel] ?? 1) : (shares.find((share) => share.settingLevel === figures.settingLevel)?.basisPoints ?? 0)
  const [drawn, next] = weighted(draws, levels, weightOf)
  return [drawn ?? levels[0], next]
}
