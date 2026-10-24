/** How long the cash of a dry day is shown being worked out, every step of it rattled through: with the rarity after it, about half a run that searches, though the figures are there at once. */
const RATTLED_MILLIS = 2_000

/** How long each step of a dry spell's rarity stays, one at a time and at leisure. */
const LINGER_MILLIS = 500

/** The most steps one burst shows. */
const BURST = 40

/**
 * The counts a burst shows of `all` done one by one: each of them where
 * they are few, otherwise `most` of them spread evenly from the first to
 * the last.
 */
export const burstOf = (all: number, most: number = BURST): readonly number[] =>
  all <= most ? Array.from({ length: Math.max(0, all) }, (_, index) => index + 1) : Array.from({ length: most }, (_, index) => Math.max(1, Math.round(((index + 1) * all) / most)))

/** One step of working out a dry day, done in far finer steps than it takes. */
export type Step =
  | { readonly type: "look" }
  | { readonly type: "digit"; readonly place: number; readonly digit: string }
  | { readonly type: "jackpots" }
  | { readonly type: "jackpots-pointed" }
  | { readonly type: "spin-performance"; readonly spinPerformance: number }
  | { readonly type: "decimal-point-sought" }
  | { readonly type: "decimal-point"; readonly at: number | undefined }
  | { readonly type: "numerator"; readonly spins: number }
  | { readonly type: "denominator"; readonly spinPerformance: number }
  | { readonly type: "not-zero"; readonly again: boolean }
  | { readonly type: "divided"; readonly thousands: number }
  | { readonly type: "jackpots-added" }
  | { readonly type: "zero-added" }
  | { readonly type: "pressed"; readonly times: number }
  | { readonly type: "outlay-done" }
  | { readonly type: "rarity-begun" }
  | { readonly type: "miss-chance"; readonly oneIn: number }
  | { readonly type: "multiplied"; readonly spins: number }

/** Yen a lot of rented balls costs: what the engine's cash goes in by. */
const LOT_YEN = 500

/** What a dry day is worked out from: its spins, the spin performance they are bought at, the cash they took in yen, and the machine's chance of a jackpot each spin. */
export interface DryDay {
  readonly spins: number
  readonly spinPerformance: number
  readonly outlay: number
  readonly hitChance: number
}

/** Every step of working out a dry day, in order: what it took in cash, and then how seldom such a spell comes. */
export const stepsOf = (day: DryDay): readonly Step[] => {
  const digits = [...String(day.spins)]
  const decimalPoint = String(day.spinPerformance).indexOf(".")
  const oneIn = 1 / day.hitChance
  return [
    { type: "look" },
    ...digits.map((digit, index): Step => ({ type: "digit", place: index + 1, digit })),
    { type: "jackpots" },
    { type: "jackpots-pointed" },
    { type: "spin-performance", spinPerformance: day.spinPerformance },
    { type: "decimal-point-sought" },
    { type: "decimal-point", at: decimalPoint < 0 ? undefined : decimalPoint + 1 },
    { type: "numerator", spins: day.spins },
    { type: "denominator", spinPerformance: day.spinPerformance },
    { type: "not-zero", again: false },
    { type: "not-zero", again: true },
    { type: "divided", thousands: day.spins / day.spinPerformance },
    { type: "jackpots-added" },
    { type: "zero-added" },
    ...burstOf(Math.round(day.outlay / LOT_YEN)).map((times): Step => ({ type: "pressed", times })),
    { type: "outlay-done" },
    { type: "rarity-begun" },
    { type: "miss-chance", oneIn },
    { type: "multiplied", spins: day.spins },
  ]
}

/** Whether a step is one of the rarity's, shown alone and at leisure, rather than rattled through with the cash's. */
export const lingers = (step: Step): boolean => ["rarity-begun", "miss-chance", "multiplied"].includes(step.type)

/** How long a step stays before the next: the cash's share the rattling between them, the rarity's each linger. */
export const delayOf = (step: Step, steps: readonly Step[]): number =>
  lingers(step) ? LINGER_MILLIS : RATTLED_MILLIS / Math.max(1, steps.filter((each) => !lingers(each)).length)

/** The least a run is shown running: one that ends sooner stalls for the rest, looking as busy as ever to all but one who reads what it says, so that an answer found in a blink is not taken for one not looked for. */
export const LEAST_RUN_MILLIS = 3_750

/** How far a run's bar is: as far as the run is, but never further than `LEAST_RUN_MILLIS` allows, so that it goes on while a run found in a blink idles. */
export const shownShareOf = (done: number, elapsedMillis: number): number => Math.min(done, Math.max(0, elapsedMillis) / LEAST_RUN_MILLIS)

/** How long each word a run says stays before the next. */
const BUSY_WORD_MILLIS = 800

/** Which of so many words a run says at a moment, the clock's: each in turn, round and round, a run starting wherever the clock has got to, so that no two say the same few. */
export const busyWordAt = (atMillis: number, words: number): number => Math.floor(Math.max(0, atMillis) / BUSY_WORD_MILLIS) % Math.max(1, words)

/**
 * The days a run is shown to have played: as many as it has while it runs,
 * and once it has ended in a blink, counted over again from none, to come
 * back to them just as the least it is shown running is up.
 */
export const shownTrialsOf = (trials: number, run: { readonly startedAt: number; readonly endedAt: number | undefined }, now: number): number => {
  if (run.endedAt === undefined) return trials
  const left = run.startedAt + LEAST_RUN_MILLIS - run.endedAt
  return left <= 0 ? trials : Math.round(trials * Math.min(1, Math.max(0, now - run.endedAt) / left))
}
