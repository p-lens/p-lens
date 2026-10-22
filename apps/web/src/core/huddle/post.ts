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

/**
 * A member leaving a huddle: the others mark the play they were on as
 * left, whatever it was doing, until the member shows anything again —
 * having come back by the same code the same day.
 */
export interface HuddleDeparture {
  readonly member: string
  readonly name: string
  /** ISO 8601. */
  readonly postedAt: string
  readonly left: true
}

/** What a huddle's line carries: a play shown, one taken back, or a member leaving. */
export type HuddleEntry = HuddlePost | HuddleWithdrawal | HuddleDeparture

export const isShown = (entry: HuddleEntry): entry is HuddlePost => "play" in entry

const isWithdrawal = (entry: HuddleEntry): entry is HuddleWithdrawal => "withdrawn" in entry

/** The shape an entry is written in, counted up when one an older app could not read is made. */
const FORMAT = 1

/** A play as it is shown to a huddle: what the device keeps of it for itself, and its history, left behind. */
export const huddlePostOf = (draft: PlayDraft, huddle: Huddle, postedAt: string): HuddlePost => {
  const { bookId: _book, recorded: _recorded, sent: _sent, received: _received, history: _history, ...play } = draft
  return { member: huddle.member, name: huddle.name, postedAt, play }
}

/** A play taken back from a huddle, by its id. */
export const huddleWithdrawalOf = (playId: PlayId, huddle: Huddle, postedAt: string): HuddleWithdrawal => ({ member: huddle.member, name: huddle.name, postedAt, withdrawn: playId })

/** This device leaving a huddle. */
export const huddleDepartureOf = (huddle: Huddle, postedAt: string): HuddleDeparture => ({ member: huddle.member, name: huddle.name, postedAt, left: true })

export const huddleEntryText = (entry: HuddleEntry): string => JSON.stringify({ format: FORMAT, ...entry })

const SHOWN_PARTS: ReadonlySet<string> = new Set(["format", "member", "name", "postedAt", "play"])

const WITHDRAWN_PARTS: ReadonlySet<string> = new Set(["format", "member", "name", "postedAt", "withdrawn"])

const DEPARTED_PARTS: ReadonlySet<string> = new Set(["format", "member", "name", "postedAt", "left"])

const isText = (value: unknown): value is string => typeof value === "string" && value !== ""

type Fields = Readonly<Record<string, unknown>>

const partsAre = (fields: Fields, parts: ReadonlySet<string>): boolean => Object.keys(fields).every((part) => parts.has(part))

const entryOf = (fields: Fields): HuddleEntry | undefined => {
  const [member, name, postedAt] = [fields["member"], fields["name"], fields["postedAt"]]
  if (fields["format"] !== FORMAT || !isText(member) || !isText(name) || !isText(postedAt)) return undefined
  if ("withdrawn" in fields) return partsAre(fields, WITHDRAWN_PARTS) && isText(fields["withdrawn"]) ? { member, name, postedAt, withdrawn: fields["withdrawn"] as PlayId } : undefined
  if ("left" in fields) return partsAre(fields, DEPARTED_PARTS) && fields["left"] === true ? { member, name, postedAt, left: true } : undefined
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
  new Set(entries.filter(isWithdrawal).map((entry) => keyOf(entry.member, entry.withdrawn)))

/**
 * A line's entries with every showing of a play but its latest let go:
 * what is kept of a line read all day, since each showing carries the
 * play's whole log. Plays taken back and members leaving are kept, all of
 * them and in their places, so nothing read from the line changes.
 */
export const latestEntries = (entries: readonly HuddleEntry[]): readonly HuddleEntry[] => {
  const latest = entries.filter(isShown).reduce((found, post) => ((kept) => (kept !== undefined && kept.postedAt > post.postedAt ? found : new Map(found).set(keyOf(post.member, post.play.id), post)))(found.get(keyOf(post.member, post.play.id))), new Map<string, HuddlePost>())
  return entries.filter((entry) => !isShown(entry) || latest.get(keyOf(entry.member, entry.play.id)) === entry)
}

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

/** One of the others' plays as it was last shown, whether it is the latest they showed — the one they are on, or were last — and whether they have since left the huddle. */
export interface HuddlePlay {
  readonly post: HuddlePost
  readonly latest: boolean
  readonly departed: boolean
}

/** The members whose last word is that they left — the latest said, whenever it reached the line: one who came back has shown something since. */
const departedOn = (entries: readonly HuddleEntry[]): ReadonlySet<string> => {
  const lastWords = entries.reduce((last, entry) => ((said) => (said !== undefined && said.postedAt > entry.postedAt ? last : new Map(last).set(entry.member, entry)))(last.get(entry.member)), new Map<string, HuddleEntry>())
  return new Set([...lastWords.values()].filter((entry) => "left" in entry).map((entry) => entry.member))
}

/** Plays the later begun first, by when each began, and then by who and which, so that two begun at once always stand the same way. */
const begunLaterFirst = (one: HuddlePost, other: HuddlePost): number =>
  other.play.startedAt.localeCompare(one.play.startedAt) || one.member.localeCompare(other.member) || one.play.id.localeCompare(other.play.id)

/** When a member began their first play of those shown. */
const firstBegun = (shown: readonly HuddlePost[], member: string): string => shown.findLast((post) => post.member === member)?.play.startedAt ?? ""

const laterOf = (found: HuddlePost | undefined, post: HuddlePost): HuddlePost => (found !== undefined && found.postedAt > post.postedAt ? found : post)

/**
 * Each of the others' plays as it was last shown: first the one each is on
 * — the one they began last — in the order they began their first play of
 * the day, those who left the huddle after those still in it, then those
 * they left for another machine, the one begun last first, at the end.
 * Every place is by when a play began, which a showing never moves, so the
 * list stands still however often each is shown again. A play they took
 * back is gone. This device's own are left out, its plays being in its own
 * list.
 */
export const othersPlays = (entries: readonly HuddleEntry[], member: string): readonly HuddlePlay[] => {
  const others = standingShown(entries).filter((post) => post.member !== member)
  const byPlay = others.reduce((found, post) => new Map(found).set(keyOf(post.member, post.play.id), laterOf(found.get(keyOf(post.member, post.play.id)), post)), new Map<string, HuddlePost>())
  const departed = departedOn(entries)
  const shown = [...byPlay.values()].toSorted(begunLaterFirst)
  const members = [...new Set(shown.toReversed().map((post) => post.member))].toSorted((one, other) => firstBegun(shown, one).localeCompare(firstBegun(shown, other)) || one.localeCompare(other))
  const marked = members.flatMap((who) => shown.filter((post) => post.member === who).map((post, at) => ({ post, latest: at === 0, departed: departed.has(who) })))
  const latest = marked.filter((each) => each.latest)
  const moved = marked.filter((each) => !each.latest).toSorted((one, other) => begunLaterFirst(one.post, other.post))
  return [...latest.filter((shown) => !shown.departed), ...latest.filter((shown) => shown.departed), ...moved]
}

/** The others' plays as this device's list has them: those given, less those it let go of. Letting go is the list's alone: what the plays came to together still counts them. */
export const listedFor = (plays: readonly HuddlePlay[], huddle: Huddle): readonly HuddlePlay[] => plays.filter(({ post }) => !huddle.dismissed.includes(huddlePlayKey(post.member, post.play.id)))
