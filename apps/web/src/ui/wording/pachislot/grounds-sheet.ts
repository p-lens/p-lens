import type { EventDto, SettingLevelFiguresDto } from "@p-lens/contracts/pachislot"

import type { Basis } from "../../../core/pachislot/formula"
import { figure, rounded, said, type GroundsPart } from "./grounds"

/**
 * Where a setting level's 機械割 comes from when no table of outcomes
 * traces it: typed in, stated by the analysis sheet with the AT's medals
 * worked back from it, or worked from the AT's medals and its 純増.
 */
type RateSource =
  | { readonly type: "measured" }
  | { readonly type: "stated"; readonly gain: number; readonly net: number }
  | { readonly type: "gained"; readonly gain: number; readonly net: number }

/** Where a setting level's 機械割 comes from, as its formula's 解析値 say. */
export const rateSourceOf = (basis: Basis, figures: SettingLevelFiguresDto): RateSource => {
  const rules = basis.normalized.atRules
  const net = rules?.netPerGame
  if (basis.conditions.payoutRate.type === "measured" || figures.at === undefined || rules === undefined || net === undefined) return { type: "measured" }
  const stated = basis.spec.components.rate?.[rules.at]?.some((each) => each.settingLevel === figures.settingLevel) === true
  return { type: stated ? "stated" : "gained", gain: figures.at.gain, net }
}

const CONTRIBUTION_DIGITS = 4

/** A value rounded as it is shown to so many places. */
const shown = (value: number, digits: number): number => rounded(value, digits)

/** Whether working from the figures shown comes to the figure shown next, to its places. */
const near = (worked: number, value: number, digits: number): boolean => Math.abs(worked - shown(value, digits)) <= 0.5 * 10 ** -digits * (1 + 1e-9)

const link = (exact: boolean): string => (exact ? " ＝ " : " ≈ ")

/** A value to so many places with any trailing noughts left off and a minus sign before it where it is below nought: `576.7`, `4`, `−0.025`. */
const upTo = (value: number, digits: number): string => {
  if (!Number.isFinite(value)) return "--"
  const kept = shown(value, digits)
  return `${kept < 0 ? "−" : ""}${String(Math.abs(kept))}`
}

/** A value to so many places, a minus sign before it where it is below nought. */
const fixed = (value: number, digits: number): string => (Number.isFinite(value) ? `${value < 0 ? "−" : ""}${shown(Math.abs(value), digits).toFixed(digits)}` : "--")

/** A value to so many places with its sign always written: `+0.1659`, `−1.5960`. */
const signed = (value: number, digits: number): string => (Number.isFinite(value) ? `${value < 0 ? "−" : "+"}${shown(Math.abs(value), digits).toFixed(digits)}` : "--")

/** A factor inside working after the words before it, bracketed close up to them where it is below nought. */
const factor = (before: string, value: number, digits: number): readonly (string | GroundsPart)[] =>
  value < 0 ? [before.trimEnd(), "（", figure(upTo(value, digits)), "）"] : [before, figure(upTo(value, digits))]

const perGameMedals = (value: number): string => `${signed(value, CONTRIBUTION_DIGITS)}枚`

/** A 機械割 as a ratio, to the places it is worked to and no further. */
const rateRatio = (ratio: number): string => upTo(ratio, CONTRIBUTION_DIGITS)

/** A 機械割 as a percent, from the ratio as it is shown, so that the two never read apart. */
const percent = (ratio: number): string => (Number.isFinite(ratio) ? `${upTo(shown(ratio, CONTRIBUTION_DIGITS) * 100, 2)}%` : "--")

/** The so many of one in so many, to five significant figures and the whole number past that; none where nothing comes up. */
const oneInWritten = (chance: number): string | undefined => {
  if (!Number.isFinite(chance) || chance <= 0) return undefined
  const oneIn = 1 / chance
  return oneIn >= 100_000 ? oneIn.toFixed(0) : oneIn.toPrecision(5)
}

const oneInText = (chance: number): string => {
  const written = oneInWritten(chance)
  return written === undefined ? "--" : `1/${written}`
}

/** A setting level's head: its 機械割 to up to two places of a percent and the medals a game comes to. */
export const headerParts = (payoutRate: number, netPerGame: number): readonly GroundsPart[] =>
  said("機械割 ", figure(percent(payoutRate)), "　1Gあたりの期待差枚 ", figure(perGameMedals(netPerGame)))

