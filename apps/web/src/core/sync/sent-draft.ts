import { parseIsoDate } from "../calendar/calendar"
import type { Operation, PlayDraft, PlayVenue } from "../live-play/draft"
import type { Parlor, ParlorIdentity } from "../parlor/parlor"
import type { PlayTerms } from "../parlor/terms"
import type { PlayGameKind, PlayId } from "../play/play"
import { parsePlayLog } from "../play-log/checkpoint"
import type { End } from "../play-log/end"

/**
 * A play sent to another person: the play as its sender's device has it —
 * its readings, where and on what it was played, what it is weighed by —
 * with everything done to its log since it began, how it was said to have
 * ended where it was, and who sent it, as the start of the token they send
 * by, which only the book's owner can put a name to. Which book it goes
 * into is its receiver's to say, so it names none.
 */
export interface SentDraft {
  readonly play: Omit<PlayDraft, "bookId" | "recorded" | "sent" | "received">
  readonly ended: End | undefined
  readonly sender: string
  /** ISO 8601. */
  readonly sentAt: string
}

/** The shape a sent play is written in, counted up when one an older app could not read is made. */
const FORMAT = 1

/** A play as it is sent: what the device keeps of it for itself — its book, and its marks — left behind. */
export const sentDraftOf = (draft: PlayDraft, sender: string, sentAt: string): SentDraft => {
  const { bookId: _book, recorded, sent: _sent, received: _received, ...play } = draft
  return { play, ended: recorded?.end, sender, sentAt }
}

/** A sent play as the text that is sealed and sent. A draft is plain figures and words throughout, so it is written as it is. */
export const sentDraftText = (sent: SentDraft): string => JSON.stringify({ format: FORMAT, ...sent })

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0

const pairOf = (value: unknown, first: string, second: string): boolean => isFields(value) && isCount(value[first]) && isCount(value[second])

const termsOf = (value: unknown): PlayTerms | undefined =>
  isFields(value) && pairOf(value["rental"], "yen", "tokens") && pairOf(value["exchange"], "tokens", "yen") && pairOf(value["replay"], "paidOut", "deducted") ? (value as unknown as PlayTerms) : undefined

const identityOf = (value: unknown): ParlorIdentity | undefined => {
  if (!isFields(value)) return undefined
  if (value["type"] === "listed" && typeof value["id"] === "string") return { type: "listed", id: value["id"] } as ParlorIdentity
  return value["type"] === "submitted" && typeof value["submission"] === "string" ? ({ type: "submitted", submission: value["submission"] } as ParlorIdentity) : undefined
}

/** A parlor as a sent play names it. The pools it keeps are the receiving book's to know, and are given by that book when the play is taken in. */
const parlorOf = (value: unknown): Parlor | undefined => {
  const identity = isFields(value) ? identityOf(value["identity"]) : undefined
  const name = isFields(value) ? text(value["name"]) : undefined
  return identity === undefined || name === undefined || name === "" ? undefined : { identity, name, pools: [] }
}

const venueOf = (value: unknown): PlayVenue | undefined => {
  if (!isFields(value)) return undefined
  if (value["type"] === "none") return value["terms"] === undefined ? { type: "none", terms: undefined } : ((terms) => (terms === undefined ? undefined : { type: "none" as const, terms }))(termsOf(value["terms"]))
  const [parlor, terms] = [parlorOf(value["parlor"]), termsOf(value["terms"])]
  return value["type"] === "parlor" && parlor !== undefined && terms !== undefined ? { type: "parlor", parlor, terms } : undefined
}

const linesOf = (value: unknown): readonly string[] | undefined => (Array.isArray(value) && value.every((line) => typeof line === "string") ? value : undefined)

const historyOf = (value: unknown): readonly Operation[] =>
  (Array.isArray(value) ? value : []).flatMap((each) => {
    const [at, removed, added] = isFields(each) ? [text(each["at"]), linesOf(each["removed"]), linesOf(each["added"])] : [undefined, undefined, undefined]
    return at === undefined || removed === undefined || added === undefined ? [] : [{ at, removed, added }]
  })

const endOf = (value: unknown): End | undefined =>
  isFields(value) ? { at: text(value["at"]), counter: typeof value["counter"] === "number" ? value["counter"] : undefined } : undefined

const parsed = (written: string): unknown => {
  try {
    return JSON.parse(written)
  } catch {
    return undefined
  }
}

/**
 * A sent play read back from its text, or undefined where it is none this
 * app reads. What every play must say is checked — which play, its day and
 * game, where it was played and on what terms, and a log that reads — and
 * an operation that does not read is passed over. What a play is weighed
 * by is taken as it was sent: it is the sender's own formula, and only the
 * engine that weighs by it can say more of it.
 */
export const readSentDraft = (written: string): SentDraft | undefined => {
  const sent = parsed(written)
  if (!isFields(sent) || sent["format"] !== FORMAT || !isFields(sent["play"])) return undefined
  const play = sent["play"]
  const [id, machine, startedAt, log, sender, sentAt] = [text(play["id"]), text(play["machine"]), text(play["startedAt"]), text(play["log"]), text(sent["sender"]), text(sent["sentAt"])]
  const date = parseIsoDate(text(play["date"]) ?? "")
  const gameKind = play["gameKind"] === "pachinko" || play["gameKind"] === "slot" ? (play["gameKind"] as PlayGameKind) : undefined
  const venue = venueOf(play["venue"])
  if (id === undefined || id === "" || machine === undefined || startedAt === undefined || log === undefined || sender === undefined || sentAt === undefined || !date.ok || gameKind === undefined || venue === undefined) return undefined
  if (!parsePlayLog(log).ok) return undefined
  return {
    play: {
      id: id as PlayId,
      date: date.value,
      venue,
      gameKind,
      machine,
      pachinko: isFields(play["pachinko"]) ? (play["pachinko"] as unknown as PlayDraft["pachinko"]) : undefined,
      ...(Array.isArray(play["bonuses"]) ? { bonuses: play["bonuses"] as NonNullable<PlayDraft["bonuses"]> } : {}),
      ...(isFields(play["pachislot"]) ? { pachislot: play["pachislot"] as unknown as NonNullable<PlayDraft["pachislot"]> } : {}),
      cabinetNumber: text(play["cabinetNumber"]),
      startedAt,
      log,
      history: historyOf(play["history"]),
    },
    ended: endOf(sent["ended"]),
    sender,
    sentAt,
  }
}
