import type { PlayDraft } from "../live-play/draft"
import { readPlay, type Play } from "../live-play/draft-reading"
import type { PlayId } from "../play/play"
import { huddlePlayKey, type Huddle } from "./huddle"

/**
 * One play as a member of a huddle shows it to the others: the play as
 * their device has it — its readings, where and on what it is played,
 * what it is weighed by — and who they are in the huddle. Its history is
 * left behind: the others see where it stands, and a play shown again
 * and again stays small.
 */
export interface HuddlePost {
  readonly member: string
  readonly name: string
  /** ISO 8601. */
  readonly postedAt: string
  readonly play: Play
}

/**
 * A play a member of a huddle took back: given up on their device — begun
 * on the wrong machine, say — so the others let it go too. Only the play's
 * id goes, under who took it back.
 */
export interface HuddleWithdrawal {
  readonly member: string
  readonly name: string
  /** ISO 8601. */
  readonly postedAt: string
  readonly withdrawn: PlayId
}

/** What a huddle's line carries: a play shown, or one taken back. */
export type HuddleEntry = HuddlePost | HuddleWithdrawal

export const isShown = (entry: HuddleEntry): entry is HuddlePost => "play" in entry

/** The shape an entry is written in, counted up when one an older app could not read is made. */
const FORMAT = 1

/** A play as it is shown to a huddle: what the device keeps of it for itself, and its history, left behind. */
export const huddlePostOf = (draft: PlayDraft, huddle: Huddle, postedAt: string): HuddlePost => {
  const { bookId: _book, recorded: _recorded, sent: _sent, received: _received, history: _history, ...play } = draft
  return { member: huddle.member, name: huddle.name, postedAt, play }
}

/** A play taken back from a huddle, by its id. */
export const huddleWithdrawalOf = (playId: PlayId, huddle: Huddle, postedAt: string): HuddleWithdrawal => ({ member: huddle.member, name: huddle.name, postedAt, withdrawn: playId })

export const huddleEntryText = (entry: HuddleEntry): string => JSON.stringify({ format: FORMAT, ...entry })

const SHOWN_PARTS: ReadonlySet<string> = new Set(["format", "member", "name", "postedAt", "play"])

const WITHDRAWN_PARTS: ReadonlySet<string> = new Set(["format", "member", "name", "postedAt", "withdrawn"])

const isText = (value: unknown): value is string => typeof value === "string" && value !== ""

type Fields = Readonly<Record<string, unknown>>

const partsAre = (fields: Fields, parts: ReadonlySet<string>): boolean => Object.keys(fields).every((part) => parts.has(part))

const entryOf = (fields: Fields): HuddleEntry | undefined => {
  const [member, name, postedAt] = [fields["member"], fields["name"], fields["postedAt"]]
  if (fields["format"] !== FORMAT || !isText(member) || !isText(name) || !isText(postedAt)) return undefined
  if ("withdrawn" in fields) return partsAre(fields, WITHDRAWN_PARTS) && isText(fields["withdrawn"]) ? { member, name, postedAt, withdrawn: fields["withdrawn"] as PlayId } : undefined
  const play = readPlay(fields["play"])
  return partsAre(fields, SHOWN_PARTS) && play !== undefined ? { member, name, postedAt, play } : undefined
}

/** An entry read back from its text, or none where it is none this app reads: a shown play must read as a kept draft's does. */
export const readHuddleEntry = (written: string): HuddleEntry | undefined => {
  try {
    const sent: unknown = JSON.parse(written)
    return typeof sent === "object" && sent !== null && !Array.isArray(sent) ? entryOf(sent as Fields) : undefined
  } catch {
    return undefined
  }
}

const keyOf = huddlePlayKey

/** The plays taken back on a line, by member and id. */
const withdrawnOn = (entries: readonly HuddleEntry[]): ReadonlySet<string> =>
  new Set(entries.flatMap((entry) => (isShown(entry) ? [] : [keyOf(entry.member, entry.withdrawn)])))

/** The plays shown on a line and never taken back. */
const standingShown = (entries: readonly HuddleEntry[]): readonly HuddlePost[] => {
  const withdrawn = withdrawnOn(entries)
  return entries.filter(isShown).filter((post) => !withdrawn.has(keyOf(post.member, post.play.id)))
}

/**
 * The plays this device showed and has since given up: shown on the line,
 * not taken back, and no longer among those it keeps — to be taken back,
 * whichever screen gave them up, and whenever.
 */
export const givenUp = (entries: readonly HuddleEntry[], member: string, kept: ReadonlySet<string>): readonly PlayId[] => [
  ...new Set(standingShown(entries).flatMap((post) => (post.member === member && !kept.has(post.play.id) ? [post.play.id] : []))),
]

/** One of the others' plays as it was last shown, and whether it is the latest they showed: the one they are on, or were last. */
export interface HuddlePlay {
  readonly post: HuddlePost
  readonly latest: boolean
}

const laterOf = (found: HuddlePost | undefined, post: HuddlePost): HuddlePost => (found !== undefined && found.postedAt > post.postedAt ? found : post)

/**
 * Each of the others' plays as it was last shown, the others in the order
 * they first showed anything and each one's plays newest shown first: a
 * person moving to another machine keeps the play they left, and the one
 * they are on is their latest; a play they took back is gone. This
 * device's own are left out, its plays being in its own list.
 */
export const othersPlays = (entries: readonly HuddleEntry[], member: string): readonly HuddlePlay[] => {
  const others = standingShown(entries).filter((post) => post.member !== member)
  const byPlay = others.reduce((found, post) => new Map(found).set(keyOf(post.member, post.play.id), laterOf(found.get(keyOf(post.member, post.play.id)), post)), new Map<string, HuddlePost>())
  return [...new Set(others.map((post) => post.member))].flatMap((who) => {
    const theirs = [...byPlay.values()].filter((post) => post.member === who).toSorted((left, right) => right.postedAt.localeCompare(left.postedAt))
    return theirs.map((post, at) => ({ post, latest: at === 0 }))
  })
}

/** The others' plays as this device's list has them: as they were shown (`othersPlays`), less those it let go of. */
export const othersPlaysFor = (entries: readonly HuddleEntry[], huddle: Huddle): readonly HuddlePlay[] =>
  othersPlays(entries, huddle.member).filter(({ post }) => !huddle.dismissed.includes(huddlePlayKey(post.member, post.play.id)))