/** What a 機械割 no table traces is, by where it comes from. */
export const leadParts = (source: RateSource): readonly GroundsPart[] => {
  switch (source.type) {
    case "measured":
      return said("機械割は入力された値です。")
    case "stated":
      return said("機械割は解析値のとおりで、ATの平均獲得枚数 ", figure(`${upTo(source.gain, 1)}枚`), " は、それと純増 ", figure(`${upTo(source.net, 3)}枚/G`), " から導いた値です（下の計算根拠）。")
    case "gained":
      return said("機械割は、ATの平均獲得枚数 ", figure(`${upTo(source.gain, 1)}枚`), " と純増 ", figure(`${upTo(source.net, 3)}枚/G`), " から導いた値です（下の計算根拠）。")
  }
}

/** The medals a game comes to from a 機械割: the bet times what the 機械割 is above one, worked from the figures shown. */
export const expectedPerGameParts = (bet: number, payoutRate: number, netPerGame: number): readonly GroundsPart[] => {
  const excess = shown(shown(payoutRate, CONTRIBUTION_DIGITS) - 1, CONTRIBUTION_DIGITS)
  return said(
    "1Gあたりの期待差枚 ＝ ",
    figure(`${upTo(bet, 2)}枚`),
    " ×（機械割 ",
    figure(rateRatio(payoutRate)),
    " − 1）＝ ",
    figure(upTo(bet, 2)),
    ...factor(" × ", excess, CONTRIBUTION_DIGITS),
    link(near(bet * excess, netPerGame, CONTRIBUTION_DIGITS)),
    figure(perGameMedals(netPerGame)),
  )
}

/** A 機械割 from the medals its outcomes come to a game: one and those medals over the bet, worked from the figures shown, each step to its own sign. */
export const rateFromContributionsParts = (netPerGame: number, bet: number, payoutRate: number): readonly GroundsPart[] => {
  const quotient = shown(netPerGame, CONTRIBUTION_DIGITS) / bet
  const share = shown(quotient, CONTRIBUTION_DIGITS)
  return said(
    "機械割 ＝ 1 ＋ 期待差枚 ",
    figure(`${fixed(netPerGame, CONTRIBUTION_DIGITS)}枚`),
    " ÷ ",
    figure(`${upTo(bet, 2)}枚`),
    ...factor(link(near(quotient, share, CONTRIBUTION_DIGITS)) + "1 ＋ ", share, CONTRIBUTION_DIGITS),
    link(near(1 + share, payoutRate, CONTRIBUTION_DIGITS)),
    figure(rateRatio(payoutRate)),
    "（",
    figure(percent(payoutRate)),
    "）",
  )
}

/** The medals an outcome gains over the game it comes up on, net of the bet: none for a replay, the bet lost for a game that pays nothing, and none known for a bonus without its payout. */
export const outcomeGain = (id: string | undefined, events: readonly EventDto[], bet: number): number => {
  if (id === undefined) return -bet
  const kind = events.find((event) => event.id === id)?.kind
  if (kind === undefined) return Number.NaN
  switch (kind.type) {
    case "replay":
      return 0
    case "role":
      return kind.payout - bet
    case "bonus":
      return kind.payout === undefined ? Number.NaN : kind.payout - bet
  }
}

/** An outcome's chance, one in so many to five significant figures. */
export const chanceParts = (chance: number): readonly GroundsPart[] => said(figure(oneInText(chance)))

const gainText = (gain: number): string => {
  if (!Number.isFinite(gain)) return "--"
  return gain === 0 ? "0枚" : `${gain < 0 ? "−" : "+"}${upTo(Math.abs(gain), 2)}枚`
}

/** An outcome's medals net of the bet: `+5枚`, `0枚`, `−3枚`. */
export const gainParts = (gain: number): readonly GroundsPart[] => said(figure(gainText(gain)))

/** An outcome's share of a game's medals, nearly so where its chance and medals as shown do not give it. */
export const contributionParts = (chance: number, gain: number, contribution: number): readonly GroundsPart[] => {
  const written = oneInWritten(chance)
  const worked = written === undefined ? Number.NaN : gain / Number(written)
  return said(near(worked, contribution, CONTRIBUTION_DIGITS) ? "" : "≈ ", figure(perGameMedals(contribution)))
}

/** The outcomes' shares of a game's medals summed. */
export const totalParts = (netPerGame: number): readonly GroundsPart[] => said(figure(perGameMedals(netPerGame)))

/** A note that the shares are rounded, where those shown do not add up to the total shown. */
export const roundingNoteParts = (contributions: readonly number[], netPerGame: number): readonly GroundsPart[] => {
  const sum = contributions.reduce((total, each) => total + shown(each, CONTRIBUTION_DIGITS), 0)
  return near(sum, netPerGame, CONTRIBUTION_DIGITS) ? [] : said("各寄与は小数4桁に丸めています。")
}
