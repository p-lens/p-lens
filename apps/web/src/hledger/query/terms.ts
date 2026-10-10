import { monthOf, nextDay, type IsoDate } from "../../core/calendar/calendar"
import type { TokenKind } from "../../core/commodity/commodity"
import { ACCOUNTS, savingsAccount, savingsRoot } from "../../core/journal/accounts"
import type { PlayId } from "../../core/play/play"
import { PLAY_TAGS } from "../../core/play/play"
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

export const dayTerm = (date: IsoDate): string => `date:${date}`

export const monthTerm = (date: IsoDate): string => `date:${monthOf(date)}`

/** Everything up to and including a day; hledger's end is exclusive. */
export const untilTerm = (date: IsoDate): string => `date:..${nextDay(date)}`

/** Every savings account of every kind of token, at every parlor. */
export const savingsTerm = `^(${escapeRegex(savingsRoot("ball"))}|${escapeRegex(savingsRoot("medal"))}):`

/** The entries that registered the savings a pool began with. */
export const openingBalanceTerm = (kind: TokenKind, parlorName: string, tier: string): string => `tag:${SAVINGS_TAG}=^opening$ ^${escapeRegex(savingsAccount(kind, parlorName, tier))}$`

export const theoreticalValueTerm = `^${escapeRegex(ACCOUNTS.theoreticalValue)}$`

export const playsTerm = `tag:${PLAY_TAGS.playId}`

export const playTerm = (id: PlayId): string => `tag:${PLAY_TAGS.playId}=^${escapeRegex(id)}$`

/**
 * The postings of entries that carry no tag of a name: what a cut by that
 * tag leaves out. hledger reads a tag's name as a pattern, which `machine`
 * alone would find in `source-machine` too, so the name is held to the
 * whole of it.
 */
export const untaggedTerm = (tag: string): string => `not:tag:^${escapeRegex(tag)}$`

/** Terms joined into one query, leaving out the empty ones. */
export const combine = (...terms: readonly string[]): string => terms.filter((term) => term.trim() !== "").join(" ")
