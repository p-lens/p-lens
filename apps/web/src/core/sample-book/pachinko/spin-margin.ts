import { between, weighted, type Draws, type Drawn } from "../draws"

/**
 * How far above a machine's border a sitting's spins come, as a share of
 * the border: told as spins over a border of 18 a ¥1,000 — +1 to +5 most
 * days, +10 now and then, +12 rarely — and kept as their share of 18, so a
 * machine of any border is played as far above it.
 */
const BORDER_TOLD = 18

const MARGINS: readonly {
  readonly low: number
  readonly high: number
  readonly weight: number
}[] = [
  { low: 1 / BORDER_TOLD, high: 5 / BORDER_TOLD, weight: 94 },
  { low: 10 / BORDER_TOLD, high: 10 / BORDER_TOLD, weight: 5 },
  { low: 12 / BORDER_TOLD, high: 12 / BORDER_TOLD, weight: 1 },
]

/** A sitting's share above its machine's border. */
export const spinMarginOf = (draws: Draws): Drawn<number> => {
  const [margin, next] = weighted(draws, MARGINS, (choice) => choice.weight)
  return margin === undefined ? [0, next] : between(next, margin.low, margin.high)
}
