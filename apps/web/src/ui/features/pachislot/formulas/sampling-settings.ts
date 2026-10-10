import { tidyTyped } from "../../../../core/text/tidy"

/**
 * How many regular games each setting level is sampled for unless changed for
 * the moment: a 機械割 to about ±0.3%, in a few seconds on a phone.
 */
export const GAMES_BY_DEFAULT = 10_000_000

/**
 * The most games a sampling may be set to run. A sampling runs on the
 * device of whoever asked for it, costs only their battery and their wait,
 * and can be stopped: the limit is there for a slip of the keyboard alone.
 */
const MOST_GAMES = 1_000_000_000

/** Games as typed, when they are a whole number from one to the most; none otherwise. */
export const gamesOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  const value = Number(plain)
  return /^\d+$/.test(plain) && value >= 1 && value <= MOST_GAMES ? value : undefined
}

/** A seed as typed, when it is a 64-bit decimal number; none otherwise. */
export const seedOf = (text: string): string | undefined => {
  const plain = tidyTyped(text)
  return /^\d{1,20}$/.test(plain) && BigInt(plain) < 2n ** 64n ? plain : undefined
}
