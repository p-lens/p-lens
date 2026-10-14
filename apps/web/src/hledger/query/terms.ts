import { nextDay, type IsoDate } from "../../core/calendar/calendar"
import type { TokenKind } from "../../core/commodity/commodity"
import { ACCOUNTS, savingsAccount, savingsRoot } from "../../core/journal/accounts"
import type { PlayId } from "../../core/play/play"
import { TALLY_TAGS } from "../../core/tally/tally"
import { SAVINGS_TAG } from "../../core/savings/balance"

/**
 * hledger query terms P-Lens writes. Each is a string hledger reads as it
 * reads its own command line, so a URL carrying one means what
 * `hledger bal <query>` would.
 *
 * Dates are always written out. hledger's `today` and `thismonth` would be
 * read by an engine whose clock has no time zone, which just after midnight
 * in Japan is still yesterday.
 */

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Everything up to and including a day; hledger's end is exclusive. */
export const untilTerm = (date: IsoDate): string => `date:..${nextDay(date)}`

/**
 * Everything from one day to another, both included, either end left open
 * where it is not given; nothing at all — every day there is — where
 * neither is. hledger's end is exclusive, so the day after the last is
 * what is written.
 */
export const rangeTerm = (from: IsoDate | undefined, to: IsoDate | undefined): string => (from === undefined && to === undefined ? "" : `date:${from ?? ""}..${to === undefined ? "" : nextDay(to)}`)

/** The cash account, and no account under another name. */
export const cashTerm = `^${escapeRegex(ACCOUNTS.cash)}$`

/** Every savings account of every kind of token, at every parlor. */
export const savingsTerm = `^(${escapeRegex(savingsRoot("ball"))}|${escapeRegex(savingsRoot("medal"))}):`

/** The entries that registered the savings a pool began with. */
export const openingBalanceTerm = (kind: TokenKind, parlorName: string, tier: string): string => `tag:${SAVINGS_TAG}=^opening$ ^${escapeRegex(savingsAccount(kind, parlorName, tier))}$`

/** The theoretical value's account and what is kept under it: the measured and the inferred together. */
export const theoreticalValueTerm = `^${escapeRegex(ACCOUNTS.theoreticalValue)}(:|$)`

/** The inferred theoretical value's account alone: what nobody measured, apart from what was. */
export const inferredValueTerm = `^${escapeRegex(ACCOUNTS.inferredTheoreticalValue)}$`

export const talliesTerm = `tag:${TALLY_TAGS.playId}`

/** The tallies that say a spin performance: one their play's log measured, or one their play was inferred to have had. */
export const spinPerformanceTerm = `tag:^(${escapeRegex(TALLY_TAGS.spinPerformance)}|${escapeRegex(TALLY_TAGS.inferredSpinPerformance)})$`

export const tallyTerm = (id: PlayId): string => `tag:${TALLY_TAGS.playId}=^${escapeRegex(id)}$`

/** The entries of several tallies at once: any of their ids, each held to the whole of it. */
export const talliesAmongTerm = (ids: readonly PlayId[]): string => `tag:${TALLY_TAGS.playId}=^(${ids.map(escapeRegex).join("|")})$`

/**
 * The postings of entries that carry no tag of a name: what a cut by that
 * tag leaves out. hledger reads a tag's name as a pattern, which `machine`
 * alone would find in `source-machine` too, so the name is held to the
 * whole of it.
 */
export const untaggedTerm = (tag: string): string => `not:tag:^${escapeRegex(tag)}$`

/** Terms joined into one query, leaving out the empty ones. */
export const combine = (...terms: readonly string[]): string => terms.filter((term) => term.trim() !== "").join(" ")
