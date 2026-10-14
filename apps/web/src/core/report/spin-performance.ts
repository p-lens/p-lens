import type { Transaction } from "../../hledger/protocol/wire"
import { ZERO, add, decimal, parseDecimal, quotient, type Decimal } from "../decimal/decimal"
import { TALLY_TAGS } from "../tally/tally"

/** The spin performances of some tallies, added up, and how many tallies they are: what an average is taken from, and what two books' are added by. */
export interface SpinSum {
  readonly total: Decimal
  readonly tallies: number
}

/** A machine's tallies' spin performances: those their plays' logs measured, and those tallies typed in by hand were inferred to have had, kept apart as the two are. */
export interface SpinPerformances {
  readonly measured: SpinSum
  readonly inferred: SpinSum
}

/** Each machine's, by the name a book keeps it under. */
export type SpinPerformancesByMachine = ReadonlyMap<string, SpinPerformances>

const NO_SUM: SpinSum = { total: ZERO, tallies: 0 }

const NONE: SpinPerformances = { measured: NO_SUM, inferred: NO_SUM }

const withOne = (sum: SpinSum, value: Decimal | undefined): SpinSum => (value === undefined ? sum : { total: add(sum.total, value), tallies: sum.tallies + 1 })

const together = (left: SpinPerformances, right: SpinPerformances): SpinPerformances => ({
  measured: { total: add(left.measured.total, right.measured.total), tallies: left.measured.tallies + right.measured.tallies },
  inferred: { total: add(left.inferred.total, right.inferred.total), tallies: left.inferred.tallies + right.inferred.tallies },
})

const tagged = (transaction: Transaction, name: string): string | undefined => transaction.ttags.find(([tag]) => tag === name)?.[1].trim()

const amountOf = (text: string | undefined): Decimal | undefined => ((read) => (read?.ok === true ? read.value : undefined))(text === undefined ? undefined : parseDecimal(text))

/** One tally's spin performances as its entry's tags say them. */
const performancesOf = (transaction: Transaction): SpinPerformances => ({
  measured: withOne(NO_SUM, amountOf(tagged(transaction, TALLY_TAGS.spinPerformance))),
  inferred: withOne(NO_SUM, amountOf(tagged(transaction, TALLY_TAGS.inferredSpinPerformance))),
})

const added = (byMachine: ReadonlyMap<string, SpinPerformances>, machine: string, performances: SpinPerformances): ReadonlyMap<string, SpinPerformances> =>
  new Map([...byMachine, [machine, together(byMachine.get(machine) ?? NONE, performances)]])

/**
 * Plays' spin performances by machine, from their entries: hledger keeps a
 * tag's value and does not add it up, so each tally's is read from its tags
 * and added here. A tally that names no machine is no machine's.
 */
export const spinPerformancesOf = (transactions: readonly Transaction[]): SpinPerformancesByMachine =>
  transactions.reduce<ReadonlyMap<string, SpinPerformances>>((byMachine, transaction) => {
    const machine = tagged(transaction, TALLY_TAGS.machine)
    return machine === undefined || machine === "" ? byMachine : added(byMachine, machine, performancesOf(transaction))
  }, new Map())

/** Several books' spin performances, each machine's added: books are read one at a time. */
export const mergedSpinPerformances = (books: readonly SpinPerformancesByMachine[]): SpinPerformancesByMachine =>
  books.reduce<ReadonlyMap<string, SpinPerformances>>((all, book) => [...book].reduce((sofar, [machine, performances]) => added(sofar, machine, performances), all), new Map())

/** Every machine's together: what a breakdown's total stands on. */
export const allSpinPerformances = (byMachine: SpinPerformancesByMachine): SpinPerformances => [...byMachine.values()].reduce(together, NONE)

/** The tallies' average, to a tenth as a spin performance is kept: none where there are no tallies to take one of. */
export const averageOf = (sum: SpinSum): Decimal | undefined => (sum.tallies === 0 ? undefined : quotient(sum.total, decimal(BigInt(sum.tallies), 0), 1))
