import type { ApplicationError } from "../../application/errors"
import { formatMoment } from "./dates"
import { describeError } from "./errors"

/** What a play another of the owner's devices holds is marked with in the day's list. */
export const FOLLOWED_CHIP = "別の端末で計測中"

/** What stands where a play's readings are typed, while another device holds it: that it does, and as of when this copy is. */
export const followedSinceText = (shownAt: string): string => `${FOLLOWED_CHIP}・${formatMoment(shownAt)} 時点`

/** The button that brings a play another device holds over to this one. */
export const CONTINUE_HERE = "この端末で続ける"

/** Said as the play has come over. */
export const CONTINUED_HERE = "この端末で続けます"

/** Said as another device claimed a play this one held, and nothing of this one's was lost. */
export const YIELDED = "別の端末で続けています"

/** Said as another device claimed a play this one held, where the last readings typed here never reached it: they are let go, as the play now stands there. */
export const lostReadingsText = (count: number): string => `この端末の最後の記録 ${count} 件は、続けている端末に届いていません`

/** Why a play could not be brought over: which device claimed last is the relay's to say. */
const CONTINUE_UNREACHABLE = "つながらないため、この端末に切り替えられません。通信できる場所でもう一度押してください。"

/** Said as the play being watched was recorded into its book on the device holding it, on a day after it began: it leaves the day's list, as the holder's own play does. */
export const FOLLOWED_RECORDED = "この稼働は記帳されました"

/** What marks a play its book already has, in the day's list: held here or followed alike. */
export const RECORDED_MARK = "記帳済み"

/** Why a play could not be brought over to this device, as a person is told: out of reach, or whatever else stopped it — taken off its book meanwhile among them. */
export const continueFailedText = (error: ApplicationError): string => {
  if (error.type === "sync" && error.problem.type === "unreachable") return CONTINUE_UNREACHABLE
  return describeError(error)
}
