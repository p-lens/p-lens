import type { Figures } from "../../../core/pachinko/figures"
import { borderOf } from "../../../core/pachinko/theoretical-value"

/** What a ball exchanges for where ¥1,000 rents 250 and 250 come back for ¥1,000: the even exchange a border is usually told at. */
const EVEN_BALL_VALUE = 4

/**
 * The lowest border a machine of the sample book has, at the even
 * exchange: a sitting's spins are drawn as +1 to +5 over a border of 18
 * and kept as that share, so a machine of a far lower border — a figure
 * typed wrong, a 遊タイム machine's sort — would be played at a spin
 * performance no person reads.
 */
const LOWEST_BORDER = 16

/** Whether a sample book sits at a machine of these figures: one whose border at the even exchange is 16 or more. A division, once a machine. */
export const seatsAt = (figures: Figures): boolean => borderOf(figures, EVEN_BALL_VALUE) >= LOWEST_BORDER
