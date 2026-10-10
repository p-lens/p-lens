import { tidyTyped } from "../../../../core/text/tidy"

const AMOUNT = /^[1-9]\d{0,3}$/

/** A press's amount as typed: a whole number of one to four digits, and not nothing. */
export const readPressAmount = (typed: string): number | undefined => {
  const plain = tidyTyped(typed)
  return AMOUNT.test(plain) ? Number(plain) : undefined
}
