import type { PlayDraft } from "../../core/live-play/draft"
import type { Json } from "./book/canonical"
import { copiedPlayOf } from "./plays"

/**
 * A sent play's generation: a play is sent by the one device playing it, and
 * never taken over, so its head and pieces are always of the first
 * (PROTOCOL.md §7).
 */
export const SENT_GENERATION = 0

/**
 * A play as it is sent to a book's owner (PROTOCOL.md §7): as a copy carries
 * it, less what is the sender's own — the book they keep it in, their
 * recording of it, and the savings their own book keeps at its parlor, which
 * the owner's book gives anew as the play is recorded there.
 */
export const sentPlayOf = (draft: PlayDraft): { readonly [key: string]: Json } => {
  const { bookId: _book, recorded: _recorded, ...play } = draft
  return copiedPlayOf(play.venue.type === "parlor" ? { ...play, venue: { ...play.venue, parlor: { ...play.venue.parlor, pools: [] } } } : play)
}
