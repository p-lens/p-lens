import type { TakeOverProblem } from "../../crossing"
import { NO_CONNECTION } from "./connection"
import { formatMoment } from "./dates"
import { describeError } from "./errors"
import { describeSyncRefusal } from "./sync"

/** What a play another of the owner's devices holds is marked with in the day's list. */
export const FOLLOWED_MARK = "別の端末で計測中"

/** What stands where a play's readings are typed, while another device holds it: that it does, and as of when this copy is. */
export const followedSinceText = (shownAt: number): string => `${FOLLOWED_MARK}・${formatMoment(new Date(shownAt).toISOString())} 時点`

/** Said under a copy of a play another device holds while its line cannot be reached: it may have moved on since. */
export const FOLLOWED_UNREACHED = "つながらないため、最新ではないかもしれません"

/** The button that brings a play another device holds over to this one. */
export const CONTINUE_HERE = "この端末で続ける"

/** What the button says while the copy is on its way. */
export const CONTINUING_HERE = "切り替えています…"

/** Said as the play has come over. */
export const CONTINUED_HERE = "この端末で続けます"

/** Said as another device took over a play this one held. */
export const YIELDED = "別の端末で続けています"

/** Said as another device took over a play this one held, where the last readings typed here never reached it: they are let go, as the play now stands there. */
export const lostReadingsText = (count: number): string => `この端末の最後の記録 ${count} 件は、続けている端末に届いていません`

/** Said as a play followed here is no longer: it left its line, or was recorded on a day before this one. */
const FOLLOWED_GONE = "この稼働は、ほかの端末で終わりました"

const CONTINUE_FAILED = "この端末に切り替えられませんでした。"

/** Why a play could not be brought over to this device, as a person is told. */
export const continueFailedText = (problem: TakeOverProblem): string => {
  switch (problem.type) {
    case "unreachable":
      return `${CONTINUE_FAILED}${NO_CONNECTION}`
    case "refused":
      return `${CONTINUE_FAILED}${describeSyncRefusal(problem.refusal)}`
    case "gone":
      return FOLLOWED_GONE
    case "kept":
      return `${CONTINUE_FAILED}同期の記録を、この端末に書き込めませんでした。`
    case "draft":
      return `${CONTINUE_FAILED}${describeError({ type: "draft", error: problem.error })}`
  }
}
