import type { IsoDate } from "../calendar/calendar"
import type { Decimal } from "../decimal/decimal"
import { nearestFirst } from "../parlor/distance"
import type { Parlor, ParlorId, SavingsPool } from "../parlor/parlor"
import { searchKeyOf } from "../text/search-key"
import { isWritableParlorName, type Coordinates, type Prefecture, type SharedParlor } from "../parlor/shared"
import { exchangeRateOf, poolOf, type PlayTerms } from "../parlor/terms"
import type { PlayGameKind } from "../play/play"
import { chance, shuffled, weighted, wholeBetween, type Draws, type Drawn } from "./draws"
import { daysFrom } from "./schedule"

/** One corner of a sample parlor: its pool, its terms, how much cash one press rents, how many tokens a day may be replayed, and its exchange rates from the day each was set. */
export interface Corner {
  readonly gameKind: PlayGameKind
  readonly pool: SavingsPool
  readonly terms: PlayTerms
  /** Yen one press of the rental button takes. */
  readonly cashStep: number
  /** Tokens a day may be drawn out of savings to play (再プレー上限). */
  readonly replayCap: number
  readonly rates: readonly { readonly from: IsoDate; readonly rate: Decimal }[]
}

/** A parlor a sample book plays at: a real one from the parlor list, its two corners, and how often it is gone to against the others. */
export interface SampleParlor {
  readonly parlor: Parlor
  readonly corners: Readonly<Record<PlayGameKind, Corner>>
  readonly pull: number
}

/** How many parlors a sample book goes to: eight or nine, of a prefecture. */
const FEWEST_PARLORS = 8

const MOST_PARLORS = 9

/** How often the nearest parlors are gone to against the rest: three a person goes to most. */
const PULLS = [5, 3, 2] as const

/** Balls ¥1,000 exchanges for at a pachinko corner, as boards state ¥100's: 25玉 (等価) to 28玉. */
const BALL_EXCHANGES = [250, 260, 275, 280] as const

/** Medals ¥10,000 exchanges for at a pachislot corner, as boards state ¥100's: 5.0枚 (等価) to 5.6枚. */
const MEDAL_EXCHANGES = [500, 510, 530, 550, 560] as const

/** Medals ¥1,000 rents at a pachislot corner. */
const MEDAL_RENTALS = [50, 47, 46] as const

/** Tokens a day may be replayed: 2,000 balls, and the medals the same yen rents. */
const REPLAY_CAPS: Readonly<Record<PlayGameKind, number>> = {
  pachinko: 2000,
  slot: 400,
}

const CASH_STEPS: Readonly<Record<PlayGameKind, number>> = {
  pachinko: 500,
  slot: 1000,
}

/** How likely a parlor is to change its exchange once in the three years, and how long after the first day and before the last it may. */
const RATE_CHANGING = 0.3

const RATE_CHANGE_MARGIN_DAYS = 180

const pick = <T>(draws: Draws, choices: readonly T[]): Drawn<T | undefined> => weighted(draws, choices, () => 1)

const termsOf = (gameKind: PlayGameKind, rentalTokens: number, exchangeTokens: number): PlayTerms => ({
  rental: { yen: 1000, tokens: rentalTokens },
  exchange: gameKind === "pachinko" ? { tokens: exchangeTokens, yen: 1000 } : { tokens: exchangeTokens, yen: 10000 },
  replay: { paidOut: 1, deducted: 1 },
})

/** A corner's exchange rates over the three years: one from the first day, and now and then another set later. */
const ratesOf = (gameKind: PlayGameKind, terms: PlayTerms, exchanges: readonly number[], days: readonly IsoDate[], draws: Draws): Drawn<Corner["rates"]> => {
  const first = {
    from: days[0] ?? ("" as IsoDate),
    rate: exchangeRateOf(terms),
  }
  const [changes, afterChanging] = chance(draws, RATE_CHANGING)
  if (!changes || days.length <= 2 * RATE_CHANGE_MARGIN_DAYS) return [[first], afterChanging]
  const [at, afterAt] = wholeBetween(afterChanging, RATE_CHANGE_MARGIN_DAYS, days.length - RATE_CHANGE_MARGIN_DAYS)
  const [exchange, afterExchange] = pick(
    afterAt,
    exchanges.filter((tokens) => tokens !== terms.exchange.tokens),
  )
  const day = days[at]
  return exchange === undefined || day === undefined
    ? [[first], afterExchange]
    : [
        [
          first,
          {
            from: day,
            rate: exchangeRateOf(termsOf(gameKind, terms.rental.tokens, exchange)),
          },
        ],
        afterExchange,
      ]
}

