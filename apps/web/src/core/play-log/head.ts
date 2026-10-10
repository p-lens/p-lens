import type { IsoDate } from "../calendar/calendar"
import type { ParlorIdentity } from "../parlor/parlor"
import type { PlayTerms } from "../parlor/terms"
import type { PlayGameKind, PlayId } from "../play/play"

/**
 * What a recorded play's log says of the play itself, in its first line:
 * where it was played and on what terms, on which cabinet of which
 * machine, and what it was weighed by. The lines after it are readings,
 * all of one shape, to be read as columns; this one is not a reading and
 * says so itself, so whoever reads the file by its lines knows to set the
 * first aside, as a table's header is.
 *
 * Only a recorded play's log has one. A play still being played is the
 * device's, and says all this beside its log, where it can still be set
 * right; the head is written from that as the play is recorded.
 */
export interface PlayLogHead {
  readonly playId: PlayId
  readonly gameKind: PlayGameKind
  readonly date: IsoDate
  /** When the play began, as an ISO 8601 timestamp. */
  readonly startedAt: string
  readonly parlor: { readonly name: string; readonly identity: ParlorIdentity } | undefined
  /** The corner's terms: the book keeps a pool and a day's rate, and this is where the rest of them is kept. */
  readonly terms: PlayTerms | undefined
  readonly machine: string
  readonly cabinetNumber: string | undefined
  /** The formula the play was weighed by, by its id in the catalog; none for a play weighed by none. */
  readonly formulaId: string | undefined
  /** The 設定配分 a pachislot play was weighed with, by its id, or an even spread; none for a pachinko play. */
  readonly prior: { readonly type: "even" } | { readonly type: "distribution"; readonly id: string } | undefined
}

const ABOUT = "P-Lens play log. This first line is its header and says what the play was; every line after it is one reading of the play. The format is described at https://github.com/p-lens/p-lens."

/**
 * The version of the play log's schema — the head's shape and a reading's
 * together — as the README describes it. It goes up when either changes
 * so that a reader of the version before would misread the file.
 */
const SCHEMA_VERSION = 1

const parlorFields = (parlor: NonNullable<PlayLogHead["parlor"]>): Readonly<Record<string, string>> =>
  parlor.identity.type === "listed" ? { name: parlor.name, id: parlor.identity.id } : { name: parlor.name, submission: parlor.identity.submission }

const headLine = (head: PlayLogHead): string =>
  JSON.stringify({
    header: true,
    about: ABOUT,
    v: SCHEMA_VERSION,
    playId: head.playId,
    gameKind: head.gameKind,
    date: head.date,
    startedAt: head.startedAt,
    parlor: head.parlor === undefined ? undefined : parlorFields(head.parlor),
    terms: head.terms,
    machine: head.machine,
    cabinetNumber: head.cabinetNumber,
    formulaId: head.formulaId,
    prior: head.prior,
  })

/** A play's readings with its head before them, as a book keeps the log. */
export const withHead = (log: string, head: PlayLogHead): string => `${headLine(head)}\n${log}`

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

/** A line's fields where it says it is a log's head. */
const headFields = (text: string): Fields | undefined => {
  const fields = parsed(text)
  return isFields(fields) && fields["header"] === true ? fields : undefined
}

/** Whether a line says it is a log's head, and so is no reading. */
export const isHeadLine = (text: string): boolean => headFields(text) !== undefined

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0

const isStated = (value: unknown): value is { readonly yen: number; readonly tokens: number } => isFields(value) && isCount(value["yen"]) && isCount(value["tokens"])

const isReplay = (value: unknown): value is PlayTerms["replay"] => isFields(value) && isCount(value["paidOut"]) && isCount(value["deducted"])

/**
 * The corner's terms a recorded play's log says in its head: the only
 * place a book keeps them whole. None for a log with no head, a head that
 * states none — a play at no corner — or terms that do not read as terms.
 */
export const termsInHead = (log: string): PlayTerms | undefined => {
  const terms = headFields(log.split("\n").find((line) => line.trim() !== "") ?? "")?.["terms"]
  if (!isFields(terms)) return undefined
  const { rental, exchange, replay } = terms
  return isStated(rental) && isStated(exchange) && isReplay(replay)
    ? { rental: { yen: rental.yen, tokens: rental.tokens }, exchange: { yen: exchange.yen, tokens: exchange.tokens }, replay: { paidOut: replay.paidOut, deducted: replay.deducted } }
    : undefined
}
