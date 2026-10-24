import type { IsoDate } from "../../core/calendar/calendar"
import { decimal, multiply, toPlainString, type Decimal } from "../../core/decimal/decimal"
import { savingsAccount } from "../../core/journal/accounts"
import type { Entry } from "../../core/journal/entry"
import type { PlayGameKind, PlayId } from "../../core/play/play"
import { Err, Ok, collect, type Result } from "../../core/result/result"
import { prizeExchangeEntry, type PrizeExchangeProblem } from "../../core/savings/prize-exchange"
import { composeTokenTallyEntry } from "../../core/tally/compose"
import type { TallyError, TokenTally } from "../../core/tally/tally"
import type { PricePoint } from "../../core/valuation/valuation"
import { between, chance, weighted, wholeBetween, type Draws, type Drawn } from "./draws"
import { machineOn, onSaleOn, type OnSale } from "./lineup"
import * as Pachinko from "./pachinko"
import * as Pachislot from "./pachislot"
import { cornerRateOn, type Corner, type SampleParlor } from "./parlors"
import { clockTimeOf, closingOf, lunchOf, moveOf, NOON, OPENING, SHORTEST_SITTING, type Minutes } from "./schedule"
import type { Sitting, SittingTerms, Stretch } from "./sitting"

/** The machines a sample book may play, of each game, each from the day it went on sale. */
export interface Lineup {
  readonly pachinko: readonly OnSale<Pachinko.Seat>[]
  readonly pachislot: readonly OnSale<Pachislot.Seat>[]
}

/** Everything a day of a sample book is played from, the same every day. */
export interface Playing {
  readonly parlors: readonly SampleParlor[]
  readonly lineup: Lineup
  readonly prices: readonly PricePoint[]
  /** The id of a day's play, by the day and its place among the day's. */
  readonly playIdOn: (date: IsoDate, index: number) => PlayId
}

/** What every pool holds in savings, by its account. */
export type Savings = ReadonlyMap<string, number>

/** A day played, as it is told while a book is made and kept: where, at which machines, what it came to and was worth in yen, and its entries. */
export interface DayPlayed {
  readonly date: IsoDate
  readonly parlor: string
  readonly machines: readonly string[]
  readonly result: number
  readonly theoreticalValue: number
  readonly tallies: number
  readonly entries: readonly Entry[]
}

export type DayProblem = { readonly type: "tally"; readonly error: TallyError } | { readonly type: "exchange"; readonly problem: PrizeExchangeProblem }

/** How likely a day is played at pachinko rather than pachislot. */
const PACHINKO_SHARE = 0.6

/** Machines played on a day at most. */
const MOST_SITTINGS = 5

/** How much a person loses at a machine with no win before giving it up, in yen, drawn for each day. */
const GIVING_UP_YEN = { low: 15000, high: 40000 } as const

/** How likely a person is to get up once a run ends. */
const LEAVING_AFTER_RUN = 0.05

/** How many tokens a pool holds before its savings are now and then exchanged, how likely that is at a day's end, and the cabinets' numbers. */
const EXCHANGE_FLOORS: Readonly<Record<PlayGameKind, number>> = {
  pachinko: 5000,
  pachislot: 1000,
}

const EXCHANGING = 0.15

/** Special prizes are handed over in hundreds of yen; what is left is odd prizes. */
const SPECIAL_PRIZE_STEP = 100

const CABINETS = { low: 101, high: 899 } as const

/** A game's machines as a day sits at them: a machine on sale and not yet left, and how a sitting at it is played out. */
interface Table {
  readonly gameKind: PlayGameKind
  readonly onSale: (day: IsoDate) => number
  readonly machineOn: (
    day: IsoDate,
    left: readonly string[],
    draws: Draws,
  ) => Drawn<
    | {
        readonly id: string
        readonly name: string
        readonly sit: (terms: SittingTerms, draws: Draws) => Drawn<Sitting>
      }
    | undefined
  >
}

const tableOf = <S>(gameKind: PlayGameKind, lineup: readonly OnSale<S>[], sittingOf: (seat: S, terms: SittingTerms, draws: Draws) => Drawn<Sitting>): Table => ({
  gameKind,
  onSale: (day) => onSaleOn(lineup, day).length,
  machineOn: (day, left, draws) => {
    const [machine, next] = machineOn(lineup, day, left, draws)
    return [
      machine === undefined
        ? undefined
        : {
            id: machine.id,
            name: machine.name,
            sit: (terms, run) => sittingOf(machine.seat, terms, run),
          },
      next,
    ]
  },
})

const tablesOf = (lineup: Lineup): Readonly<Record<PlayGameKind, Table>> => ({
  pachinko: tableOf("pachinko", lineup.pachinko, Pachinko.sittingOf),
  pachislot: tableOf("pachislot", lineup.pachislot, Pachislot.sittingOf),
})

