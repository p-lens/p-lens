import type { IsoDate } from "../../../core/calendar/calendar"
import { parlorOf, type PlayDraft } from "../../../core/live-play/draft"
import { formatClock, formatMoment } from "../../wording/dates"
import { parlorText } from "../../wording/parlor"
import { cabinetText } from "../../wording/cabinet"
import { seal } from "../../../mummer"

/**
 * The line under a play's machine in a list of the day's plays: its
 * cabinet, dashes where none was given, its parlor, and when it began —
 * the time alone for a play of this business day, the date with it for one
 * begun on a day before.
 */
export const captionOf = (play: PlayDraft, businessDay: IsoDate): string =>
  [cabinetText(play.cabinetNumber === undefined ? undefined : seal.cabinet(play.cabinetNumber)), parlorText(parlorOf(play)), `${play.date < businessDay ? formatMoment(play.startedAt) : formatClock(play.startedAt)}〜`].join("・")
