import { SPREAD_COVERAGE_PERCENT, type SpinRange } from "../../../core/pachinko/spin-spread/spin-spread"

const rangeEndText = (perThousand: number | undefined): string => (perThousand === undefined ? "--" : perThousand.toFixed(1))

/** Where a cabinet's own spin performance likely is, in two lines — `回転率は90%の確率で`, then `16.3〜20.5の範囲内` — dashes until it can be said. */
export const spinRangeLines = (range: SpinRange | undefined): readonly [string, string] => [
  `回転率は${String(SPREAD_COVERAGE_PERCENT)}%の確率で`,
  `${rangeEndText(range?.low)}〜${rangeEndText(range?.high)}の範囲内`,
]

/** How far either side a spin performance's range reaches: `±1.3`. */
export const spreadText = (spread: number | undefined): string => (spread === undefined ? "--" : `±${spread.toFixed(1)}`)
