import type { IsoDate } from "../calendar/calendar"
import { renderCommodity } from "../commodity/commodity"
import { toPlainString, type Decimal } from "../decimal/decimal"

/** A quantity of one commodity, as one posting carries it. */
export interface Amount {
  readonly quantity: Decimal
  readonly commodity: string
}

/** What one unit of the posted commodity cost, in another: hledger's `@`. */
export interface UnitCost {
  readonly rate: Decimal
  readonly commodity: string
}

/**
 * One line of an entry.
 *
 * `real` postings take part in the balance; a `virtual` one is written in
 * parentheses and does not — hledger adds it up when asked about its account,
 * and leaves it out of every balanced report. P-Lens uses it for the
 * theoretical value, which is a figure worth summing and not money.
 */
export interface Posting {
  readonly account: string
  readonly amount: Amount
  readonly cost?: UnitCost
  readonly kind: "real" | "virtual"
}

export interface Entry {
  readonly date: IsoDate
  readonly description: string
  readonly tags: readonly (readonly [string, string])[]
  readonly postings: readonly Posting[]
  /** Lines of comment under the entry's postings, each a note a person wrote: read by people, passed over by hledger. They must hold no colon, which would make a tag of the word before it. */
  readonly notes?: readonly string[]
}

/** A bar would end a payee where it stands, so one inside a name gives way to its full-width twin. */
const barless = (text: string): string => text.replaceAll("|", "｜")

/**
 * An entry's description as hledger reads one: the payee, a bar, the
 * note — so `payee:` and `note:` find each, and a book groups by who was
 * paid without the app. A description with no bar is its own payee and
 * its own note, whole; so where either side is missing the other stands
 * alone, no bar beside it.
 */
export const describedBy = (payee: string | undefined, note: string): string =>
  [payee, note]
    .map((part) => barless(part ?? "").trim())
    .filter((part) => part !== "")
    .join(" | ")

const renderAmount = (amount: Amount): string => `${toPlainString(amount.quantity)} ${renderCommodity(amount.commodity)}`

const renderCost = (cost: UnitCost | undefined): string =>
  cost === undefined ? "" : ` @ ${toPlainString(cost.rate)} ${renderCommodity(cost.commodity)}`

const renderAccount = (posting: Posting): string => (posting.kind === "virtual" ? `(${posting.account})` : posting.account)

/** The column amounts start at, so a block of postings reads as a table. */
const AMOUNT_COLUMN = 36

const visualWidth = (text: string): number =>
  [...text].reduce((width, character) => width + (character.charCodeAt(0) > 0x2e7f ? 2 : 1), 0)

const renderPosting = (posting: Posting): string => {
  const account = renderAccount(posting)
  const gap = " ".repeat(Math.max(2, AMOUNT_COLUMN - visualWidth(account)))
  return `    ${account}${gap}${renderAmount(posting.amount)}${renderCost(posting.cost)}`
}

/**
 * Tags written in the entry's comment. A value cannot carry a comma, which
 * would end it, so commas are refused before an entry is composed.
 */
const renderTags = (tags: Entry["tags"]): string =>
  tags.length === 0 ? "" : `  ; ${tags.map(([name, value]) => `${name}: ${value}`).join(", ")}`

/** An entry as journal text, ending with a newline. */
export const renderEntry = (entry: Entry): string =>
  [`${entry.date} ${entry.description}${renderTags(entry.tags)}`, ...entry.postings.map(renderPosting), ...(entry.notes ?? []).map((note) => `    ; ${note}`)].join("\n") + "\n"
