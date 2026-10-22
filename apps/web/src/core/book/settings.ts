import { isBusinessDayTurn, type BusinessDayTurn } from "../calendar/calendar"
import type { PlayGameKind } from "../play/play"
import { Err, Ok, andThen, mapOk, type Result } from "../result/result"

/**
 * What a book says of itself to the app that keeps it, beside its journal:
 * one JSON file among the book's files, so it is backed up and synced with
 * the book and read by nothing else — no journal includes it, so hledger
 * never opens it.
 */
export const BOOK_SETTINGS_FILE = "settings.json"

/** What one press of a live play's buttons adds at a corner, where the person has set it: yen rented, tokens drawn. */
export interface PressAmounts {
  readonly rental?: number
  readonly draw?: number
}

/** The most digits a press's amount has: ¥10,000 at a press is how some rent. */
export const PRESS_DIGITS = 5

/** What a tally typed in by hand was last weighed on, at a game's corner: so many tokens for ¥1,000 rented, so many for ¥100 of prizes. */
export interface InferenceTerms {
  readonly rentedPerThousand: number
  readonly exchangedPerHundred: number
}

/** The terms kept for each game, balls and medals being no measure of each other; none kept for a game whose tallies were never weighed on any. */
export type KeptInferenceTerms = Readonly<Partial<Record<PlayGameKind, InferenceTerms>>>

/** A book's settings as this app reads them. A later version may keep more in the file; what this one does not know it leaves as it found it. */
export interface BookSettings {
  /** Where the book stands among its owner's books, lowest first; none where it was never placed. */
  readonly order: number | undefined
  /** The hour its owner's business day turns over at; none where it was never written. */
  readonly businessDayTurn: BusinessDayTurn | undefined
  /** What a press adds at each corner, by what the corner is called (`cornerOf`: `4円パチ`); none set at a corner, none kept. */
  readonly presses: Readonly<Record<string, PressAmounts>>
  /** The terms the last tally typed in by hand of each game was weighed on (`inferenceTerms`), which the next opens on. */
  readonly inferenceTerms: KeptInferenceTerms
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

const isPressAmount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value < 10 ** PRESS_DIGITS

/** A corner's amounts: each this app knows must read, and what it does not know is left as it was found. */
const amountsOf = (value: unknown): PressAmounts | undefined => {
  if (!isFields(value) || [value["rental"], value["draw"]].some((amount) => amount !== undefined && !isPressAmount(amount))) return undefined
  return { ...(isPressAmount(value["rental"]) ? { rental: value["rental"] } : {}), ...(isPressAmount(value["draw"]) ? { draw: value["draw"] } : {}) }
}

const pressesOf = (value: unknown): BookSettings["presses"] | undefined => {
  if (!isFields(value)) return undefined
  const read = Object.entries(value).flatMap(([corner, amounts]) => ((found) => (found === undefined ? [] : [[corner, found] as const]))(amountsOf(amounts)))
  return read.length === Object.keys(value).length ? Object.fromEntries(read) : undefined
}

const GAMES: readonly PlayGameKind[] = ["pachinko", "pachislot"]

const termsOf = (value: unknown): InferenceTerms | undefined => {
  if (!isFields(value)) return undefined
  const [rented, exchanged] = [value["rentedPerThousand"], value["exchangedPerHundred"]]
  return typeof rented === "number" && Number.isSafeInteger(rented) && rented > 0 && typeof exchanged === "number" && Number.isFinite(exchanged) && exchanged > 0 ? { rentedPerThousand: rented, exchangedPerHundred: exchanged } : undefined
}

/** The terms kept for each game this app knows: each that is there must read; a game it does not know it leaves as it found it. */
const inferenceTermsOf = (value: unknown): KeptInferenceTerms | undefined => {
  if (!isFields(value)) return undefined
  const read = GAMES.filter((game) => value[game] !== undefined).map((game) => [game, termsOf(value[game])] as const)
  return read.every(([, terms]) => terms !== undefined) ? Object.fromEntries(read) : undefined
}

/** A book's settings, or that its file is there and does not read: a field it has that this app reads must read as this app writes it. */
export const bookSettingsOf = (text: string | undefined): Result<BookSettings, SettingsUnreadable> =>
  andThen(fieldsOf(text), (fields) => {
    const [order, businessDayTurn, presses, inferenceTerms] = [fieldOf(fields["order"], orderOf), fieldOf(fields["businessDayTurn"], businessDayTurnOf), fieldOf(fields["presses"], pressesOf), fieldOf(fields["inferenceTerms"], inferenceTermsOf)]
    if (!order.ok) return order
    if (!businessDayTurn.ok) return businessDayTurn
    if (!presses.ok) return presses
    return inferenceTerms.ok ? Ok({ order: order.value, businessDayTurn: businessDayTurn.value, presses: presses.value ?? {}, inferenceTerms: inferenceTerms.value ?? {} }) : inferenceTerms
  })

const written = (fields: Fields): string => `${JSON.stringify(fields, undefined, 2)}\n`

/** The file with the book's place written in it, every other field as it was, a field to a line so that two devices changing different ones do not meet; a file that does not read is not written over. */
export const withOrder = (text: string | undefined, order: number): Result<string, SettingsUnreadable> => mapOk(fieldsOf(text), (fields) => written({ ...fields, order }))

/** The file with the hour a business day turns over at written in it, every other field as it was; a file that does not read is not written over. */
export const withBusinessDayTurn = (text: string | undefined, businessDayTurn: BusinessDayTurn): Result<string, SettingsUnreadable> =>
  mapOk(fieldsOf(text), (fields) => written({ ...fields, businessDayTurn }))

/** The file with what a press adds at one corner written in it, every other corner and field as it was, and what this app does not know at that corner too; a file that does not read is not written over. */
export const withPresses = (text: string | undefined, corner: string, amounts: PressAmounts): Result<string, SettingsUnreadable> =>
  andThen(fieldsOf(text), (fields) => {
    const kept = fieldOf(fields["presses"], pressesOf)
    const presses = isFields(fields["presses"]) ? fields["presses"] : {}
    const { rental: _rental, draw: _draw, ...unknown } = isFields(presses[corner]) ? presses[corner] : {}
    return mapOk(kept, () => written({ ...fields, presses: { ...presses, [corner]: { ...unknown, ...amounts } } }))
  })

/** The file with the terms a game's tally typed in by hand was weighed on written in it, every other game and field as it was; a file that does not read is not written over. */
export const withInferenceTerms = (text: string | undefined, game: PlayGameKind, terms: InferenceTerms): Result<string, SettingsUnreadable> =>
  andThen(fieldsOf(text), (fields) => {
    const kept = fieldOf(fields["inferenceTerms"], inferenceTermsOf)
    return mapOk(kept, () => written({ ...fields, inferenceTerms: { ...(isFields(fields["inferenceTerms"]) ? fields["inferenceTerms"] : {}), [game]: { rentedPerThousand: terms.rentedPerThousand, exchangedPerHundred: terms.exchangedPerHundred } } }))
  })
