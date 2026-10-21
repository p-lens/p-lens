import { nextDay, type IsoDate } from "../../core/calendar/calendar"
import type { TokenKind } from "../../core/commodity/commodity"
import { ACCOUNTS, rentalSpreadAccount, savingsAccount, savingsRoot } from "../../core/journal/accounts"
import type { PlayId } from "../../core/play/play"
import { TALLY_TAGS } from "../../core/tally/tally"
import { SAVINGS_TAG } from "../../core/savings/balance"
import { UNSENT } from "../../core/report/senders"

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

/** One account, and no account under another name. */
export const accountTerm = (account: string): string => `^${escapeRegex(account)}$`

/** A branch of the account tree: its root and every account under it. */
export const branchTerm = (root: string): string => `^${escapeRegex(root)}(:|$)`

/** The play time's account alone. */
export const playTimeTerm = `^${escapeRegex(ACCOUNTS.playTime)}$`

/** The loss on renting tokens above their exchange value, of every kind of token. */
export const rentalSpreadTerm = `^(${escapeRegex(rentalSpreadAccount("ball"))}|${escapeRegex(rentalSpreadAccount("medal"))})$`

/** The postings that take something away from their account: savings drawn on, rather than put back. */
export const drawnTerm = "amt:<0"

/** Every savings account of every kind of token, at every parlor. */
export const savingsTerm = `^(${escapeRegex(savingsRoot("ball"))}|${escapeRegex(savingsRoot("medal"))}):`

/** Every pool of savings at one parlor, balls and medals alike. */
export const parlorSavingsTerm = (parlorName: string): string => `^(${escapeRegex(savingsRoot("ball"))}|${escapeRegex(savingsRoot("medal"))}):${escapeRegex(parlorName)}:`

/** The entries that registered the savings a pool began with. */
export const openingBalanceTerm = (kind: TokenKind, parlorName: string, tier: string): string => `tag:${SAVINGS_TAG}=^opening$ ^${escapeRegex(savingsAccount(kind, parlorName, tier))}$`

/** The theoretical value's account and what is kept under it: the measured and the inferred together. */
export const theoreticalValueTerm = `^${escapeRegex(ACCOUNTS.theoreticalValue)}(:|$)`

/** The inferred theoretical value's account alone: what nobody measured, apart from what was. */
export const inferredValueTerm = `^${escapeRegex(ACCOUNTS.inferredTheoreticalValue)}$`

export const talliesTerm = `tag:${TALLY_TAGS.playId}`

/** Every posting but a forfeiture's: 失効損 is a line of その他損益, never part of 収支. */
export const notForfeitureTerm = `not:${accountTerm(ACCOUNTS.forfeiture)}`

/** The tallies of plays someone sent: those that name their sender by id. */
export const sentTalliesTerm = `tag:^${escapeRegex(TALLY_TAGS.senderId)}$`

/**
 * The tallies of those chosen among who played a book: senders by the id
 * their tallies carry, and the tallies that name no sender by `UNSENT`.
 * Where those are among them, it is every tally but the senders left out
 * of those offered — the empty term where none is — and otherwise the
 * chosen senders' alone. Nothing at all where nobody is chosen: no term
 * says that, so it is `undefined`, and nothing is asked.
 */
export const sendersTerm = (chosen: readonly string[], offered: readonly string[]): string | undefined => {
  const senders = (among: readonly string[]): readonly string[] => among.filter((each) => each !== UNSENT)
  const pattern = (ids: readonly string[]): string => `tag:^${escapeRegex(TALLY_TAGS.senderId)}$=^(${ids.map(escapeRegex).join("|")})$`
  if (chosen.includes(UNSENT)) return ((left) => (left.length === 0 ? "" : `not:${pattern(left)}`))(senders(offered).filter((each) => !chosen.includes(each)))
  return ((ids) => (ids.length === 0 ? undefined : pattern(ids)))(senders(chosen))
}

/**
 * The savings accounts of some parlors, by the names the book keeps them
 * under, of every kind of token and rate; nothing at all where none is
 * named, so it is `undefined`. Quoted, for a parlor's name may hold a
 * space, and a quote in one is matched by any letter.
 */
export const savingsAtTerm = (parlorNames: readonly string[]): string | undefined =>
  parlorNames.length === 0 ? undefined : `"^(${escapeRegex(savingsRoot("ball"))}|${escapeRegex(savingsRoot("medal"))}):(${parlorNames.map((name) => escapeRegex(name).replaceAll('"', ".")).join("|")}):"`

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
