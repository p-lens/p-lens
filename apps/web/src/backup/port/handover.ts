import type { Result } from "../../core/result/result"

/**
 * Why a file did not reach the person.
 *
 * - `handover-cancelled`: they were asked where to put it, and closed the question.
 */
export type HandoverFailure = { readonly type: "handover-cancelled" } | { readonly type: "handover-unavailable"; readonly detail: string }

/** A file as it is handed over: what it is named, what kind it is as a media type, and its bytes. */
export interface HandedFile {
  readonly name: string
  readonly type: string
  readonly bytes: Uint8Array<ArrayBuffer>
}

/**
 * A file handed to the person, to save wherever they choose — a folder on
 * the device, iCloud Drive, anything the device offers. Where it ends up is
 * theirs to decide and is never learned.
 */
export interface Handover {
  readonly give: (file: HandedFile) => Promise<Result<void, HandoverFailure>>
  /**
   * Whether a file given now reaches the person with no press of its own:
   * a device that asks where a file goes takes it only on a press, and
   * a press counts for a moment only, so a file made after it has gone by
   * waits for another.
   */
  readonly givesNow: () => boolean
}
