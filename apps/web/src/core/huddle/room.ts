import type { PlayDraft } from "../live-play/draft"
import type { Play } from "../live-play/draft-reading"
import { tokenValueOf } from "../parlor/terms"
import { parsePlayLog, type Checkpoint } from "../play-log/checkpoint"
import { inPlayOrder } from "../play-log/performance"
import type { PlayGameKind } from "../play/play"
import type { Huddle } from "./huddle"
import type { HuddlePlay } from "./post"

/** One of the people in a huddle's room: who they are in it, the name they go by there, and whether they are this device. */
export interface RoomMember {
  readonly member: string
  readonly name: string
  readonly own: boolean
}

/**
 * The people in a huddle's room: this device first, then the others in the
 * order their plays are listed, each once, under the name they last went by.
 */
export const roomMembersOf = (huddle: Huddle, others: readonly HuddlePlay[]): readonly RoomMember[] => {
  const named = others.reduce((found, { post }) => (found.has(post.member) ? found : new Map(found).set(post.member, post.name)), new Map<string, string>())
  return [{ member: huddle.member, name: huddle.name, own: true }, ...[...named].map(([member, name]) => ({ member, name, own: false }))]
}

/** A play in a huddle's room, under who plays it, and whether it is the one they are on — their latest — rather than one they moved from. */
export interface RoomPlay {
  readonly member: string
  readonly play: Play
  readonly latest: boolean
}

/**
 * The plays in a huddle's room: this device's own first, newest begun
 * first, the newest the one it is on — those sent to it from someone else
 * are theirs, and left out — then the others' as they are listed.
 */
export const roomPlaysOf = (huddle: Huddle, drafts: readonly PlayDraft[], others: readonly HuddlePlay[]): readonly RoomPlay[] => [
  ...drafts
    .filter((draft) => draft.received === undefined)
    .toSorted((one, other) => other.startedAt.localeCompare(one.startedAt))
    .map((play, at) => ({ member: huddle.member, play, latest: at === 0 })),
  ...others.map(({ post, latest }) => ({ member: post.member, play: post.play, latest })),
]

/** The tokens in hand of one game across a room: how many, and what those whose corner is known come to at its exchange rate. */
export interface HeldTotal {
  readonly tokens: number
  readonly yen: number
}

/**
 * What a room's plays come to together: the cash spent on every one of
 * them, and the tokens in hand of each game — on the play each person is
 * on alone, as last counted there, since what they had on a play they
 * moved from went with them to the next.
 */
export interface RoomTotal {
  readonly outlay: number
  readonly held: Readonly<Record<PlayGameKind, HeldTotal>>
}

const lastOf = (ordered: readonly Checkpoint[], read: (checkpoint: Checkpoint) => number | undefined): number =>
  ordered.map(read).findLast((value): value is number => value !== undefined) ?? 0

const checkpointsOf = (play: Play): readonly Checkpoint[] => ((read) => (read.ok ? inPlayOrder(read.value) : []))(parsePlayLog(play.log))

const heldOf = (play: Play): HeldTotal => {
  const tokens = lastOf(checkpointsOf(play), (checkpoint) => checkpoint.held)
  const terms = play.venue.terms
  return { tokens, yen: terms === undefined ? 0 : Math.round(tokens * tokenValueOf(terms)) }
}

const NO_TOKENS: HeldTotal = { tokens: 0, yen: 0 }

const together = (one: HeldTotal, other: HeldTotal): HeldTotal => ({ tokens: one.tokens + other.tokens, yen: one.yen + other.yen })

export const roomTotalOf = (plays: readonly RoomPlay[]): RoomTotal => ({
  outlay: plays.reduce((sum, { play }) => sum + lastOf(checkpointsOf(play), (checkpoint) => checkpoint.outlay), 0),
  held: {
    pachinko: plays.filter(({ play, latest }) => latest && play.gameKind === "pachinko").map(({ play }) => heldOf(play)).reduce(together, NO_TOKENS),
    pachislot: plays.filter(({ play, latest }) => latest && play.gameKind === "pachislot").map(({ play }) => heldOf(play)).reduce(together, NO_TOKENS),
  },
})

/** The plays of those chosen out of a room: every one's where nothing is left out. */
export const playsOfChosen = (plays: readonly RoomPlay[], chosen: readonly string[] | undefined): readonly RoomPlay[] =>
  chosen === undefined ? plays : plays.filter(({ member }) => chosen.includes(member))
