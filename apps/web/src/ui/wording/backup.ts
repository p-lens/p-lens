import type { BackupProblem } from "../../application/errors"
import type { HandoverFailure } from "../../backup/port/handover"
import type { Destination, Note, Standing } from "../../core/backup/standing"
import { NO_CONNECTION, SERVER_TROUBLE } from "./connection"
import { formatMoment } from "./dates"

/** Said where a backup's zip could not be made on the device: room on it, most likely. */
export const ARCHIVE_UNWRITABLE = "バックアップのファイルを作れませんでした。端末の空き容量を確かめて、もう一度試してください。"

/** Why a file did not reach the person, as they are told. */
export const describeHandoverFailure = (failure: HandoverFailure): string => {
  switch (failure.type) {
    case "handover-cancelled":
      return "書き出しをやめました。"
    case "handover-unavailable":
      return "この端末ではファイルを書き出せません。ブラウザを最新にしてください。"
  }
}

/** Why a book could not be backed up or put back, as a person is told. */
export const describeBackupProblem = (problem: BackupProblem): string => {
  switch (problem.type) {
    case "archive-unwritable":
      return ARCHIVE_UNWRITABLE
    case "archive-unreadable":
      return "読めません。このアプリで作った zip を選んでください。"
    case "no-manifest":
    case "unreadable-manifest":
      return "このアプリのバックアップではありません。"
    case "newer-format":
      return "新しい版のアプリで作られたバックアップです。アプリを更新してください。"
    case "sign-in-unavailable":
      return `ログイン画面を開けませんでした。${NO_CONNECTION}`
    case "sign-in-blocked":
      return "ログイン画面が開きませんでした。もう一度押してください。"
    case "sign-in-declined":
      return "ログインが済まなかったため、保存先を使えませんでした。電波のない所ではログイン画面が開けないことがあります。電波のある所で、もう一度押してください。"
    case "unreachable":
    case "unreadable-answer":
      return NO_CONNECTION
    case "signed-out":
      return "保存先へのログインが切れました。もう一度押すと、ログインし直せます。"
    case "store-trouble":
      return SERVER_TROUBLE
    case "refused":
      return "保存先に受け付けられませんでした。保存先の空き容量と、このアプリへのアクセスの許可を確かめて、もう一度試してください。"
    case "handover-cancelled":
    case "handover-unavailable":
      return describeHandoverFailure(problem)
    case "digest-unavailable":
      return "このブラウザでは帳簿の変更を確かめられません。ブラウザを最新にしてください。"
    case "receipts":
      return "バックアップの記録を、この端末に読み書きできませんでした。アプリを開き直してください。"
    case "book-here":
      return "この帳簿はもう端末にあります。"
    case "file-unopened":
      return "選んだファイルを開けませんでした。クラウドにあるファイルなら、電波のある所で端末に保存してから選んでください。"
  }
}

/** Said as the backups ticked were put back: all of them, or how many before one could not be. */
export const restoredChosenText = (restored: number, chosen: number): string =>
  restored === chosen ? `${restored}冊の帳簿を戻しました` : `${chosen}冊のうち${restored}冊を戻しました。残りは下の理由で戻せませんでした`

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
