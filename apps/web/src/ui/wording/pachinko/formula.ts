import type { FormulaKind } from "../../../core/pachinko/formula"
import { formulaIdText } from "../catalog"

const KIND_NAMES: Readonly<Record<FormulaKind, string>> = { manual: "手入力", simulated: "基礎値から計算", sampled: "シミュレータ" }

export const kindName = (kind: FormulaKind): string => KIND_NAMES[kind]

/** A rate given as "one in": `3.333…` is `1/3.33`. */
export const oneInText = (oneIn: number): string => `1/${oneIn.toFixed(oneIn < 10 ? 2 : 1)}`

export const payoutText = (balls: number): string => `${balls.toFixed(1)}玉`

export const borderText = (spinPerformance: number): string => `${spinPerformance.toFixed(1)}回転/千円`

type Said = { readonly id: string; readonly figures: { readonly roundChanceOneIn: number; readonly payoutPerRound: number } }

/** The two figures the theoretical value rests on, which is what a formula is known by: `1/16.2・140.0玉`. */
export const formulaText = (figures: Said["figures"]): string => `${oneInText(figures.roundChanceOneIn)}・${payoutText(figures.payoutPerRound)}`

/**
 * A formula's name among its machine's: its figures — nobody names a
 * formula — and, where another says the same, its id.
 */
export const formulaNameAmong = (formula: Said, among: readonly Said[]): string => {
  const said = formulaText(formula.figures)
  const twins = among.filter((other) => formulaText(other.figures) === said)
  return twins.length > 1 ? `${said}（${formulaIdText(formula.id)}）` : said
}

/** A formula as it is passed on — "use this one": its id, which finds it, then its figures, which say what it is. */
export const formulaHandle = (formula: Said): string => `${formulaIdText(formula.id)} ${formulaText(formula.figures)}`

/** A mode as a list of destinations names it: by its name, or — until it is given one — by where it stands among the modes, モード2. */
export const modeTitle = (label: string, position: number): string => (label.trim() === "" ? `モード${position}` : label.trim())
