import type { BackupProblem } from "../../application/errors"
import type { HandoverFailure } from "../../backup/port/handover"
import type { Destination, Note, Standing } from "../../core/backup/standing"
import { formatMoment } from "./dates"

/** Why a file did not reach the person, as they are told. */
export const describeHandoverFailure = (failure: HandoverFailure): string => {
  switch (failure.type) {
    case "handover-cancelled":
      return "書き出しをやめました。"
    case "handover-unavailable":
      return `この端末ではファイルを書き出せません。（${failure.detail}）`
  }
}

/** Why a book could not be backed up or put back, as a person is told. */
export const describeBackupProblem = (problem: BackupProblem): string => {
  switch (problem.type) {
    case "archive-unwritable":
      return `バックアップのファイルを作れませんでした。（${problem.detail}）`
    case "archive-unreadable":
      return "読めません。このアプリで作った zip を選んでください。"
    case "no-manifest":
    case "unreadable-manifest":
      return "このアプリのバックアップではありません。"
    case "newer-format":
      return "新しい版のアプリで作られたバックアップです。アプリを更新してください。"
    case "sign-in-unavailable":
      return "ログイン画面を開けません。通信を確かめてください。"
    case "sign-in-blocked":
      return "ログイン画面が開きませんでした。もう一度押してください。"
    case "sign-in-declined":
      return "保存先へのアクセスが許可されませんでした。"
    case "unreachable":
      return "保存先につながりません。通信を確かめてください。"
    case "refused":
      return `保存先に断られました。（${problem.status} ${problem.reason}）`
    case "unreadable-answer":
      return "保存先の応答を読めませんでした。通信を確かめて、もう一度試してください。"
    case "handover-cancelled":
    case "handover-unavailable":
      return describeHandoverFailure(problem)
    case "digest-unavailable":
      return `この端末では帳簿の変更を確かめられません。（${problem.detail}）`
    case "receipts":
      return `バックアップの記録を端末に残せませんでした: ${problem.detail}`
    case "book-here":
      return "この帳簿はもう端末にあります。"
  }
}

/** A destination by the name a person knows it by. */
export const destinationName = (destination: Destination): string => {
  switch (destination) {
    case "google-drive":
      return "Google ドライブ"
    case "file":
      return "ファイル"
  }
}

/** The quiet word the top bar says of a device's books. */
export const noteText = (note: Note): string => {
  switch (note) {
    case "never":
      return "バックアップされていません"
    case "changed":
      return "バックアップ後の変更があります"
  }
}

/** Where a book stands against its backups, in a few words. */
export const standingText = (standing: Standing): string => {
  switch (standing.type) {
    case "never":
      return noteText("never")
    case "changed":
      return noteText("changed")
    case "kept":
      return "バックアップ済み"
  }
}

/** When a book's last backup was made and where it went, on a line of its own; nothing for a book never backed up. */
export const lastBackupText = (standing: Standing): string | undefined => {
  switch (standing.type) {
    case "never":
      return undefined
    case "changed":
      return `前回 ${formatMoment(standing.receipt.at)}・${destinationName(standing.receipt.destination)}`
    case "kept":
      return `${formatMoment(standing.receipt.at)}・${destinationName(standing.receipt.destination)}`
  }
}
