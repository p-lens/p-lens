import type { BookSyncProblem, LineStanding, Refusal } from "../../crossing"
import { NO_CONNECTION } from "./connection"
import { describeError } from "./errors"

/** What the screen syncing one's own devices says first: what goes between them, that it is sealed on the device, and that the code is a key. */
export const SYNC_INTRO = "同じ帳簿を自分の端末どうしで揃えます。片方で書いたことは、もう片方を開くと届きます。帳簿は端末の中で暗号化してから送るので、中継サーバは中身を読めません。同期コードは帳簿の鍵そのものです。人には見せないでください。"

export const OWN_BOOKS = "自分の帳簿"
export const JOIN_HEADING = "もう一台の端末の帳簿を追加"
export const JOIN_ABOUT = "帳簿のある端末で「同期コードを表示」を押し、出てきたQRコードをこの端末で読み取ってください。カメラのない端末では、コードを貼り付けて追加できます。"

export const START_SYNC = "同期を始める"
export const STARTING_SYNC = "準備しています…"
export const SHOW_SYNC_CODE = "同期コードを表示"
export const STOP_SYNC = "同期をやめる"
export const SCAN_SYNC_CODE = "QRコードを読み取る"
export const SYNC_CODE_BY_IMAGE = "画像から読み取る"
export const SYNC_CODE_FIELD = "同期コード"
export const ADD_BY_CODE = "この端末に追加"
export const JOINING = "受け取っています…"
export const SYNC_SCANNING = "もう一台の端末に出ている同期コードのQRコードを写してください。"
export const SYNC_NO_CAMERA = "カメラを使えませんでした。画像から読み取るか、コードを貼り付けてください。"
export const SYNC_NOT_IN_IMAGE = "画像の中に同期コードのQRコードが見つかりませんでした。"
export const JOINED_BOOK = "帳簿をこの端末に追加しました"

/** The dialog the code is shown in: its title, what to do with it, and the warning it carries. */
export const SYNC_CODE_TITLE = "同期コード"
export const SYNC_CODE_HOW = "もう一台の端末で「設定 → 端末の同期」を開き、このQRコードを読み取ってください。カメラのない端末には、コードをコピーして貼り付けます。"
export const SYNC_CODE_WARNING = "このコードがあれば、だれでもこの帳簿を読み書きできます。人に見せたり送ったりしないでください。"
export const COPY_SYNC_CODE = "コードをコピー"
export const SYNC_CODE_COPIED = "同期コードをコピーしました"
export const SYNC_CODE_NOT_COPIED = "コピーできませんでした"
export const CLOSE_SYNC_CODE = "閉じる"

/** The words of stopping a book's syncing on this device: the question, what it is told will happen, and the buttons. */
export const stopSyncWording = (title: string): { readonly question: string; readonly body: string; readonly confirm: string; readonly decline: string } => ({
  question: "この端末で同期をやめますか？",
  body: `この端末の「${title}」は、今のまま残ります。ほかの端末とはつながらなくなり、ほかの端末どうしの同期は続きます。もう一度つなぐときは、この端末の帳簿を削除してから、同期コードで追加し直してください。`,
  confirm: STOP_SYNC,
  decline: "やめない",
})

export const SYNC_STOPPED = "この端末で同期をやめました"
export const SYNC_NOT_STOPPED = "同期をやめられませんでした"
export const SYNC_NOT_STARTED = "同期を始められませんでした"
export const SYNC_NOT_JOINED = "帳簿を追加できませんでした"

/** Why the relay would not keep what this device put on a book's line, in a book's terms. */
export const describeSyncRefusal = (refusal: Refusal): string => {
  switch (refusal.type) {
    case "restricted":
      return refusal.reason === "pass-required" ? "この帳簿の同期は、サーバを使える期間が終わっています。" : "サーバに受け付けてもらえませんでした。"
    case "rate-limited":
      return "送る間隔が短すぎました。少し待つと、自動で送り直します。"
    case "invalid":
    case "blocked":
    case "have-newer":
    case "other":
      return "サーバに受け付けてもらえませんでした。アプリを最新にしてください。"
  }
}

