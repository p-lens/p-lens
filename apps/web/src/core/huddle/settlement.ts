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

/** One member settled: what they came to alone, and what they pay in (above nought) or are paid (below it) to come to the share. */
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

/**
 * Each member's share of a whole, in whole yen: the whole divided evenly,
 * rounded down, and the yen left over given one each to the members first
 * in the list, so that the shares come to the whole exactly.
 */
const sharesOf = (whole: number, count: number): readonly number[] => {
  const each = Math.floor(whole / count)
  const left = whole - each * count
  return Array.from({ length: count }, (_, at) => each + (at < left ? 1 : 0))
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

/** A huddle's members settled up evenly, in the order given; none where nobody is given. */
export const settlementOf = (contributions: readonly Contribution[]): Settlement | undefined => {
  if (contributions.length === 0) return undefined
  const results = contributions.map((each) => each.prizes - each.spent)
  const result = results.reduce((sum, each) => sum + each, 0)
  const shares = sharesOf(result, contributions.length)
  const members = contributions.map((each, at) => ({ member: each.member, result: results[at] ?? 0, due: (results[at] ?? 0) - (shares[at] ?? 0) }))
  return {
    result,
    share: shares.at(-1) ?? 0,
    members,
    transfers: transfersOf(
      members.filter((each) => each.due > 0),
      members.filter((each) => each.due < 0),
    ),
  }
}
