import { createMemo, type Accessor } from "solid-js"

import type { BookId } from "../../../core/book/book"
import type { PlayDraft } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import type { PlaySender } from "../../../crossing"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { toast } from "../../primitives/toast"
import { CONTINUED_HERE, continueFailedText } from "../../wording/play-line"

/**
 * How a screen has a play: held by this device, to be played on; a copy of
 * one another of the owner's devices holds, to be watched as of when it was
 * made — up to date or not, as the book's line is reached — with the way to
 * continue it here; or a play someone sent to one of the owner's books, to
 * be watched as it came, with the way to record it there.
 */
export type PlayHold =
  | { readonly type: "held" }
  | { readonly type: "followed"; readonly shownAt: number; readonly unreached: boolean; readonly onContinue: () => Promise<void> }
  | { readonly type: "arrived"; readonly sender: PlaySender; readonly bookId: BookId; readonly shownAt: number; readonly onRecord: () => void }

export const HELD: PlayHold = { type: "held" }

/** A play held elsewhere, as a screen has it: another device's, or someone else's. */
export type HeldElsewhere = Exclude<PlayHold, { readonly type: "held" }>

/** How a screen has a play this device holds no draft of: where another of the owner's devices holds it, or someone sent it; none where it is neither. */
export const elsewhereOf = (hold: PlayHold): HeldElsewhere | undefined => (hold.type === "held" ? undefined : hold)

/**
 * A play this device keeps no draft of, as the screen has it: the copy of
 * one another of the owner's devices holds — as of when, whether its line is
 * out of reach, and continuing it here, said as it comes over or why it did
 * not, a play no longer followed leaving for the live list — or a play
 * someone sent to one of the owner's books, as it came, and recording it.
 */
export const createElsewhereHold = (playId: Accessor<PlayId>): Accessor<{ readonly draft: PlayDraft; readonly hold: HeldElsewhere } | undefined> => {
  const app = useApp()
  const moves = useMoves()
  const continueHere = async (): Promise<void> => {
    const taken = await app.bookLines.takeOver(playId())
    if (taken.ok) return void toast({ title: CONTINUED_HERE })
    toast({ title: continueFailedText(taken.error), tone: "error" })
    if (taken.error.type === "gone") moves.replace({ kind: "live" })
  }
  return createMemo((): { readonly draft: PlayDraft; readonly hold: HeldElsewhere } | undefined => {
    const play = app.bookLines.followed().find((each) => each.playId === playId())
    if (play !== undefined) {
      const unreached = app.bookLines.standings().get(play.bookId)?.type === "unreachable"
      return { draft: play.play, hold: { type: "followed", shownAt: play.shownAt, unreached, onContinue: continueHere } }
    }
    const sent = app.bookLines.arrived().find((each) => each.play.id === playId())
    return sent === undefined
      ? undefined
      : { draft: sent.play, hold: { type: "arrived", sender: sent.sender, bookId: sent.bookId, shownAt: sent.shownAt, onRecord: () => moves.go({ kind: "live-record", playId: sent.play.id }) } }
  })
}
