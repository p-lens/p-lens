/**
 * What people have done with a formula. Each mark is a different thing
 * said, by a different kind of player, and is counted and weighed after
 * what it says (`scoreOf`):
 *
 * - `verifications` and `refutations` (検証OK, 検証NG) — what a person
 *   found for themselves: they went through the basis, and it held or it
 *   did not. The professional's mark, and nobody else is being told
 *   anything. A finding is a fact, so it weighs the most, it is one each
 *   way a person a formula, and it is never taken back: whoever finds
 *   otherwise later gives the other, and the two cancel.
 * - `adoptions` and `rejections` (イチオシ, 非推奨) — what a person says to
 *   others: "go by this one", "keep off this one". The light player's and
 *   the semi-pro's mark. Talk is light, and a mind may change, so it
 *   weighs a fifth of a finding and is put on and taken off freely. The
 *   two are not a pair: an adoption is a choice, one formula a machine,
 *   moved by choosing another; a rejection is a warning, one a formula,
 *   as many as deserve it. A person may hold both on one formula.
 * - `uses` — plays started with it. Nobody says anything: a statistic,
 *   counted every time, weighing next to nothing a play and never past
 *   its most.
 * - `favorites` (お気に入り) — what a person keeps for themselves, in their
 *   book. It chooses the formula their own play opens with and ranks
 *   nothing.
 *
 * A machine's favourite is a different thing again and never counted here.
 */
export interface Standing {
  readonly verifications: number
  readonly refutations: number
  readonly adoptions: number
  readonly rejections: number
  readonly favorites: number
  readonly uses: number
}

/**
 * What a person has done with a formula: adopted it, rejected it, found
 * its basis good, found it wanting — each on its own, none letting go of
 * another. They are kept in the person's book (`core/marks`), so every
 * device the book reaches shows them. A favourite is not among them: it
 * is the book's own (`core/favorites`).
 */
export interface MyMarks {
  readonly adopted: boolean
  readonly rejected: boolean
  readonly verified: boolean
  readonly refuted: boolean
}

export type Mark = "adoption" | "rejection" | "verification" | "refutation" | "favorite"

/** A mark a person puts on and takes off: what they say to others, which a change of mind may unsay. */
export type HeldMark = Extract<Mark, "adoption" | "rejection">

/** A check either way: what was found, given once and standing from then on. */
export type CheckMark = Extract<Mark, "verification" | "refutation">

export const isHeld = (mine: MyMarks, mark: HeldMark): boolean => {
  switch (mark) {
    case "adoption":
      return mine.adopted
    case "rejection":
      return mine.rejected
  }
}

/** Checks that held, less those that did not. */
const netVerifications = (standing: Standing): number => standing.verifications - standing.refutations

/** Adoptions, less rejections. */
const netAdoptions = (standing: Standing): number => standing.adoptions - standing.rejections

/**
 * Anything people register for a machine and stand behind the way they do a
 * formula: a pachinko 算出条件, a pachislot one, a pachislot 設定配分. Ranked
 * by the score of how it was made and what has been done with it, then by
 * what it makes a play worth, then by age.
 */
export interface Ranked {
  readonly id: string
  readonly createdAt: string
  /** How a formula was made; a 設定配分 is made no way, and has none. */
  readonly kind?: Making
}

/** How a formula was made: typed in, worked out exactly from a basis, or sampled from one by the simulator. */
export type Making = "manual" | "simulated" | "sampled"

export interface FormulaListing<F extends Ranked> {
  readonly formula: F
  readonly standing: Standing
}

/**
 * What a formula makes a play worth, as a number to set two formulas of a
 * machine against each other: a harsher formula's is lower. Its game says
 * what it is — a pachinko formula's balls a spin, a pachislot one's 機械割.
 */
export type Worth<F> = (formula: F) => number

/** For what is worth nothing either way, so worth decides nothing between two of it: a 設定配分. */
export const sameWorth: Worth<unknown> = () => 0

/**
 * What a check, an adoption and a use each weigh in a formula's score, in
 * hundredths of a point so the sum is a whole number and two scores are
 * equal exactly or not at all:
 *
 * | mark                  | what it is                | points | counted                    | taken back |
 * |-----------------------|---------------------------|--------|----------------------------|------------|
 * | 検証OK / 検証NG       | found for oneself         | ±10    | one each a person a formula | never      |
 * | イチオシ / 非推奨     | said to others            | ±2     | one a machine / one a formula | freely   |
 * | 利用                  | a play started, a statistic | +0.01 | every time, to a most      | —          |
 * | お気に入り            | kept for oneself          | 0      | —                          | freely     |
 *
 * The weight follows the mark's nature. What was found is heavy and
 * stands; what is said is light and may be unsaid. A check and an
 * adoption are one a person, so nobody lifts a formula further by
 * pressing again; a use is not, which is why it weighs a hundredth.
 */
