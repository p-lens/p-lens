/**
 * What one member brings to a huddle's settling up: what they spent — the
 * cash, and the savings they drew on, in yen — and the special prizes
 * they took home, in yen.
 */
export interface Contribution {
  readonly member: string
  readonly spent: number
  readonly prizes: number
}

/** One member settled: what they came to alone, and what they pay in (above nought) or are paid (below it) to come to their part. */
export interface Settled {
  readonly member: string
  readonly result: number
  readonly due: number
}

/** One payment of the settling up: who pays whom, and how much. */
export interface Transfer {
  readonly from: string
  readonly to: string
  readonly yen: number
}

/**
 * A huddle settled up evenly: what everyone came to together, each one's
 * share of it, each member settled, and the payments that settle them —
 * as few as the greatest owing paying the greatest owed, one after
 * another, comes to.
 */
export interface Settlement {
  readonly result: number
  readonly share: number
  readonly members: readonly Settled[]
  readonly transfers: readonly Transfer[]
}

/** The step every payment of a settling up is whole numbers of unless it is settled exactly: a thousand yen, notes passed by hand. */
export const SETTLING_STEP = 1_000

/**
 * What each member comes to once settled, whole steps away from what they
 * came to alone, so that every payment is whole steps: the most at or
 * below the even share each can come to so, and the steps left over
 * given one each to those who came to most, the first in the list among
 * equals — those who brought in most hold the odd yen. With a step of a
 * yen, it is the even share, the yen left over going the same way.
 */
const partsOf = (results: readonly number[], step: number): readonly number[] => {
  const whole = results.reduce((sum, each) => sum + each, 0)
  const bases = results.map((each) => each - step * Math.ceil((each * results.length - whole) / (step * results.length)))
  const left = (whole - bases.reduce((sum, each) => sum + each, 0)) / step
  const favoured = new Set(
    results
      .map((each, at) => ({ each, at }))
      .toSorted((one, other) => other.each - one.each)
      .slice(0, left)
      .map(({ at }) => at),
  )
  return bases.map((each, at) => each + (favoured.has(at) ? step : 0))
}

const byMostFirst = (one: Settled, other: Settled): number => Math.abs(other.due) - Math.abs(one.due)

/** The payments that settle those owing with those owed: the greatest of each paired, the lesser paid off, until nothing is owed. */
const transfersOf = (owing: readonly Settled[], owed: readonly Settled[]): readonly Transfer[] => {
  const [payer, ...payers] = owing.toSorted(byMostFirst)
  const [payee, ...payees] = owed.toSorted(byMostFirst)
  if (payer === undefined || payee === undefined) return []
  const yen = Math.min(payer.due, -payee.due)
  const rest = (settled: Settled, change: number): readonly Settled[] => (settled.due + change === 0 ? [] : [{ ...settled, due: settled.due + change }])
  return [{ from: payer.member, to: payee.member, yen }, ...transfersOf([...rest(payer, -yen), ...payers], [...rest(payee, yen), ...payees])]
}

/** A huddle's members settled up evenly, in the order given, every payment whole steps of yen; none where nobody is given. */
export const settlementOf = (contributions: readonly Contribution[], step: number): Settlement | undefined => {
  if (contributions.length === 0) return undefined
  const results = contributions.map((each) => each.prizes - each.spent)
  const result = results.reduce((sum, each) => sum + each, 0)
  const parts = partsOf(results, step)
  const members = contributions.map((each, at) => ({ member: each.member, result: results[at] ?? 0, due: (results[at] ?? 0) - (parts[at] ?? 0) }))
  return {
    result,
    share: Math.floor(result / contributions.length),
    members,
    transfers: transfersOf(
      members.filter((each) => each.due > 0),
      members.filter((each) => each.due < 0),
    ),
  }
}
