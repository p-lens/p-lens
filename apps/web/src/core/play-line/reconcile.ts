import type { BookId } from "../book/book"
import type { IsoDate } from "../calendar/calendar"
import { isPast, type PlayDraft } from "../live-play/draft"
import type { PlayId } from "../play/play"
import type { DeviceId } from "./device"
import { shownPlayOf } from "./entry"
import { handoversOf, unshownCountOf, type Followed, type LineOf, type PlayStanding } from "./following"

/**
 * A play this device holds, with the book it goes to now as the device
 * reckons it: none where that is no book of the person's own the device
 * syncs, so that it is shown on no line.
 */
export interface HeldPlay {
  readonly draft: PlayDraft
  readonly bookId: BookId | undefined
}

/** Why a copy is let go: its play was deleted, now goes to a book this device's lines do not have it on, or was recorded on a day gone by. */
export type CopyLetGo = Extract<PlayStanding, { readonly type: "gone" }>["reason"] | "recorded"

/**
 * What the device does to bring what it keeps in line with its lines:
 * take up a play it claimed and still keeps as a copy; give one up that
 * another device claimed, keeping the line's copy instead and telling how
 * many of its own readings never reached the line — given up only while
 * its log is still the one weighed here; hold again, at the handover
 * after the claim, a play it recorded that another device claimed from a
 * showing not yet recorded; keep or let go of a copy, and why; take a
 * play it deleted off its line; and take one it now records into another
 * book off the line it was on.
 */
export type PlayLineAction =
  | { readonly type: "take-up"; readonly followed: Followed }
  | { readonly type: "yield-up"; readonly playId: PlayId; readonly followed: Followed; readonly unshown: number; readonly log: string }
  | { readonly type: "claim-back"; readonly playId: PlayId; readonly handovers: number; readonly log: string }
  | { readonly type: "put-followed"; readonly followed: Followed }
  | { readonly type: "drop-followed"; readonly playId: PlayId; readonly reason: CopyLetGo }
  | { readonly type: "withdraw"; readonly playId: PlayId; readonly line: LineOf }
  | { readonly type: "move"; readonly playId: PlayId; readonly from: LineOf }

/** What a device keeps of one play: as its holder, as a copy, or neither. */
interface Kept {
  readonly held: HeldPlay | undefined
  readonly followed: Followed | undefined
}

type Held = Extract<PlayStanding, { readonly type: "held" }>

/** When a play this device kept was last changed: its copy is as it was then. */
const lastChangedAt = (draft: PlayDraft): string => draft.history?.at(-1)?.at ?? draft.startedAt

const sameCopy = (one: Followed, other: Followed): boolean =>
  one.holder === other.holder && one.shownAt === other.shownAt && one.line.bookId === other.line.bookId && one.line.day === other.line.day

/**
 * Whether a play this device holds is ahead of how its lines have it: it
 * was continued here at a later handover than any they say of, by a claim
 * on a line not read here. Such a play is this device's still, whoever
 * showed it last on the lines read, and is shown again.
 */
export const isAheadOf = (draft: PlayDraft, standing: PlayStanding): boolean => handoversOf(draft) > standing.handovers

const goneActions = (id: PlayId, standing: Extract<PlayStanding, { readonly type: "gone" }>, kept: Kept): readonly PlayLineAction[] =>
  kept.followed !== undefined && kept.followed.line.bookId === standing.line.bookId ? [{ type: "drop-followed", playId: id, reason: standing.reason }] : []

/**
 * Whether a play this device held and no longer keeps was let go as one
 * recorded on a day gone by is, rather than deleted: it is in its book,
 * and every device lets its copy go by itself.
 */
const letGo = (standing: Held, today: IsoDate): boolean => standing.play !== undefined && isPast(standing.play, today)

const mineActions = (id: PlayId, standing: Held, kept: Kept, today: IsoDate): readonly PlayLineAction[] => {
  if (kept.held !== undefined) return kept.held.bookId === standing.line.bookId ? [] : [{ type: "move", playId: id, from: standing.line }]
  if (kept.followed !== undefined) {
    const play = standing.play ?? kept.followed.play
    return [{ type: "take-up", followed: { ...kept.followed, play: { ...play, handovers: standing.handovers }, holder: standing.by, shownAt: standing.shownAt ?? kept.followed.shownAt, line: standing.line } }]
  }
  return letGo(standing, today) ? [] : [{ type: "withdraw", playId: id, line: standing.line }]
}

/**
 * What a device that recorded a play does where the lines have another
 * holding it, shown not yet recorded: the claim came before it saw the
 * recording, and the book already has the play as this device's log made
 * it. It is held again, at the handover after the claim, and shown
 * recorded, so that the other device gives it up knowing it was recorded
 * rather than record it a second time. Claimed and not yet shown, it is
 * left until the other device shows what it took: a claim made of the
 * play shown recorded is given up to as any other.
 */
const recordedActions = (id: PlayId, standing: Held, draft: PlayDraft): readonly PlayLineAction[] =>
  standing.play === undefined ? [] : [{ type: "claim-back", playId: id, handovers: standing.handovers + 1, log: draft.log }]

const theirsActions = (id: PlayId, standing: Held, kept: Kept): readonly PlayLineAction[] => {
  if (kept.held !== undefined) {
    const { draft } = kept.held
    if (isAheadOf(draft, standing)) return []
    if (draft.recorded !== undefined && standing.play?.recorded === undefined) return recordedActions(id, standing, draft)
    const play = standing.play ?? shownPlayOf(draft, standing.line.bookId)
    const followed: Followed = { id, play, holder: standing.by, shownAt: standing.shownAt ?? lastChangedAt(draft), line: standing.line }
    return [{ type: "yield-up", playId: id, followed, unshown: unshownCountOf(draft.log, play.log), log: draft.log }]
  }
  const play = standing.play ?? kept.followed?.play
  const shownAt = standing.shownAt ?? kept.followed?.shownAt
  if (play === undefined || shownAt === undefined) return []
  const followed: Followed = { id, play, holder: standing.by, shownAt, line: standing.line }
  return kept.followed !== undefined && sameCopy(kept.followed, followed) ? [] : [{ type: "put-followed", followed }]
}

const actionsFor = (id: PlayId, standing: PlayStanding, kept: Kept, me: DeviceId, today: IsoDate): readonly PlayLineAction[] => {
  if (standing.type === "gone") return goneActions(id, standing, kept)
  return standing.by === me ? mineActions(id, standing, kept, today) : theirsActions(id, standing, kept)
}

/**
 * What to do so that the device keeps each play as its lines have it: as
 * its own where it holds it, as a copy where another device does, and not
 * at all where it is gone from the book the copy is of. A play it holds
 * and the lines know nothing of, or have at an earlier handover, is left
 * to be shown; a play it deleted since showing it is taken off the line,
 * whichever day it was shown on. Nothing is ever merged: the line's play
 * is taken, or the device's own is.
 */
export const reconcile = (standings: ReadonlyMap<PlayId, PlayStanding>, held: readonly HeldPlay[], followed: readonly Followed[], me: DeviceId, today: IsoDate): readonly PlayLineAction[] =>
  [...standings].flatMap(([id, standing]) => actionsFor(id, standing, { held: held.find((each) => each.draft.id === id), followed: followed.find((each) => each.id === id) }, me, today))
