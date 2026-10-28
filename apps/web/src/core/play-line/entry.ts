import type { BookId } from "../book/book"
import { isPatchHunk, type PatchHunk } from "../change/patch"
import type { PlayDraft } from "../live-play/draft"
import { readPlayDraft } from "../live-play/draft-reading"
import type { PlayId } from "../play/play"
import type { DeviceId } from "./device"

/** A draft of either game as it is shown on a line: with its book said, and without where it was sent. */
type Shown<D> = D extends unknown ? Omit<D, "sent" | "bookId"> & { readonly bookId: BookId } : never

/**
 * A play as the device that holds it shows it to its owner's other
 * devices: the whole draft — its history, whether it was recorded, who
 * sent it — under the book it goes to. Where it was sent is left behind:
 * an inbox's mark is each device's own.
 */
export type ShownPlay = Shown<PlayDraft>

/**
 * What a plays' line carries: a play shown whole as it stands, by the
 * device that holds it; the same shown as a patch of the text of a
 * showing of it by that device before, on the same line, at the place
 * `on` the relay gave that one (`core/play-line/showing`); a device saying it continues a play from now on, as the
 * play's handover after the one it saw it at; a play its holder deleted,
 * or left for a day before this one, taken back; and a play its holder now
 * records into another book, taken from this one. Each says which device
 * put it there, and when, by that device's clock.
 */
export type PlayLineEntry =
  | { readonly type: "shown"; readonly by: DeviceId; readonly at: string; readonly play: ShownPlay }
  | { readonly type: "patched"; readonly by: DeviceId; readonly at: string; readonly playId: PlayId; readonly on: number; readonly hunks: readonly PatchHunk[] }
  | { readonly type: "claimed"; readonly by: DeviceId; readonly at: string; readonly playId: PlayId; readonly handovers: number }
  | { readonly type: "withdrawn"; readonly by: DeviceId; readonly at: string; readonly playId: PlayId }
  | { readonly type: "moved"; readonly by: DeviceId; readonly at: string; readonly playId: PlayId }

/**
 * The shape each entry is written in, counted up when one an older app
 * could not read is made: a patch is of the second, and every other entry
 * still of the first, so that an app that reads only those follows a play
 * by its whole showings.
 */
const FORMATS: Readonly<Record<PlayLineEntry["type"], number>> = { shown: 1, patched: 2, claimed: 1, withdrawn: 1, moved: 1 }

/** A draft as it is shown on its book's line. */
export const shownPlayOf = (draft: PlayDraft, bookId: BookId): ShownPlay => {
  const { sent: _sent, bookId: _book, ...rest } = draft
  return { ...rest, bookId }
}

export const playLineEntryText = (entry: PlayLineEntry): string => JSON.stringify({ format: FORMATS[entry.type], ...entry })

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === "string" && value !== ""

const SHOWN_PARTS: ReadonlySet<string> = new Set(["format", "type", "by", "at", "play"])

const SAID_PARTS: ReadonlySet<string> = new Set(["format", "type", "by", "at", "playId"])

const CLAIMED_PARTS: ReadonlySet<string> = new Set([...SAID_PARTS, "handovers"])

const PATCHED_PARTS: ReadonlySet<string> = new Set([...SAID_PARTS, "on", "hunks"])

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0

const partsAre = (fields: Fields, parts: ReadonlySet<string>): boolean => Object.keys(fields).every((part) => parts.has(part))

/** A play read as one shown on a line: a draft with its book said, and nothing of where it was sent. */
export const readShownPlay = (kept: unknown): ShownPlay | undefined => {
  if (!isFields(kept) || "sent" in kept || !isText(kept["bookId"])) return undefined
  const draft = readPlayDraft(kept)
  return draft === undefined ? undefined : shownPlayOf(draft, kept["bookId"] as BookId)
}

const isHunks = (value: unknown): value is readonly PatchHunk[] => Array.isArray(value) && value.every(isPatchHunk)

const isEntryType = (value: unknown): value is PlayLineEntry["type"] => typeof value === "string" && Object.hasOwn(FORMATS, value)

const entryOf = (fields: Fields): PlayLineEntry | undefined => {
  const [type, by, at] = [fields["type"], fields["by"], fields["at"]]
  if (!isEntryType(type) || fields["format"] !== FORMATS[type] || !isText(by) || !isText(at)) return undefined
  if (type === "shown") {
    const play = partsAre(fields, SHOWN_PARTS) ? readShownPlay(fields["play"]) : undefined
    return play === undefined ? undefined : { type, by: by as DeviceId, at, play }
  }
  const playId = fields["playId"]
  if (type === "patched") {
    const [on, hunks] = [fields["on"], fields["hunks"]]
    return partsAre(fields, PATCHED_PARTS) && isText(playId) && isCount(on) && isHunks(hunks) ? { type, by: by as DeviceId, at, playId: playId as PlayId, on, hunks } : undefined
  }
  if (type === "claimed") {
    const handovers = fields["handovers"]
    return partsAre(fields, CLAIMED_PARTS) && isText(playId) && isCount(handovers) ? { type, by: by as DeviceId, at, playId: playId as PlayId, handovers } : undefined
  }
  return partsAre(fields, SAID_PARTS) && isText(playId) ? { type, by: by as DeviceId, at, playId: playId as PlayId } : undefined
}

/** An entry read back from its text, or none where it is none this app reads. */
export const readPlayLineEntry = (written: string): PlayLineEntry | undefined => {
  try {
    const parsed: unknown = JSON.parse(written)
    return isFields(parsed) ? entryOf(parsed) : undefined
  } catch {
    return undefined
  }
}
