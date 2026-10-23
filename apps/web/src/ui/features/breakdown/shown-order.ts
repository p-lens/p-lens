import { compare } from "../../../core/decimal/decimal"
import { isRanked, type Dimension, type Group } from "../../../core/report/breakdown"
import { seal, Secret, veil } from "../../../mummer"

/**
 * Two groups by what they made, the better first, where how a book's
 * results stand beside each other may be seen; alike where 配信モード
 * veils it, so that the order of a list tells nothing the figures in it
 * do not.
 */
export const byShownResult = (left: Group, right: Group): number =>
  veil.scale(Secret.lift2(seal.tally(left.actual), seal.tally(right.actual), (first, second) => compare(second, first)), (order) => order, 0)

/** Groups best first as far as that may be seen, and by their keys beyond it. */
export const shownBestFirst = (groups: readonly Group[]): readonly Group[] => groups.toSorted((left, right) => byShownResult(left, right) || left.key.localeCompare(right.key))

/** Groups as a list shows them: a ranked dimension's best first as far as that may be seen, and time as it runs. */
export const shownOrder = (groups: readonly Group[], dimension: Dimension): readonly Group[] => (isRanked(dimension) ? shownBestFirst(groups) : groups)
