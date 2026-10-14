import { isBusinessDayTurn, type BusinessDayTurn } from "../calendar/calendar"
import { Err, Ok, andThen, mapOk, type Result } from "../result/result"

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

/** A settings file that is there and reads as none this app writes. */
export interface SettingsUnreadable {
  readonly type: "settings-unreadable"
}

const UNREADABLE: SettingsUnreadable = { type: "settings-unreadable" }

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * The objects a file holds: one, or several run together. Two devices that
 * each made the file before hearing of the other leave it as two objects
 * run together, and the later says the more lately written.
 */
const objectsIn = (text: string): readonly unknown[] | undefined => {
  const whole = parsed(text)
  if (whole !== undefined) return [whole]
  const run = parsed(`[${text.trim().replace(/}\s*{/g, "},{")}]`)
  return Array.isArray(run) ? run : undefined
}

/** The file's fields, whatever they are; none where there is no file, and unreadable where it is no object, nor objects run together. */
const fieldsOf = (text: string | undefined): Result<Fields, SettingsUnreadable> => {
  if (text === undefined) return Ok({})
  const objects = objectsIn(text)
  return objects !== undefined && objects.every(isFields) ? Ok(Object.assign({}, ...objects) as Fields) : Err(UNREADABLE)
}

/** A field read by `read`: none where it is left out, unreadable where it is there and does not read. */
const fieldOf = <T>(value: unknown, read: (given: unknown) => T | undefined): Result<T | undefined, SettingsUnreadable> =>
  value === undefined ? Ok(undefined) : ((found) => (found === undefined ? Err(UNREADABLE) : Ok(found)))(read(value))

const orderOf = (value: unknown): number | undefined => (typeof value === "number" && Number.isSafeInteger(value) ? value : undefined)

const businessDayTurnOf = (value: unknown): BusinessDayTurn | undefined => (typeof value === "number" && isBusinessDayTurn(value) ? value : undefined)

/** A book's settings, or that its file is there and does not read: a field it has that this app reads must read as this app writes it. */
export const bookSettingsOf = (text: string | undefined): Result<BookSettings, SettingsUnreadable> =>
  andThen(fieldsOf(text), (fields) => {
    const [order, businessDayTurn] = [fieldOf(fields["order"], orderOf), fieldOf(fields["businessDayTurn"], businessDayTurnOf)]
    if (!order.ok) return order
    return businessDayTurn.ok ? Ok({ order: order.value, businessDayTurn: businessDayTurn.value }) : businessDayTurn
  })

const written = (fields: Fields): string => `${JSON.stringify(fields, undefined, 2)}\n`

/** The file with the book's place written in it, every other field as it was, a field to a line so that two devices changing different ones do not meet; a file that does not read is not written over. */
export const withOrder = (text: string | undefined, order: number): Result<string, SettingsUnreadable> => mapOk(fieldsOf(text), (fields) => written({ ...fields, order }))

/** The file with the hour a business day turns over at written in it, every other field as it was; a file that does not read is not written over. */
export const withBusinessDayTurn = (text: string | undefined, businessDayTurn: BusinessDayTurn): Result<string, SettingsUnreadable> =>
  mapOk(fieldsOf(text), (fields) => written({ ...fields, businessDayTurn }))
