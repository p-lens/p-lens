import type { BonusShape } from "@p-lens/contracts/pachinko"

import type { BonusField, BonusProblem } from "../../../core/catalog/bonuses"
import type { BonusNameProblem } from "../../../core/pachinko/bonuses"

/** What stands where a machine's 大当り確率 is not known: a row never shows a blank. */
const NO_HIT_CHANCE = "--/--"

/** A machine's 大当り確率 as a row shows it. */
export const hitChanceText = (hitChance: string | undefined): string => hitChance ?? NO_HIT_CHANCE

/** A bonus's fields as its row heads them. */
export const BONUS_FIELDS: Readonly<Record<BonusField, string>> = { name: "ボーナス名", payout: "払出", spent: "消費", jackpots: "大当り回数" }

/** What a row of a formula's bonuses, as typed, is wrong with, under the rows. */
export const describeBonusProblem = (problem: BonusProblem): string => {
  const where = `${problem.row + 1}行目の${BONUS_FIELDS[problem.field]}`
  switch (problem.type) {
    case "missing":
      return `${where}が未入力です。`
    case "name-too-long":
      return `${where}は${problem.longest}文字までです。`
    case "repeated":
      return `${where}が重なっています。`
    case "not-a-count":
      return `${where}は整数で入れてください。`
    case "too-large":
      return `${where}は${problem.most.toLocaleString("ja-JP")}${problem.field === "jackpots" ? "回" : "玉"}までです。`
    case "not-below-payout":
      return `${where}は払出より少なくしてください。`
  }
}

/** What a bonus's name, as typed for its rounds, is wrong with, under the rows. */
export const describeBonusNameProblem = (problem: BonusNameProblem): string => {
  const where = `${problem.index + 1}行目の${BONUS_FIELDS.name}`
  return problem.type === "repeated" ? `${where}が重なっています。` : `${where}は${problem.longest}文字までです。`
}

/** The rounds a bonus is told by, as a spec sheet writes them: `10R×15個×10C`, one run of rounds after another. */
export const bonusRoundsText = (shape: BonusShape): string => shape.rounds.map((each) => `${each.rounds}R×${each.prizeBalls}個×${each.count}C`).join(" ＋ ")

/** How many jackpots a bonus is won over, said only where it is more than one: `大当り5回分`. */
export const jackpotsText = (won: { readonly jackpots?: number }): string | undefined => (won.jackpots === undefined || won.jackpots === 1 ? undefined : `大当り${String(won.jackpots)}回分`)