/** The game a day is played at: pachinko more often than not, and the other where nothing of the one is out yet. */
const tableOn = (lineup: Lineup, day: IsoDate, draws: Draws): Drawn<Table | undefined> => {
  const tables = tablesOf(lineup)
  const [pachinko, next] = chance(draws, PACHINKO_SHARE)
  const [first, second] = pachinko ? [tables.pachinko, tables.pachislot] : [tables.pachislot, tables.pachinko]
  return [first.onSale(day) > 0 ? first : second.onSale(day) > 0 ? second : undefined, next]
}

/** The tokens in hand and what has paid for them so far in a day: cash, and savings replayed. */
interface Funds {
  readonly hand: number
  readonly stored: number
  readonly replayLeft: number
  readonly cash: number
  readonly rented: number
  readonly replayed: number
}

/** Tokens one press of the rental button gives. */
const pressTokens = (corner: Corner): number => (corner.terms.rental.tokens * corner.cashStep) / corner.terms.rental.yen

/**
 * A stretch paid for as a person pays: the tokens in hand first, then
 * savings replayed while the day's replays last, then cash a press at a
 * time; what it won goes into the hand.
 */
const funded =
  (corner: Corner) =>
  (funds: Funds, stretch: Stretch): Funds => {
    const fromHand = Math.min(funds.hand, stretch.shot)
    const short = stretch.shot - fromHand
    const fromReplay = Math.min(short, funds.replayLeft, funds.stored)
    const unpaid = short - fromReplay
    const presses = Math.ceil(unpaid / pressTokens(corner))
    const bought = presses * pressTokens(corner)
    return {
      hand: funds.hand - fromHand + bought - unpaid + stretch.won,
      stored: funds.stored - fromReplay,
      replayLeft: funds.replayLeft - fromReplay,
      cash: funds.cash + presses * corner.cashStep,
      rented: funds.rented + bought,
      replayed: funds.replayed + fromReplay,
    }
  }

const whole = (value: number): Decimal => decimal(BigInt(Math.round(value)), 0)

const tenths = (value: number): Decimal => decimal(BigInt(Math.round(value * 10)), 1)

const numberOf = (value: Decimal): number => Number(toPlainString(value))

/** A day as far as it has gone: the clock, lunch still to be taken, the tokens and funds, the machines left, and its tallies. */
interface Going {
  readonly clock: Minutes
  readonly lunchLeft: Minutes
  readonly funds: Funds
  readonly left: readonly string[]
  readonly tallies: readonly TokenTally[]
  readonly theoreticalValue: number
}

interface DayTerms {
  readonly playing: Playing
  readonly date: IsoDate
  readonly table: Table
  readonly parlor: SampleParlor
  readonly corner: Corner
  readonly closing: Minutes
  readonly lunch: Minutes
  readonly givingUpAfter: number
}

/** One sitting after another, until the day is over, every machine on sale has been left, or the last a day may sit at was played until it was. */
const sittingsOf = (terms: DayTerms, going: Going, draws: Draws): Drawn<Going> => {
  const budget = terms.closing - going.clock - going.lunchLeft
  if (going.tallies.length >= MOST_SITTINGS || budget < SHORTEST_SITTING) return [going, draws]
  const [machine, afterMachine] = terms.table.machineOn(terms.date, going.left, draws)
  if (machine === undefined) return [going, afterMachine]
  const last = going.tallies.length === MOST_SITTINGS - 1
  const rate = numberOf(cornerRateOn(terms.corner, terms.date))
  const [sitting, afterSitting] = machine.sit(
    {
      minutes: budget,
      tokensPerThousand: terms.corner.terms.rental.tokens,
      tokenValue: rate,
      givingUpAfter: last ? undefined : terms.givingUpAfter,
      leavingAfterRun: last ? 0 : LEAVING_AFTER_RUN,
    },
    afterMachine,
  )
  const [cabinet, afterCabinet] = wholeBetween(afterSitting, CABINETS.low, CABINETS.high)
  const [move, afterMove] = moveOf(afterCabinet)
  const lunched = going.lunchLeft > 0 && going.clock + sitting.minutes >= NOON
  const finish = going.clock + sitting.minutes + (lunched ? going.lunchLeft : 0)
  const start: Funds = { ...going.funds, cash: 0, rented: 0, replayed: 0 }
  const funds = sitting.stretches.reduce(funded(terms.corner), start)
  const tally: TokenTally = {
    id: terms.playing.playIdOn(terms.date, going.tallies.length),
    date: terms.date,
    gameKind: terms.table.gameKind,
    machine: machine.name,
    cabinetNumber: String(cabinet),
    theoreticalValue: whole(sitting.theoreticalValue),
    clock: { started: clockTimeOf(going.clock), finished: clockTimeOf(finish) },
    ...(sitting.spinPerformance === undefined ? {} : { spinPerformance: tenths(sitting.spinPerformance) }),
    parlor: terms.parlor.parlor,
    pool: terms.corner.pool,
    rental: funds.cash === 0 ? undefined : { outlay: whole(funds.cash), tokens: whole(funds.rented) },
    replay: { paidOut: whole(funds.replayed), deducted: whole(funds.replayed) },
    carriedIn: whole(going.funds.hand),
    payout: whole(funds.hand),
  }
  const next: Going = {
    clock: finish + move,
    lunchLeft: lunched ? 0 : going.lunchLeft,
    funds: {
      ...funds,
      cash: going.funds.cash + funds.cash,
      rented: going.funds.rented + funds.rented,
      replayed: going.funds.replayed + funds.replayed,
    },
    left: [...going.left, machine.id],
    tallies: [...going.tallies, tally],
    theoreticalValue: going.theoreticalValue + sitting.theoreticalValue,
  }
  return sitting.leaving === "closing" ? [next, afterMove] : sittingsOf(terms, next, afterMove)
}

