import type { PlaySummary } from "../../core/report/plays"

/** What stands where a play names no machine. */
export const NO_MACHINE = "機種指定なし"

/** What stands where a play names no parlor. */
export const NO_PARLOR = "店舗名なし"

/**
 * What a play is called in a list: its machine. One that names none was
 * typed in by hand with nothing to call it by, and is called that — its
 * day stands under it already. A play taken in from another app keeps
 * what that app called it, which is all its description is.
 */
export const playTitle = (play: PlaySummary): string => play.machine ?? (play.importedFrom !== undefined && play.description.trim() !== "" ? play.description : "手入力した稼働")
