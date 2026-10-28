import type { PachislotDraft } from "../../../../core/live-play/draft"
import type { PlayHold } from "../../live/play-hold"

/** The draft as a screen last wrote it, with the log the screen had been given when it did. */
export interface WrittenHere {
  readonly draft: PachislotDraft
  readonly over: string
}

/**
 * The draft a screen draws: the one it last wrote, until it is given a log
 * that has caught up — its counting tiles are tapped faster than a write
 * comes back — or the one it is given. A play another device holds is
 * drawn as it is given, always: what this device wrote before giving it
 * up never reached that device's play, and is no part of it.
 */
export const drawnDraft = (written: WrittenHere | undefined, given: PachislotDraft, hold: PlayHold): PachislotDraft => {
  if (written === undefined || written.draft.id !== given.id || hold.type === "followed") return given
  return written.draft.log.length > given.log.length || written.over === given.log ? written.draft : given
}
