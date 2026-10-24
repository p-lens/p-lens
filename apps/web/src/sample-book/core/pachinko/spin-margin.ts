import { between, type Draws, type Drawn } from "../draws"

/**
 * How far above a machine's border a sitting's spins come, as a share of
 * the border: told as +1 to +5 spins over a border of 18 a ¥1,000, and kept
 * as their share of 18 — about 6 to 28% — so a machine of any border is
 * played as far above it.
 */
const BORDER_TOLD = 18

const MARGIN = { low: 1 / BORDER_TOLD, high: 5 / BORDER_TOLD } as const

/** A sitting's share above its machine's border. */
export const spinMarginOf = (draws: Draws): Drawn<number> => between(draws, MARGIN.low, MARGIN.high)
