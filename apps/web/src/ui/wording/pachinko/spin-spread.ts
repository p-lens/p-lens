import type { SpinRange } from "../../../core/pachinko/spin-spread/spin-spread"

const rangeEndText = (perThousand: number | undefined): string => (perThousand === undefined ? "--" : perThousand.toFixed(1))

/** How sure a range is: `65%`, dashes until it can be said. */
export const coverageText = (range: SpinRange | undefined): string => `${range === undefined ? "--" : String(range.coveragePercent)}%`

/** Where a cabinet's own spin performance likely is, in two lines — `回転率は65%の確率で`, then `14.9〜22.6の範囲内` — dashes until it can be said. */
export const spinRangeLines = (range: SpinRange | undefined): readonly [string, string] => [
  `回転率は${coverageText(range)}の確率で`,
  `${rangeEndText(range?.low)}〜${rangeEndText(range?.high)}の範囲内`,
]

/** A range as the app's notes tabulate it: `14.9〜22.6`. */
export const spinRangeText = (range: SpinRange | undefined): string => `${rangeEndText(range?.low)}〜${rangeEndText(range?.high)}`
