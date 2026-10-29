import type { ApplicationError } from "../../application/errors"
import { NO_CONNECTION, notUpToDateText, SERVER_TROUBLE } from "./connection"
import { formatMoment } from "./dates"
import { describeError } from "./errors"
import { describeSyncProblem, isOffline } from "./sync"

/** What a play another of the owner's devices holds is marked with in the day's list. */
export const FOLLOWED_CHIP = "別の端末で計測中"

/** What stands where a play's readings are typed, while another device holds it: that it does, and as of when this copy is. */
export const followedSinceText = (shownAt: string): string => `${FOLLOWED_CHIP}・${formatMoment(shownAt)} 時点`

/** The button that brings a play another device holds over to this one. */
export const CONTINUE_HERE = "この端末で続ける"

/** What the button says while the claim is on its way. */
export const CONTINUING_HERE = "切り替えています…"

/** Said under a play recorded while its lines could not be read in time: no other device was asked whether it plays it on. */
export const ELSEWHERE_UNCHECKED = "中継サーバにつながらなかったため、ほかの端末でこの稼働を続けていないかは確かめていません。"

/** What marks a copy in the day's list while the lines cannot be read: it may have moved on. */
export const FOLLOWED_UNHEARD_MARK = "更新できていません"

/** Said beside a copy of a play another device holds while its line cannot be read: why, and as of when it is. */
export const followedUnheardText = (since: string | undefined, error: ApplicationError): string =>
  notUpToDateText(since, error.type !== "sync" ? "other" : isOffline(error.problem) ? "offline" : error.problem.type === "server-trouble" ? "server" : "other")

/** Said as the play has come over. */
export const CONTINUED_HERE = "この端末で続けます"

/** Said as another device claimed a play this one held, and nothing of this one's was lost. */
export const YIELDED = "別の端末で続けています"

/** Said as another device claimed a play this one held, where the last readings typed here never reached it: they are let go, as the play now stands there. */
export const lostReadingsText = (count: number): string => `この端末の最後の記録 ${count} 件は、続けている端末に届いていません`

/** Why a play could not be brought over: which device claimed last is the relay's to say. */
const CONTINUE_UNREACHABLE = `この端末に切り替えられませんでした。${NO_CONNECTION}`

/** Said as the play being watched was recorded into its book on the device holding it, on a day after it began: it leaves the day's list, as the holder's own play does. */
export const FOLLOWED_RECORDED = "この稼働は記帳されました"

/** What marks a play its book already has, in the day's list: held here or followed alike. */
export const RECORDED_MARK = "記帳済み"

/** Why a play could not be brought over to this device, as a person is told: out of reach — no signal, too slow an answer, a hall's login page — or whatever else stopped it, taken off its book meanwhile among them, said as the switch that did not happen. */
export const continueFailedText = (error: ApplicationError): string => {
  if (error.type !== "sync") return error.type === "play-gone" ? describeError(error) : `${CONTINUE_FAILED}${describeError(error)}`
  if (isOffline(error.problem)) return CONTINUE_UNREACHABLE
  if (error.problem.type === "server-trouble") return `${CONTINUE_FAILED}${SERVER_TROUBLE}`
  if (error.problem.type === "behind" || error.problem.type === "unsettled") return `${CONTINUE_FAILED}ほかの端末の書き込みが続いていて、間に合いませんでした。少し待って、もう一度押してください。`
  return `${CONTINUE_FAILED}${describeSyncProblem(error.problem)}`
}

/** What a failure to bring a play over begins with: the switch did not happen. */
const CONTINUE_FAILED = "この端末に切り替えられませんでした。"
