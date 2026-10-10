import type { SettingLevelShare } from "../../../../core/pachislot/formula"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"
import { type FormProblem, hundredthsOf } from "./world-form"

/** A 設定配分 as typed: what it is a spread for, and each setting level's share in percent. */
export interface DistributionForm {
  readonly label: string
  readonly shares: Readonly<Record<string, string>>
}

export const EMPTY_DISTRIBUTION: DistributionForm = { label: "", shares: {} }

/** A 設定配分 as read: its label, and each setting level's share in hundredths of a percent. */
export interface ReadDistribution {
  readonly label: string
  readonly shares: readonly SettingLevelShare[]
}

/** A share left empty is none: a setting level the parlor is thought never to use. */
const shareOf = (text: string, level: number): Result<SettingLevelShare, FormProblem> => {
  if (tidyTyped(text) === "") return Ok({ settingLevel: level, basisPoints: 0 })
  const read = hundredthsOf(text.replace(/%$/, ""), `設定${level}`)
  if (!read.ok) return read
  return read.value > 10_000 ? Err({ field: `設定${level}`, reason: "out-of-range" }) : Ok({ settingLevel: level, basisPoints: read.value })
}

/** What the shares come to, in hundredths of a percent. */
export const sharesTotal = (form: DistributionForm, settingLevels: readonly number[]): number =>
  settingLevels.reduce((sum, level) => {
    const read = shareOf(form.shares[String(level)] ?? "", level)
    return read.ok ? sum + read.value.basisPoints : sum
  }, 0)

/**
 * A 設定配分 read for the setting levels the machine has: a label, and shares
 * that come to exactly 100%, checked in whole hundredths of a percent.
 */
export const readDistributionForm = (form: DistributionForm, settingLevels: readonly number[]): Result<ReadDistribution, readonly FormProblem[]> => {
  const label = tidyTyped(form.label)
  const shares = settingLevels.map((level) => shareOf(form.shares[String(level)] ?? "", level))
  const problems = [
    ...(label === "" ? [{ field: "名前", reason: "required" } as const] : []),
    ...shares.flatMap((read) => (read.ok ? [] : [read.error])),
  ]
  if (problems.length > 0) return Err(problems)
  const read = shares.flatMap((each) => (each.ok ? [each.value] : []))
  const total = read.reduce((sum, share) => sum + share.basisPoints, 0)
  return total === 10_000 ? Ok({ label, shares: read }) : Err([{ field: "合計", reason: "not-whole" }])
}
