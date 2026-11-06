/** A minus a person may have typed before a number: the plain one, the full-width one, or the true minus sign. */
const LEADING_MINUS = /^\s*[-－−]\s*/

/** A number as typed with its sign turned over: a minus taken off where it has one, put before it where not. */
export const flippedSign = (typed: string): string => (LEADING_MINUS.test(typed) ? typed.replace(LEADING_MINUS, "") : `-${typed.trimStart()}`)
