import type { Tag, Transaction } from "../../hledger/protocol/wire"
import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { YEN } from "../commodity/commodity"
import { sum, type Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import { PARLOR_ID_TAG, type ParlorId } from "../parlor/parlor"
import { SOURCE_TAGS } from "../import/source-play"
import { PLAY_TAGS, type PlayGameKind, type PlayId } from "../play/play"
import { quantityIn } from "./figures"

/** A play as the journal holds it, read off its entry. */
export interface PlaySummary {
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
}

const tagValue = (tags: readonly Tag[], name: string): string | undefined => tags.find(([tag]) => tag === name)?.[1]

const gameKindOf = (text: string | undefined): PlayGameKind | undefined =>
  text === "pachinko" || text === "slot" ? text : undefined

/** What an entry wrote on one statistics account, or undefined if it wrote nothing there. */
const statisticOf = (transaction: Transaction, account: string): Decimal | undefined => {
  const postings = transaction.tpostings.filter((posting) => posting.paccount === account)
  return postings.length === 0 ? undefined : sum(postings.map((posting) => quantityIn(posting.pamount, YEN)))
}

/**
 * The play an entry records, if it records one: an entry without a `play-id`
 * or with a day hledger should never have produced is not a play.
 */
export const playSummaryOf = (transaction: Transaction): PlaySummary | undefined => {
  const id = tagValue(transaction.ttags, PLAY_TAGS.playId)
  const date = parseIsoDate(transaction.tdate)
  return id === undefined || id === "" || !date.ok
    ? undefined
    : {
        id: id as PlayId,
        date: date.value,
        description: transaction.tdescription,
        parlorId: tagValue(transaction.ttags, PARLOR_ID_TAG) as ParlorId | undefined,
        gameKind: gameKindOf(tagValue(transaction.ttags, PLAY_TAGS.gameKind)),
        machine: tagValue(transaction.ttags, PLAY_TAGS.machine),
        cabinetNumber: tagValue(transaction.ttags, PLAY_TAGS.cabinetNumber),
        importedFrom: tagValue(transaction.ttags, SOURCE_TAGS.from),
        theoreticalValue: statisticOf(transaction, ACCOUNTS.theoreticalValue),
      }
}

export const playSummariesOf = (transactions: readonly Transaction[]): readonly PlaySummary[] =>
  transactions.map(playSummaryOf).filter((play): play is PlaySummary => play !== undefined)
