import type { PlayDraft } from "../live-play/draft"
import { readPlay, type Play } from "../live-play/draft-reading"
import type { Finish } from "../play-log/finish"

/**
 * A play sent to another person: the play as its sender's device has it —
 * its readings, where and on what it was played, what it is weighed by —
 * with everything done to its log since it began, how it was said to have
 * finished where it was, and who sent it, as the start of the token they send
 * by, which only the book's owner can put a name to. Which book it goes
 * into is its receiver's to say, so it names none.
 */
export interface SentDraft {
  readonly play: Play
  readonly finished: Finish | undefined
  readonly sender: string
  /** ISO 8601. */
  readonly sentAt: string
}

/** The shape a sent play is written in, counted up when one an older app could not read is made. */
const FORMAT = 1

/** A play as it is sent: what the device keeps of it for itself — its book, and its marks — left behind. */
export const sentDraftOf = (draft: PlayDraft, sender: string, sentAt: string): SentDraft => {
  const { bookId: _book, recorded, sent: _sent, received: _received, ...play } = draft
  return { play, finished: recorded?.finish, sender, sentAt }
}

/** A sent play as the text that is sealed and sent. A draft is plain figures and words throughout, so it is written as it is. */
export const sentDraftText = (sent: SentDraft): string => JSON.stringify({ format: FORMAT, ...sent })

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)

const isFinish = (value: unknown): value is Finish =>
  isFields(value) &&
  Object.keys(value).every((name) => name === "at" || name === "counter") &&
  (value["at"] === undefined || typeof value["at"] === "string") &&
  (value["counter"] === undefined || typeof value["counter"] === "number")

/** The parts a sent play is written with; one naming another part is none this app reads, and would be read wrongly as leaving that part out. */
const SENT_PARTS: ReadonlySet<string> = new Set(["format", "play", "finished", "sender", "sentAt"])

/** A play as it arrived, with the pools its parlor keeps left to the receiving book, which gives them when the play is taken in. */
const arrivedOf = (play: Play): Play => (play.venue.type === "parlor" ? { ...play, venue: { ...play.venue, parlor: { ...play.venue.parlor, pools: [] } } } : play)

const parsed = (written: string): unknown => {
  try {
    return JSON.parse(written)
  } catch {
    return undefined
  }
}

/**
 * A sent play read back from its text, or undefined where it is none this
 * app reads: every part of the play that is there must read, as a kept
 * draft's must, and so must how it was said to have finished where that is
 * said. What a play is weighed by is read as far as the app reads it
 * itself; only the engine that weighs by it can say more of it.
 */
export const readSentDraft = (written: string): SentDraft | undefined => {
  const sent = parsed(written)
  if (!isFields(sent) || sent["format"] !== FORMAT || !Object.keys(sent).every((part) => SENT_PARTS.has(part))) return undefined
  const [play, sender, sentAt] = [readPlay(sent["play"]), text(sent["sender"]), text(sent["sentAt"])]
  const finished = sent["finished"]
  if (play === undefined || sender === undefined || sentAt === undefined || !(finished === undefined || isFinish(finished))) return undefined
  return { play: arrivedOf(play), finished, sender, sentAt }
}
