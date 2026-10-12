import { isBusinessDayTurn, type BusinessDayTurn } from "../calendar/calendar"

/**
 * What a book says of itself to the app that keeps it, beside its journal:
 * one JSON file among the book's files, so it is backed up and synced with
 * the book and read by nothing else — no journal includes it, so hledger
 * never opens it.
 */
export const BOOK_SETTINGS_FILE = "settings.json"

/** A book's settings as this app reads them. A later version may keep more in the file; what this one does not know it leaves as it found it. */
export interface BookSettings {
  /** Where the book stands among its owner's books, lowest first; none where it was never placed. */
  readonly order: number | undefined
  /** The hour its owner's business day turns over at; none where it was never written. */
  readonly businessDayTurn: BusinessDayTurn | undefined
}

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * The file's fields, whatever they are; none where there is no file or it
 * does not read as one object. Two devices that each made the file before
 * hearing of the other can leave it as two objects run together, and such
 * a file says nothing until it is next written, whole.
 */
const fieldsOf = (text: string | undefined): Fields => {
  if (text === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return isFields(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const orderOf = (value: unknown): number | undefined => (typeof value === "number" && Number.isSafeInteger(value) ? value : undefined)

const businessDayTurnOf = (value: unknown): BusinessDayTurn | undefined => (typeof value === "number" && isBusinessDayTurn(value) ? value : undefined)

export const bookSettingsOf = (text: string | undefined): BookSettings => ((fields) => ({ order: orderOf(fields["order"]), businessDayTurn: businessDayTurnOf(fields["businessDayTurn"]) }))(fieldsOf(text))

/** The file with the book's place written in it, every other field as it was, a field to a line so that two devices changing different ones do not meet. */
export const withOrder = (text: string | undefined, order: number): string => `${JSON.stringify({ ...fieldsOf(text), order }, undefined, 2)}\n`

/** The file with the hour a business day turns over at written in it, every other field as it was. */
export const withBusinessDayTurn = (text: string | undefined, businessDayTurn: BusinessDayTurn): string => `${JSON.stringify({ ...fieldsOf(text), businessDayTurn }, undefined, 2)}\n`
