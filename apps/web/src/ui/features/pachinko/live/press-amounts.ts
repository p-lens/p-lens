import { tidyTyped } from "../../../../core/text/tidy"
import { PRESS_DIGITS } from "../../../../core/book/settings"

const AMOUNT = new RegExp(`^[1-9]\\d{0,${PRESS_DIGITS - 1}}$`)

/** A press's amount as typed: a whole number of no more digits than a press has — ¥10,000 at a press is how some rent — and not nothing. */
export const readPressAmount = (typed: string): number | undefined => {
  const plain = tidyTyped(typed)
  return AMOUNT.test(plain) ? Number(plain) : undefined
}
