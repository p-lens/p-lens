import type { IsoDate } from "../calendar/calendar"
import { tokenCommodity } from "../commodity/commodity"
import { openingText } from "../parlor/opening"
import type { PlayGameKind, PlayId } from "../play/play"
import { Ok, mapOk, type Result } from "../result/result"
import { renderPricePoint, type PricePoint } from "../valuation/valuation"
import { dayOf, type DayPlayed, type DayProblem, type Lineup, type Playing, type Savings } from "./day"
import { drawsFrom, type Draws } from "./draws"
import { cornerRateOn, type SampleParlor } from "./parlors"
import { playDaysOf } from "./schedule"

/** What a sample book is made from, as it can be handed to another thread: its days, its parlors and machines, and the seed its draws are drawn from. */
export interface SampleWork {
  readonly from: IsoDate
  readonly through: IsoDate
  readonly parlors: readonly SampleParlor[]
  readonly lineup: Lineup
  readonly seed: string
}

/** A sample book's work, with how its plays are given ids. */
export interface SampleOrder extends SampleWork {
  readonly playIdOn: (date: IsoDate, index: number) => PlayId
}

/** A sample book as far as it has been made: the days to play, how many are played, what savings hold, and its draws. */
export interface Making {
  readonly days: readonly IsoDate[]
  readonly at: number
  readonly savings: Savings
  readonly draws: Draws
}

const GAME_KINDS: readonly PlayGameKind[] = ["pachinko", "pachislot"]

/** Every exchange rate of the parlors, as the book's prices keep them. */
const pricesOf = (parlors: readonly SampleParlor[]): readonly PricePoint[] =>
  parlors.flatMap((sample) =>
    GAME_KINDS.flatMap((gameKind) => {
      const corner = sample.corners[gameKind]
      return corner.rates.map((rate) => ({
        date: rate.from,
        commodity: tokenCommodity(corner.pool.kind, sample.parlor.name, corner.pool.tier),
        rate: rate.rate,
      }))
    }),
  )

/** What a sample book's accounts and prices begin with: every parlor's pools declared, and every rate they are exchanged at. */
export const openingOf = (order: SampleWork): { readonly declarations: string; readonly prices: string } => ({
  declarations: order.parlors
    .flatMap((sample) =>
      GAME_KINDS.map(
        (gameKind) =>
          openingText(
            {
              identity: sample.parlor.identity,
              parlorName: sample.parlor.name,
              pool: sample.corners[gameKind].pool,
              rate: cornerRateOn(sample.corners[gameKind], order.from),
              date: order.from,
            },
            [],
            [],
          ).declarations ?? "",
      ),
    )
    .join(""),
  prices: pricesOf(order.parlors)
    .toSorted((left, right) => left.date.localeCompare(right.date))
    .map(renderPricePoint)
    .join(""),
})

/** A sample book about to be made: its days drawn, none played yet. */
export const makingOf = (order: SampleOrder): Making => {
  const [days, draws] = playDaysOf(order.from, order.through, drawsFrom(order.seed))
  return { days, at: 0, savings: new Map(), draws }
}

const playingOf = (order: SampleOrder): Playing => ({
  parlors: order.parlors,
  lineup: order.lineup,
  prices: pricesOf(order.parlors),
  playIdOn: order.playIdOn,
})

/** What a sample book's days played so far come to: how many days and tallies, and what they came to and were worth in yen. */
export interface Tallied {
  readonly days: number
  readonly tallies: number
  readonly result: number
  readonly theoreticalValue: number
}

export const NOTHING_TALLIED: Tallied = { days: 0, tallies: 0, result: 0, theoreticalValue: 0 }

/** What the days played come to with one more; a day nothing was played on adds nothing. */
export const withDay = (tallied: Tallied, day: DayPlayed | undefined): Tallied =>
  day === undefined
    ? tallied
    : { days: tallied.days + 1, tallies: tallied.tallies + day.tallies, result: tallied.result + day.result, theoreticalValue: tallied.theoreticalValue + day.theoreticalValue }

/** Whether every day of a sample book has been played. */
export const madeAll = (making: Making): boolean => making.at >= making.days.length

/** The next day of a sample book played, and the making as it stands after it: nothing played where no machine was out yet that day. */
export const nextDayOf = (
  order: SampleOrder,
  making: Making,
): Result<
  {
    readonly making: Making
    readonly date: IsoDate | undefined
    readonly day: DayPlayed | undefined
  },
  DayProblem
> => {
  const date = making.days[making.at]
  if (date === undefined) return Ok({ making, date: undefined, day: undefined })
  return mapOk(dayOf(playingOf(order), making.savings, date, making.draws), (played) => ({
    making: {
      ...making,
      at: making.at + 1,
      savings: played.savings,
      draws: played.draws,
    },
    date,
    day: played.day,
  }))
}
