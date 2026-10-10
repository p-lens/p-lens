import type { PlayTerms } from "../parlor/terms"

/** Yen a ball rents for, above which a corner is a dear one: ¥1 corners that add the tax to the ball are still low ones. */
const LOW_RATE_UP_TO = 1.25

const DEAR_PRESS = 500
const LOW_PRESS = 200

/**
 * Yen one press of a cabinet's rental button takes on a corner's terms:
 * ¥500 where balls are dear — 125 of them at ¥4 — and ¥200 at ¥1 a ball
 * or less, where ¥500 would be more balls than a tray holds. A play with
 * no terms is taken as a dear one.
 */
export const rentalPressOf = (terms: PlayTerms | undefined): number =>
  terms !== undefined && terms.rental.yen / terms.rental.tokens <= LOW_RATE_UP_TO ? LOW_PRESS : DEAR_PRESS
