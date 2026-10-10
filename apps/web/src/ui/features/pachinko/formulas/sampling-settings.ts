import { tidyTyped } from "../../../../core/text/tidy"

/** How many trials a sampling runs unless changed for the moment: a few seconds on a phone, worth waiting for. */
export const TRIALS_BY_DEFAULT = 10_000_000

/**
 * The most trials a sampling may be set to run. A sampling runs on the
 * device of whoever asked for it, costs only their battery and their wait,
 * and can be stopped: the limit is there for a slip of the keyboard alone.
 */
const MOST_TRIALS = 1_000_000_000

/** Trials as typed, when they are a whole number from one to the most; none otherwise. */
export const trialsOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  const value = Number(plain)
  return /^\d+$/.test(plain) && value >= 1 && value <= MOST_TRIALS ? value : undefined
}

/** A seed as typed, when it is a 64-bit decimal number; none otherwise. */
export const seedOf = (text: string): string | undefined => {
  const plain = tidyTyped(text)
  return /^\d{1,20}$/.test(plain) && BigInt(plain) < 2n ** 64n ? plain : undefined
}
