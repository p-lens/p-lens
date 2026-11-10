/** The shortest an unfolding takes, in milliseconds: a part a line or two tall. */
const SHORTEST = 300

/** The longest an unfolding takes, in milliseconds: however tall a part is, it does not keep a person waiting longer. */
const LONGEST = 600

/** What an unfolding takes before its height counts, and what each pixel of its height adds, in milliseconds. */
const PACE = { from: 220, perPixel: 0.7 } as const

/**
 * How long a part takes to unfold or fold, by how tall it is: a line or two
 * in the shortest time, a taller part longer, as far as it has to go, so
 * that it moves at much the same pace whatever its height — a form of
 * seven rows taken as fast as one line looks to leap.
 */
export const unfoldingTimeOf = (height: number): number => Math.round(Math.min(LONGEST, Math.max(SHORTEST, PACE.from + height * PACE.perPixel)))
