import { withOperation, type PlayDraft } from "../core/live-play/draft"
import type { DraftStorage } from "../storage/port/draft-storage"

/**
 * A draft about to be kept, with what the device already knows of the play
 * that the hand keeping it may not: its history, with this change of its
 * log written in, and its marks — recorded, sent, received — where the
 * draft being kept says nothing of them. A screen holds a play while it is
 * counted at, and what it then keeps is the log; a mark made meanwhile is
 * not to be lost to it.
 */
const withWhatIsKept = (stored: PlayDraft | undefined, draft: PlayDraft, previousLog: string, at: string): PlayDraft => {
  const recorded = draft.recorded ?? stored?.recorded
  const sent = draft.sent ?? stored?.sent
  const received = draft.received ?? stored?.received
  const history = stored?.history ?? draft.history
  return withOperation({ ...draft, ...(history === undefined ? {} : { history }), ...(recorded === undefined ? {} : { recorded }), ...(sent === undefined ? {} : { sent }), ...(received === undefined ? {} : { received }) }, previousLog, at)
}

/**
 * Draft storage that writes every change of a play's log into the play's
 * history, whoever makes it and however: the one place a draft is kept is
 * the one place its history is written, so no way of changing a log goes
 * unrecorded.
 */
export const keepingHistory = (drafts: DraftStorage, now: () => string): DraftStorage => ({
  ...drafts,
  updateDraft: async (draft, previousLog) => {
    const stored = await drafts.readDraft(draft.id)
    return drafts.updateDraft(withWhatIsKept(stored.ok ? stored.value : undefined, draft, previousLog, now()), previousLog)
  },
})