/** Why a book could not be synced, joined or kept on its line, as a person is told. */
export const describeBookSyncProblem = (problem: BookSyncProblem): string => {
  switch (problem.type) {
    case "no-relay":
      return "この版のPレンズでは、端末の同期を使えません。"
    case "not-a-code":
      return "同期コードとしても招待コードとしても読めません。出ているコードを、そのまま読み取るか貼り付けてください。"
    case "unreachable":
      return NO_CONNECTION
    case "refused":
      return describeSyncRefusal(problem.refusal)
    case "nothing-on-line":
      return "このコードの帳簿が、まだ中継サーバに届いていません。帳簿のある端末でアプリを開いたまま、少し待ってからもう一度試してください。"
    case "removed":
      return "帳簿の持ち主に、この帳簿の共有から外されています。"
    case "not-owner":
      return "人を招待したり外したりできるのは、帳簿の持ち主の端末だけです。"
    case "no-member":
      return "この人は、もう帳簿の共有にいません。"
    case "roster-unreadable":
      return "帳簿を共有している人の一覧が読めません。招待も、外すこともできません。"
    case "book-here":
      return "この帳簿はすでにこの端末にあります。追加し直すときは、「帳簿の管理」でこの端末の帳簿を削除してからにしてください。"
    case "already-synced":
      return "この帳簿は、すでに同期しています。"
    case "kept":
      return "同期の記録を、この端末に読み書きできませんでした。アプリを開き直してください。端末の空き容量が少ないときは、空けてからもう一度試してください。"
    case "book":
      return describeError(problem.error)
    case "broken":
      return "中継サーバにある変更が、帳簿とつながりません。この端末での同期を止めました。"
    case "file-removed":
      return `この端末の帳簿からファイルがなくなっています（${problem.path}）。同期を止めました。`
    case "too-large":
      return "帳簿が大きすぎて送れません。"
  }
}

/** How a book's line stands, in a line beside it; none where it stands well and says nothing. */
export const standingText = (standing: LineStanding): string => {
  switch (standing.type) {
    case "opening":
      return "つないでいます…"
    case "synced":
      return "同期済み"
    case "sending":
      return `送っています（${standing.waiting}件）`
    case "unreachable":
      return "つながりません。電波が戻ると、自動で同期します。"
    case "refused":
      return describeSyncRefusal(standing.refusal)
    case "conflict":
      return "ほかの端末と食い違っています。下で残すほうを選んでください。"
    case "stopped":
      return describeBookSyncProblem(standing.problem)
  }
}

/** Whose a side of a conflict is. */
export const sideName = (mine: boolean): string => (mine ? "この端末" : "ほかの端末")

export const CONFLICT_ABOUT = "この端末とほかの端末で、同じ箇所が別々に書き換えられています。箇所ごとに、残すほうを選んでください。ほかの箇所は両方の変更を合わせてあります。"
export const CONFLICT_UNREADABLE = "両方の変更を合わせると、hledger が読めない帳簿になります。どちらかの帳簿を丸ごと残してください。"
export const CONFLICT_PLAY_TWICE = "同じ稼働が、どちらの端末でも記帳されています。このファイルは、どちらかを丸ごと残してください。"
export const CONFLICT_SETTLE = "選んだとおりにする"
export const CONFLICT_SETTLED = "選んだとおりにしました"
export const CONFLICT_NOT_SETTLED = "選んだとおりにできませんでした"

/** Said as a conflict being chosen in moved under the person: it is shown again as it now stands. */
export const CONFLICT_MOVED = "選んでいる間に帳簿が変わりました。今の内容で表示し直したので、もう一度選んでください。"

/** Said of a settings file that does not read once the stretches chosen are put together. */
export const CONFLICT_SETTINGS_UNREADABLE = "選んだ組み合わせでは、帳簿の設定が読めなくなります。別の組み合わせを選んでください。"