const cornerOf = (gameKind: PlayGameKind, days: readonly IsoDate[], draws: Draws): Drawn<Corner> => {
  const exchanges = gameKind === "pachinko" ? BALL_EXCHANGES : MEDAL_EXCHANGES
  const [rental, afterRental] = gameKind === "pachinko" ? [250, draws] : pick(draws, MEDAL_RENTALS)
  const [exchange, afterExchange] = pick(afterRental, exchanges)
  const terms = termsOf(gameKind, rental ?? 50, exchange ?? exchanges[0])
  const [rates, afterRates] = ratesOf(gameKind, terms, exchanges, days, afterExchange)
  return [
    {
      gameKind,
      pool: poolOf(gameKind, terms),
      terms,
      cashStep: CASH_STEPS[gameKind],
      replayCap: REPLAY_CAPS[gameKind],
      rates,
    },
    afterRates,
  ]
}

const sampleParlorOf = (shared: SharedParlor, pull: number, days: readonly IsoDate[], draws: Draws): Drawn<SampleParlor> => {
  const [pachinko, afterPachinko] = cornerOf("pachinko", days, draws)
  const [slot, afterSlot] = cornerOf("slot", days, afterPachinko)
  return [
    {
      parlor: {
        identity: { type: "listed", id: shared.id as string as ParlorId },
        name: shared.name,
        pools: [pachinko.pool, slot.pool],
      },
      corners: { pachinko, slot },
      pull,
    },
    afterSlot,
  ]
}

/**
 * Parlors whose names a book can be written with, each name once — the
 * first going by it — each name's key worked out once: the list is every
 * parlor in the country, and setting each against every other held the
 * screen up for seconds.
 */
const writable = (parlors: readonly SharedParlor[]): readonly SharedParlor[] => {
  const named = parlors.filter((parlor) => isWritableParlorName(parlor.name)).map((parlor) => [searchKeyOf(parlor.name), parlor] as const)
  const first = new Map(named.toReversed())
  return named.filter(([key, parlor]) => first.get(key) === parlor).map(([, parlor]) => parlor)
}

/**
 * The prefecture a sample book is played in: the nearest parlor's, where
 * the device knows where it is, and any with enough parlors where it does not.
 */
const prefectureOf = (parlors: readonly SharedParlor[], here: Coordinates | undefined, draws: Draws): Drawn<Prefecture | undefined> => {
  const nearest = here === undefined ? undefined : nearestFirst(parlors, here)[0]
  if (nearest?.metres !== undefined) return [nearest.parlor.prefecture, draws]
  const prefectures = [...new Set(parlors.map((parlor) => parlor.prefecture))]
  const roomy = prefectures.filter((prefecture) => parlors.filter((parlor) => parlor.prefecture === prefecture).length >= FEWEST_PARLORS)
  return pick(draws, roomy.length > 0 ? roomy : prefectures)
}

/** Where a sample book is played: the prefecture, and the parlors of it. */
export interface Placing {
  readonly prefecture: Prefecture | undefined
  readonly parlors: readonly SampleParlor[]
}

/**
 * The parlors a sample book plays at, from the parlor list: eight or nine
 * of one prefecture — the nearest, where the device knows where it is, and
 * any where it does not — the first three gone to most, each with its
 * corners' terms drawn, since the list says nothing of a parlor's rates.
 */
export const sampleParlorsOf = (listed: readonly SharedParlor[], here: Coordinates | undefined, from: IsoDate, through: IsoDate, draws: Draws): Drawn<Placing> => {
  const parlors = writable(listed)
  const [prefecture, afterPrefecture] = prefectureOf(parlors, here, draws)
  const inPrefecture = parlors.filter((parlor) => parlor.prefecture === prefecture)
  const [ordered, afterOrder] = here === undefined ? shuffled(afterPrefecture, inPrefecture) : [nearestFirst(inPrefecture, here).map((near) => near.parlor), afterPrefecture]
  const [count, afterCount] = wholeBetween(afterOrder, FEWEST_PARLORS, MOST_PARLORS)
  const days = daysFrom(from, through)
  const [chosen, after] = ordered.slice(0, count).reduce<Drawn<readonly SampleParlor[]>>(
    ([made, run], shared, index) => {
      const [parlor, next] = sampleParlorOf(shared, PULLS[index] ?? 1, days, run)
      return [[...made, parlor], next]
    },
    [[], afterCount],
  )
  return [{ prefecture, parlors: chosen }, after]
}

/** A corner's exchange rate on a day: the last set on or before it. */
export const cornerRateOn = (corner: Corner, day: IsoDate): Decimal => (corner.rates.findLast((rate) => rate.from <= day) ?? corner.rates[0])?.rate ?? exchangeRateOf(corner.terms)