const WEIGHTS = { verification: 1_000, adoption: 200, use: 1 } as const

/**
 * The most a formula's uses weigh, however many they are: a hundredth
 * short of sixteen points. A formula long played with has earned its
 * place — it was not sifted out — but plays alone, counted every time and
 * fed by whichever formula a machine opens with, never weigh more than
 * being worked out from a basis does.
 */
const MOST_FROM_USES = 1_599

/**
 * What a formula's making weighs in its score before anyone has done
 * anything with it, in the same hundredths: one worked out from a basis
 * sixteen points, one sampled by the simulator three, and one typed in
 * nothing. A basis can be read and checked and typed figures cannot, and
 * what is worked out from one is exact where what is sampled is an
 * estimate. Each step is a point more than all its maker can give the
 * formula below: whoever makes a formula may adopt it, and check it where
 * it has a basis, so one typed in can gain two points of its maker and a
 * sampled one twelve. Their own marks never lift a formula over the
 * making above, and one more person's adoption does, over one nobody
 * marked.
 */
const MAKING_WEIGHTS: Readonly<Record<Making, number>> = { manual: 0, sampled: 300, simulated: 1_600 }

/**
 * A formula's score, the first thing its rank goes by:
 *
 *     making + (検証OK − 検証NG) × 10 + (イチオシ − 非推奨) × 2 + min(利用 × 0.01, 15.99)
 *
 * in points, kept in hundredths. Each term is what one kind of evidence
 * says: how the formula was made, what people found for themselves, what
 * they tell each other, and how much it is played. One formula's many
 * adoptions can outweigh another's one check; a formula refuted as often
 * as it was verified has nothing from its checks, and one refuted more
 * goes below zero. Eight rejections outweigh all that uses can ever give.
 * Favourites weigh nothing.
 */
export const scoreOf = <F extends Ranked>(listing: FormulaListing<F>): number =>
  (listing.formula.kind === undefined ? 0 : MAKING_WEIGHTS[listing.formula.kind]) +
  netVerifications(listing.standing) * WEIGHTS.verification +
  netAdoptions(listing.standing) * WEIGHTS.adoption +
  Math.min(listing.standing.uses * WEIGHTS.use, MOST_FROM_USES)

/**
 * Which of two formulas ranks first: the one of the higher score. Between
 * two of the same score, the one that makes a play worth less comes first:
 * where nobody has said which is right, the harsher figures are the safer
 * to go by. Then the older: a new formula does not rise for being new,
 * only by being checked and adopted — and the order never shuffles.
 */
const compareListings =
  <F extends Ranked>(worth: Worth<F>) =>
  (left: FormulaListing<F>, right: FormulaListing<F>): number =>
    scoreOf(right) - scoreOf(left) ||
    worth(left.formula) - worth(right.formula) ||
    left.formula.createdAt.localeCompare(right.formula.createdAt) ||
    left.formula.id.localeCompare(right.formula.id)

export const ranked = <F extends Ranked>(listings: readonly FormulaListing<F>[], worth: Worth<F>): readonly FormulaListing<F>[] => listings.toSorted(compareListings(worth))

/**
 * Which formula a machine opens with, and why: the one a book of the
 * person's keeps as its favourite, or else the best ranked. Shown with its reason, so a
 * favourite chosen for you never passes for the machine's recommendation.
 */
export type Selection<F extends Ranked> =
  | { readonly by: "favorite"; readonly listing: FormulaListing<F> }
  | { readonly by: "ranking"; readonly listing: FormulaListing<F> }
  | { readonly by: "person"; readonly listing: FormulaListing<F> }

export const autoSelect = <F extends Ranked>(listings: readonly FormulaListing<F>[], worth: Worth<F>, favorites: ReadonlySet<string>): Selection<F> | undefined => {
  const order = ranked(listings, worth)
  const favorite = order.find((listing) => favorites.has(listing.formula.id))
  const best = order.at(0)
  return favorite !== undefined ? { by: "favorite", listing: favorite } : best === undefined ? undefined : { by: "ranking", listing: best }
}

/**
 * The formula chosen by hand from a machine's listings, when the address
 * names one it has.
 */
export const selectById = <F extends Ranked>(listings: readonly FormulaListing<F>[], id: string): Selection<F> | undefined => {
  const chosen = listings.find((listing) => listing.formula.id === id)
  return chosen === undefined ? undefined : { by: "person", listing: chosen }
}

