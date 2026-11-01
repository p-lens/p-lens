import type { TokenKind } from "../commodity/commodity"
import type { SavingsPool } from "../parlor/parlor"

/** What a breakdown's tallies can be narrowed to: some games, rates, parlors or machines. */
export const NARROWED_BY = ["game", "rate", "parlor", "machine"] as const

export type NarrowedBy = (typeof NARROWED_BY)[number]

export const isNarrowedBy = (text: string): text is NarrowedBy => (NARROWED_BY as readonly string[]).includes(text)

const KINDS: readonly TokenKind[] = ["ball", "medal"]

/** A rate as a narrowing keys it: its kind of token and the rate the journal names, `ball:4円`. */
export const rateKey = (pool: SavingsPool): string => `${pool.kind}:${pool.tier}`

/** A rate's key read back; none for a key no rate is written as. */
export const readRateKey = (key: string): SavingsPool | undefined =>
  ((at) => ((kind, tier) => (KINDS.includes(kind as TokenKind) && tier !== "" ? { kind: kind as TokenKind, tier } : undefined))(key.slice(0, Math.max(at, 0)), key.slice(at + 1)))(key.indexOf(":"))

/**
 * The tallies a breakdown is of, by the groups of each dimension it is
 * narrowed by, as the breakdown keys them: a game as `game-kind` reads, a
 * rate by `rateKey`, a parlor by the name the book keeps it under, a
 * machine as its tallies name it. A dimension left out is every one of its groups, and an empty
 * list none of them, so a narrowing holding one matches no tally at all.
 */
export type Narrowing = Readonly<Partial<Record<NarrowedBy, readonly string[]>>>

/** Every tally, narrowed by nothing. */
export const EVERY_TALLY: Narrowing = {}

export const isNarrowed = (narrowing: Narrowing): boolean => NARROWED_BY.some((by) => narrowing[by] !== undefined)

/** Whether a narrowing chose none of some dimension's groups, and so matches no tally. */
export const matchesNothing = (narrowing: Narrowing): boolean => NARROWED_BY.some((by) => narrowing[by]?.length === 0)

/** A narrowing with one dimension's choice put in place of what it chose before: every one of its groups again where the choice is `undefined`. */
export const narrowedTo = (narrowing: Narrowing, by: NarrowedBy, chosen: readonly string[] | undefined): Narrowing =>
  Object.fromEntries(NARROWED_BY.flatMap((each) => ((kept) => (kept === undefined ? [] : [[each, kept] as const]))(each === by ? chosen : narrowing[each])))
