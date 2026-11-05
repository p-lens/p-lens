import type { SendingProblem } from "../../crossing"
import { memberNameText, titleText } from "./book"
import { formatMoment } from "./dates"

/** What a play someone sent to the owner's book is marked with in the day's list: whose it is. */
export const arrivedMark = (name: string): string => `${memberNameText(name)}さんの稼働`

/** What stands where a sent play's readings would be typed: whose it is, and as of when it came. */
export const arrivedSinceText = (name: string, shownAt: number): string => `${arrivedMark(name)}・${formatMoment(new Date(shownAt).toISOString())} 時点`

/** The button that records a play someone sent into the book it came to. */
export const RECORD_ARRIVED = "収支を記帳"

/** What a play the device sends is marked with in the day's list. */
export const SENDING_MARK = "送信中"

/** The paper plane's names: sending a play, and sending it no longer. */
export const SEND_PLAY = "この稼働を送る"
export const STOP_SENDING = "この稼働を送るのをやめる"

/** The dialog a play's destination is chosen in, where the device sends to more than one book. */
export const CHOOSE_DESTINATION = "どの帳簿に送りますか？"
export const CHOOSE_DESTINATION_DECLINE = "やめる"

/** Said as a play starts going to a book. */
export const sentToText = (title: string): string => `「${titleText(title)}」に送ります`

/** The words of sending a play no longer: the question, what it is told will happen, and the buttons. */
export const stopSendingWording = (title: string): { readonly question: string; readonly body: string; readonly confirm: string; readonly decline: string } => ({
  question: `「${titleText(title)}」に送るのをやめますか？`,
  body: "相手の端末から、この稼働が消えます。記帳された分は、相手の帳簿に残ります。",
  confirm: "やめる",
  decline: "送り続ける",
})

export const STOPPED_SENDING = "送るのをやめました"

/** Why a play could not be sent, or sent no longer, as a person is told. */
export const sendingProblemText = (problem: SendingProblem): string => {
  switch (problem.type) {
    case "removed":
      return "この送り先からは外されています。"
    case "kept":
      return "送る稼働を、この端末に書き込めませんでした。"
    case "unreadable":
      return "この稼働を読めませんでした。"
  }
}

export const NOT_SENT = "送れませんでした"