/** What a pool's savings are exchanged for at a day's end, now and then, where they have grown: all but what the next days may replay. */
const exchangeOf = (terms: DayTerms, stored: number, draws: Draws): Drawn<{ readonly tokens: number; readonly specialPrizes: number } | undefined> => {
  const [exchanges, afterExchanging] = chance(draws, EXCHANGING)
  if (!exchanges || stored < EXCHANGE_FLOORS[terms.table.gameKind]) return [undefined, afterExchanging]
  const [kept, afterKept] = wholeBetween(afterExchanging, 0, terms.corner.replayCap)
  const tokens = stored - kept
  const worth = numberOf(multiply(whole(tokens), cornerRateOn(terms.corner, terms.date)))
  return [
    {
      tokens,
      specialPrizes: Math.floor(worth / SPECIAL_PRIZE_STEP) * SPECIAL_PRIZE_STEP,
    },
    afterKept,
  ]
}

/** The day's result in yen: the tokens it ended with beyond what it drew from savings, at the day's rate, less the cash it spent. */
const resultOf = (funds: Funds, rate: Decimal): number => numberOf(multiply(whole(funds.hand - funds.replayed), rate)) - funds.cash

/**
 * A day of a sample book played: at one parlor, a game and its newest
 * machines, from ten until somewhere between six and nine, one machine
 * after another; the tokens left at the end put into savings, and those
 * now and then exchanged for prizes. Nothing, where no machine of either
 * game is out yet. Every entry is composed as the app composes one, so the
 * book is no different from one a person kept.
 */
export const dayOf = (
  playing: Playing,
  savings: Savings,
  date: IsoDate,
  draws: Draws,
): Result<
  {
    readonly day: DayPlayed | undefined
    readonly savings: Savings
    readonly draws: Draws
  },
  DayProblem
> => {
  const [table, afterTable] = tableOn(playing.lineup, date, draws)
  const [parlor, afterParlor] = weighted(afterTable, playing.parlors, (choice) => choice.pull)
  if (table === undefined || parlor === undefined) return Ok({ day: undefined, savings, draws: afterParlor })
  const corner = parlor.corners[table.gameKind]
  const account = savingsAccount(corner.pool.kind, parlor.parlor.name, corner.pool.tier)
  const [closing, afterClosing] = closingOf(afterParlor)
  const [lunch, afterLunch] = lunchOf(afterClosing)
  const [givingUpYen, afterGivingUp] = between(afterLunch, GIVING_UP_YEN.low, GIVING_UP_YEN.high)
  const terms: DayTerms = {
    playing,
    date,
    table,
    parlor,
    corner,
    closing,
    lunch,
    givingUpAfter: (givingUpYen / 1000) * corner.terms.rental.tokens,
  }
  const funds: Funds = {
    hand: 0,
    stored: savings.get(account) ?? 0,
    replayLeft: corner.replayCap,
    cash: 0,
    rented: 0,
    replayed: 0,
  }
  const [gone, afterSittings] = sittingsOf(
    terms,
    {
      clock: OPENING,
      lunchLeft: lunch,
      funds,
      left: [],
      tallies: [],
      theoreticalValue: 0,
    },
    afterGivingUp,
  )
  const stored = gone.funds.stored + gone.funds.hand
  const [exchange, afterExchange] = exchangeOf(terms, stored, afterSittings)
  const tallies = collect(gone.tallies.map((tally) => composeTokenTallyEntry(tally, playing.prices)))
  if (!tallies.ok) return Err({ type: "tally", error: tallies.error })
  const exchanged =
    exchange === undefined
      ? Ok(undefined)
      : prizeExchangeEntry(
          {
            parlor: parlor.parlor,
            pool: corner.pool,
            date,
            tokens: whole(exchange.tokens),
            specialPrizes: whole(exchange.specialPrizes),
          },
          playing.prices,
        )
  if (!exchanged.ok) return Err({ type: "exchange", problem: exchanged.error })
  return Ok({
    day:
      gone.tallies.length === 0
        ? undefined
        : {
            date,
            parlor: parlor.parlor.name,
            machines: gone.tallies.map((tally) => tally.machine),
            result: resultOf(gone.funds, cornerRateOn(corner, date)),
            theoreticalValue: gone.theoreticalValue,
            tallies: gone.tallies.length,
            entries: [...tallies.value, ...(exchanged.value === undefined ? [] : [exchanged.value])],
          },
    savings: new Map([...savings, [account, stored - (exchange?.tokens ?? 0)]]),
    draws: afterExchange,
  })
}
