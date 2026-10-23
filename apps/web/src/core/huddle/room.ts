import type { PlayDraft } from "../live-play/draft"
import type { Play } from "../live-play/draft-reading"
import { toPlainString } from "../decimal/decimal"
import { tokenValueOf } from "../parlor/terms"
import { parsePlayLog, type Checkpoint } from "../play-log/checkpoint"
import { inPlayOrder } from "../play-log/performance"
import type { PlayGameKind } from "../play/play"
import { stagesOf, type StageStep } from "../savings/odd-prize-reckoning"
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

/** A play in the room with whether its player left the huddle, while it is put in its place. */
type Placed = RoomPlay & { readonly departed: boolean }

/** Plays the later begun first, then by who and which, so that two begun at once always stand the same way. */
const begunLaterFirst = (one: Placed, other: Placed): number =>
  other.play.startedAt.localeCompare(one.play.startedAt) || one.member.localeCompare(other.member) || one.play.id.localeCompare(other.play.id)

/**
 * The plays in a huddle's room, this device's own among everyone's: first
 * the play each is on — the one they began last — in the order they began
 * their first play of the day, then those of the others who left, then
 * those gone quiet (`idleMembers`), then every play left for another
 * machine, the one begun last first. Every place is by when a play began,
 * so the list stands still however often a play is shown again. Of this
 * device's own, those sent to it from someone else are theirs, and left
 * out; it is never gone quiet to itself.
 */
/**
 * Whether a play is of the business day a huddle lasts: one left
 * unrecorded from a day before is kept in the live space to be recorded,
 * and is no huddle's of this one — neither shown to the others nor counted
 * in the room's total or its settling up.
 */
export const ofHuddleDay = (huddle: Pick<Huddle, "businessDay">, play: Pick<Play, "date">): boolean => play.date === huddle.businessDay

export const roomPlaysOf = (huddle: Huddle, drafts: readonly PlayDraft[], others: readonly HuddlePlay[], idle: ReadonlySet<string>): readonly RoomPlay[] => {
  const own = drafts
    .filter((draft) => draft.received === undefined && ofHuddleDay(huddle, draft))
    .toSorted((one, other) => other.startedAt.localeCompare(one.startedAt))
    .map((play, at): Placed => ({ member: huddle.member, play, latest: at === 0, departed: false }))
  const placed = [...own, ...others.filter(({ post }) => ofHuddleDay(huddle, post.play)).map(({ post, latest, departed }): Placed => ({ member: post.member, play: post.play, latest, departed }))].toSorted(begunLaterFirst)
  const firstBegun = (member: string): string => placed.findLast((each) => each.member === member)?.play.startedAt ?? ""
  const current = placed.filter((each) => each.latest).toSorted((one, other) => firstBegun(one.member).localeCompare(firstBegun(other.member)) || one.member.localeCompare(other.member))
  const quiet = (each: Placed): boolean => !each.departed && each.member !== huddle.member && idle.has(each.member)
  return [
    ...current.filter((each) => !each.departed && !quiet(each)),
    ...current.filter((each) => each.departed),
    ...current.filter(quiet),
    ...placed.filter((each) => !each.latest),
  ].map(({ member, play, latest }) => ({ member, play, latest }))
}

/**
 * The tokens in hand of one game across a room: how many, the special
 * prizes those whose corner is known exchange for, a smallest special
 * prize of the step apart, in yen — as the odd prizes' calculator counts
 * them out, and as the settling up takes them — and the odd tokens left
 * beside those, each member's own.
 */
export interface HeldTotal {
  readonly tokens: number
  readonly specialPrizes: number
  readonly oddTokens: number
}

/**
 * What a room's plays come to together: the cash spent on every one of
 * them, the savings drawn on every one at its exchange rate, in yen, and
 * the tokens in hand of each game — on the play each person is
 * on alone, as last counted there, since what they had on a play they
 * moved from went with them to the next.
 */
export interface RoomTotal {
  readonly outlay: number
  readonly savings: number
  readonly held: Readonly<Record<PlayGameKind, HeldTotal>>
}

const lastOf = (ordered: readonly Checkpoint[], read: (checkpoint: Checkpoint) => number | undefined): number =>
  ordered.map(read).findLast((value): value is number => value !== undefined) ?? 0

const checkpointsOf = (play: Play): readonly Checkpoint[] => ((read) => (read.ok ? inPlayOrder(read.value) : []))(parsePlayLog(play.log))

const heldOf = (play: Play, step: StageStep): HeldTotal => {
  const tokens = lastOf(checkpointsOf(play), (checkpoint) => checkpoint.held)
  const stage = play.venue.terms === undefined ? undefined : stagesOf(tokens, play.venue.terms.exchange, step)[0]
  return { tokens, specialPrizes: stage === undefined ? 0 : Number(toPlainString(stage.specialPrizes)), oddTokens: stage?.toPlay ?? 0 }
}

/** The savings a play drew on, at its exchange rate, in yen: none where its corner is not known. */
const savingsOf = (play: Play): number => ((terms) => (terms === undefined ? 0 : Math.round(lastOf(checkpointsOf(play), (checkpoint) => checkpoint.replay) * tokenValueOf(terms))))(play.venue.terms)

const NO_TOKENS: HeldTotal = { tokens: 0, specialPrizes: 0, oddTokens: 0 }

const together = (one: HeldTotal, other: HeldTotal): HeldTotal => ({ tokens: one.tokens + other.tokens, specialPrizes: one.specialPrizes + other.specialPrizes, oddTokens: one.oddTokens + other.oddTokens })

/** What a room's plays come to together, the tokens in hand counted out as special prizes a smallest one of the step apart. */
export const roomTotalOf = (plays: readonly RoomPlay[], step: StageStep): RoomTotal => ({
  outlay: plays.reduce((sum, { play }) => sum + lastOf(checkpointsOf(play), (checkpoint) => checkpoint.outlay), 0),
  savings: plays.reduce((sum, { play }) => sum + savingsOf(play), 0),
  held: {
    pachinko: plays.filter(({ play, latest }) => latest && play.gameKind === "pachinko").map(({ play }) => heldOf(play, step)).reduce(together, NO_TOKENS),
    pachislot: plays.filter(({ play, latest }) => latest && play.gameKind === "pachislot").map(({ play }) => heldOf(play, step)).reduce(together, NO_TOKENS),
  },
})

/** The plays of those chosen out of a room: every one's where nothing is left out. */
export const playsOfChosen = (plays: readonly RoomPlay[], chosen: readonly string[] | undefined): readonly RoomPlay[] =>
  chosen === undefined ? plays : plays.filter(({ member }) => chosen.includes(member))
