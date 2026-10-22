import type { BalanceReport, EntryHead, Tag, Transaction } from "../../hledger/protocol/wire"
import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { YEN } from "../commodity/commodity"
import { ZERO, negate, sum, type Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import { PARLOR_ID_TAG, type ParlorId } from "../parlor/parlor"
import { SOURCE_TAGS } from "../import/source-tally"
import { TALLY_TAGS } from "../tally/tally"
import { readGameKind, type PlayGameKind, type PlayId } from "../play/play"
import { quantityIn, yenOf } from "./figures"

/** A tally as the journal holds it, read off its entry. */
export interface TallySummary {
  readonly id: PlayId
  readonly date: IsoDate
  readonly description: string
  readonly parlorId: ParlorId | undefined
  readonly gameKind: PlayGameKind | undefined
  readonly machine: string | undefined
  readonly cabinetNumber: string | undefined
  /** The app it was taken in from, where it was: its description is then that app's names for it. */
  readonly importedFrom: string | undefined
  /** The amount written on the entry's theoretical-value posting, as written. */
  readonly theoreticalValue: Decimal | undefined
  /** The amount written on the entry's inferred theoretical value, where the tally's play was weighed from what was told of it. */
  readonly inferredValue: Decimal | undefined
}

const tagValue = (tags: readonly Tag[], name: string): string | undefined => tags.find(([tag]) => tag === name)?.[1]

/** What an entry wrote on one statistics account, or undefined if it wrote nothing there. */
const statisticOf = (transaction: Transaction, account: string): Decimal | undefined => {
  const postings = transaction.tpostings.filter((posting) => posting.paccount === account)
  return postings.length === 0 ? undefined : sum(postings.map((posting) => quantityIn(posting.pamount, YEN)))
}

/** A tally as its entry's head says it: its id and its day, all that counting tallies and their days takes. */
export interface TallyDay {
  readonly id: PlayId
  readonly date: IsoDate
}

/** The tallies entries' heads record: a head without a `play-id` or with a day hledger should never have produced is no tally's. */
export const tallyDaysOf = (heads: readonly EntryHead[]): readonly TallyDay[] =>
  heads.flatMap((head) => {
    const id = tagValue(head.ttags, TALLY_TAGS.playId)
    const date = parseIsoDate(head.tdate)
    return id === undefined || id === "" || !date.ok ? [] : [{ id: id as PlayId, date: date.value }]
  })

/**
 * The tally an entry records, if it records one: an entry without a
 * `play-id` or with a day hledger should never have produced is not a tally.
 */
export const tallySummaryOf = (transaction: Transaction): TallySummary | undefined => {
  const id = tagValue(transaction.ttags, TALLY_TAGS.playId)
  const date = parseIsoDate(transaction.tdate)
  return id === undefined || id === "" || !date.ok
    ? undefined
    : {
        id: id as PlayId,
        date: date.value,
        description: transaction.tdescription,
        parlorId: tagValue(transaction.ttags, PARLOR_ID_TAG) as ParlorId | undefined,
        gameKind: readGameKind(tagValue(transaction.ttags, TALLY_TAGS.gameKind)),
        machine: tagValue(transaction.ttags, TALLY_TAGS.machine),
        cabinetNumber: tagValue(transaction.ttags, TALLY_TAGS.cabinetNumber),
        importedFrom: tagValue(transaction.ttags, SOURCE_TAGS.from),
        theoreticalValue: statisticOf(transaction, ACCOUNTS.theoreticalValue),
        inferredValue: statisticOf(transaction, ACCOUNTS.inferredTheoreticalValue),
      }
}

export const tallySummariesOf = (transactions: readonly Transaction[]): readonly TallySummary[] =>
  transactions.map(tallySummaryOf).filter((tally): tally is TallySummary => tally !== undefined)

/** A tally as a list shows it: what its entry says, and what it made where hledger could say — not where a token of it has no rate on its day. */
export interface ListedTally extends TallySummary {
  readonly actual: Decimal | undefined
}

/** What a row of an income statement comes to as a result, turned over as the statement is read; nothing where it is not all yen. */
const resultOf = (row: BalanceReport["prRows"][number]): Decimal | undefined => ((yen) => (yen.ok ? negate(yen.value) : undefined))(yenOf(row.prrTotal))

/**
 * Tallies with what each made, from an income statement of them pivoted
 * on the play's id: each row is one tally's, the figure hledger's. A tally the
 * statement has no row for came to nothing, hledger leaving out a row
 * that does.
 */
export const listedTalliesOf = (tallies: readonly TallySummary[], statement: BalanceReport): readonly ListedTally[] =>
  tallies.map((tally) => {
    const row = statement.prRows.find((each) => each.prrName === tally.id)
    return { ...tally, actual: row === undefined ? ZERO : resultOf(row) }
  })
