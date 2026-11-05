import type { ApplicationError } from "../../application/errors"
import type { OpeningProblem } from "../../core/parlor/opening"
import type { NumericField, TallyError, TextField } from "../../core/tally/tally"
import type { ForfeitureProblem } from "../../core/savings/forfeiture"
import type { PrizeExchangeProblem } from "../../core/savings/prize-exchange"
import type { PlayLogError } from "../../core/play-log/checkpoint"
import type { ReadingRefusal } from "../../core/play-log/live"
import type { Trouble } from "../../hledger/protocol/wire"
import type { HistoryError } from "../../history/port/history-port"
import type { DirectoryError } from "../../parlors/port/parlor-directory"
import type { KeptKind, StorageError } from "../../storage/port/book-storage"
import type { DraftError } from "../../storage/port/draft-storage"
import { ARCHIVE_UNWRITABLE, describeBackupProblem, describeHandoverFailure } from "./backup"
import { describeCatalogError } from "./catalog"
import { describeImportProblem } from "./import"
import { ENGINE_UNLOADED, NO_CONNECTION, SERVER_TROUBLE } from "./connection"
import * as PachinkoWording from "./pachinko/engine"
import * as PachislotWording from "./pachislot/engine"
import { amountText, formatTokens, tokenUnit } from "./numbers"
import { commodityText } from "./commodities"
import { seal } from "../../mummer"
import { parlorNameText } from "./parlor"

const NUMERIC_FIELDS: Readonly<Record<NumericField, string>> = {
  outlay: "投資額",
  "rental-tokens": "貸玉・貸メダル",
  "replay-paid-out": "再プレイ払出",
  "replay-deducted": "再プレイ減数",
  "carried-in": "開始時の持ち玉・持ちメダル",
  payout: "持ち玉・持ちメダル",
  takings: "回収額",
  "special-prizes": "特殊景品額",
  "odd-prizes": "端玉景品額",
  "exchanged-tokens": "交換数",
  "theoretical-value": "期待値",
  jackpots: "大当り回数",
}

const TEXT_FIELDS: Readonly<Record<TextField, string>> = { machine: "機種", "cabinet-number": "台番号" }

export const describeTallyError = (error: TallyError): string => {
  switch (error.type) {
    case "machine-missing":
      return "機種を入力してください。"
    case "text-unwritable":
      return `${TEXT_FIELDS[error.field]}に「,」「;」や改行は使えません。`
    case "negative-amount":
      return `${NUMERIC_FIELDS[error.field]}はマイナスにできません。`
    case "fractional-tokens":
      return `${NUMERIC_FIELDS[error.field]}は整数で入力してください。`
    case "rental-incomplete":
      return "投資額と貸玉・貸メダルの数は両方入力してください。"
    case "nothing-played":
      return "貸玉・再プレイ・開始時の持ち玉・持ち玉のどれかを入力してください。"
    case "replay-below-payout":
      return "再プレイで減った貯玉が、払い出された数より少なくなっています。"
    case "cash-beyond-outlay":
      return "現金で出した額が、投資額を超えています。"
    case "fractional-prizes":
      return "景品の額は円単位で入力してください。"
    case "off-book-at-parlor":
      return "店舗を指定した収支は、簿外貯玉を使えません。その店舗の貯玉から引き出してください。"
    case "pool-not-kept":
      return `${parlorNameText(seal.parlor(error.parlor.name))}には${error.pool.tier}の${tokenUnit(error.pool.kind)}の貯蓄口座がありません。`
    case "no-exchange-rate":
      return `${commodityText(error.commodity)}の${error.date}時点の交換率が帳簿にありません。`
  }
}

/** Why the parlor list could not be read, as a person is told: no connection reads the same whatever stopped it. */
const describeDirectoryError = (error: DirectoryError): string => {
  switch (error.type) {
    case "unreachable":
    case "unreadable-answer":
      return `店舗の一覧を読めませんでした。${NO_CONNECTION}`
    case "server-trouble":
      return `店舗の一覧を読めませんでした。${SERVER_TROUBLE}`
    case "unpublished":
      return "店舗の一覧がまだ公開されていません。"
  }
}

const describeOpeningProblem = (problem: OpeningProblem): string => {
  switch (problem.type) {
    case "name-unwritable":
      return `店舗名「${parlorNameText(seal.parlor(problem.name))}」には「:」「"」「,」「;」や連続した空白は使えません。`
    case "name-taken":
      return `この帳簿には同じ名前の別の店舗「${parlorNameText(seal.parlor(problem.name))}」があります。`
    case "rate-not-positive":
      return "交換率は0より大きい数で入力してください。"
  }
}

const describeTrouble = (trouble: Trouble): string => {
  switch (trouble.kind) {
    case "no-journal":
      return "帳簿がまだ読み込まれていません。"
    case "file-missing":
      return `帳簿のファイル ${trouble.path} が見つかりません。`
    case "read-failed":
      return `hledger が帳簿を読めませんでした: ${trouble.detail}`
    case "malformed-request":
      return `hledger がクエリを読めませんでした: ${trouble.detail}`
    case "unknown-report":
      return `hledger はレポート ${trouble.report} を知りません。`
    case "crashed":
      return `hledger が停止しました: ${trouble.detail}`
    case "unreachable":
      return ENGINE_UNLOADED
    case "unreadable-answer":
      return `hledger の応答を読めませんでした: ${trouble.detail}`
  }
}

/** Said where the device's own storage could not be used: no cause the browser gave is shown, only what to do. */
const DEVICE_STORAGE_UNAVAILABLE = "この端末の保存領域を使えませんでした。アプリを開き直してください。端末の空き容量が少ないときは、空けてからもう一度試してください。"

const KEPT_NAMES: Readonly<Record<KeptKind, string>> = { "book-cover": "帳簿の表紙", draft: "稼働の記録", followed: "別の端末の稼働の写し", submission: "店舗の申請の記録", "backup-receipt": "バックアップの記録" }

const describeStorageError = (error: StorageError): string => {
  switch (error.type) {
    case "unavailable":
      return DEVICE_STORAGE_UNAVAILABLE
    case "unreadable":
      return `この端末に保存された${KEPT_NAMES[error.kept]}が壊れていて読めません。データの消去で端末のデータを消すと、また使えるようになります。`
    case "book-missing":
      return "この帳簿は端末にありません。"
    case "book-exists":
      return "同じ帳簿がすでにあります。"
    case "changed-elsewhere":
      return `${error.path} が別の画面で変更されました。開き直してからもう一度記録してください。`
  }
}

const describeDraftError = (error: DraftError): string => {
  switch (error.type) {
    case "draft-missing":
      return "この稼働は端末にありません。記録済みか、別の画面で削除されています。"
    case "changed-elsewhere":
      return "この稼働は別の画面で更新されました。開き直してからもう一度入力してください。"
    case "unavailable":
    case "unreadable":
    case "book-missing":
    case "book-exists":
      return describeStorageError(error)
  }
}

const describeHistoryError = (error: HistoryError): string =>
  error.type === "unreadable" ? "この端末に保存された変更の履歴が壊れていて読めません。データの消去で端末のデータを消すと、また使えるようになります。" : `変更の履歴を残せませんでした。${DEVICE_STORAGE_UNAVAILABLE}`

/** Why a forfeiture could not be written, as a person is told. */
const describeForfeitureProblem = (problem: ForfeitureProblem): string => {
  switch (problem.type) {
    case "nothing-forfeited":
      return "失効した数を入力してください。"
    case "fractional-tokens":
      return "失効した数は整数で入力してください。"
    case "savings-short":
      return `その日の残高は${formatTokens(seal.savings(problem.held), problem.kind)}です。それより多くは失効として記録できません。`
  }
}

/** Why a prize exchange could not be written, as a person is told. */
const describePrizeExchangeProblem = (problem: PrizeExchangeProblem): string => {
  switch (problem.type) {
    case "nothing-exchanged":
      return "払出数を入力してください。"
    case "fractional-tokens":
      return "払出数は整数で入力してください。"
    case "negative-prizes":
      return "特殊景品額はマイナスにできません。"
    case "no-exchange-rate":
      return `${commodityText(problem.commodity)}の${problem.date}時点の交換率が帳簿にありません。`
    case "savings-short":
      return `その日の残高は${formatTokens(seal.savings(problem.held), problem.kind)}です。それより多くは払い出せません。`
  }
}

const LINES_NAMED = 3

/** What is said of a file of a book that does not read: the whole of it, or the lines of it named by number, a few and how many more. */
export const unreadableFileText = (path: string, lines: readonly number[] | undefined): string =>
  lines === undefined
    ? `${path} が壊れていて読めません。`
    : `${path} の${lines.slice(0, LINES_NAMED).join("・")}行目${lines.length > LINES_NAMED ? `ほか${lines.length - LINES_NAMED}行` : ""}が壊れていて読めません。`

export const describeError = (error: ApplicationError): string => {
  switch (error.type) {
    case "storage":
      return describeStorageError(error.error)
    case "draft":
      return describeDraftError(error.error)
    case "hledger":
      return describeTrouble(error.trouble)
    case "journal-rejected":
      return `hledger がこの変更を受け付けませんでした。帳簿は変更されていません。${describeTrouble(error.trouble)}`
    case "report":
      return `交換率のない玉・メダルがあり、円に換算できません: ${error.error.commodities.join("、")}`
    case "tally":
      return describeTallyError(error.error)
    case "parlor":
      return describeOpeningProblem(error.error)
    case "history":
      return describeHistoryError(error.error)
    case "backup":
      return describeBackupProblem(error.problem)
    case "handover":
      return describeHandoverFailure(error.failure)
    case "archive":
      return ARCHIVE_UNWRITABLE
    case "forbidden":
      return error.capability === "rename" ? "帳簿の名前を変えられるのは、帳簿の持ち主だけです。" : "この帳簿を編集する権限がありません。"
    case "opening-balance-registered":
      return `${parlorNameText(seal.parlor(error.parlor))}（${error.tier}）の開始残高は登録済みです。残高を直すときは、一覧の「残高調整」を使ってください。`
    case "prize-exchange":
      return describePrizeExchangeProblem(error.problem)
    case "forfeiture":
      return describeForfeitureProblem(error.problem)
    case "rate-change":
      return "交換率は0より大きい数で入力してください。"
    case "import":
      return describeImportProblem(error.problem)
    case "tally-missing":
      return "この収支は帳簿にありません。"
    case "recount-refused":
      return `0Rの数え方を変えると、${error.refusal.index + 1}件目の読み取りでカウンタが ${error.refusal.expectedAtLeast} 回転より戻ります。記録済みのカウンタと合わないため、変えられません。`
    case "recorded-unmarked":
      return `収支は帳簿に記帳しました。ただ、この端末の稼働を記帳済みにできませんでした。もう一度記帳しないでください。${describeDraftError(error.error)}`
    case "tally-unreadable":
      return "この収支はフォームでは直せません（取り込んだ収支か、手で書き換えた仕訳です）。収支の詳細から削除して、追加し直してください。"
    case "filing-differs":
      return `${error.year}年の仕訳を年のファイルに移すと帳簿の読み方が変わるため、移していません。`
    case "settings-unreadable":
      return "この帳簿の settings.json が壊れていて読めないため、書き換えていません。バックアップから戻してください。"
    case "catalog":
      return describeCatalogError(error.error)
    case "directory":
      return describeDirectoryError(error.error)
    case "submissions":
      return `申請した店舗を端末に残せませんでした。${DEVICE_STORAGE_UNAVAILABLE}`
    case "pachinko-engine":
      return PachinkoWording.describeEngineFailure(error.failure)
    case "reasoner":
      return error.failure.type === "not-proved" ? "計算根拠を推論できませんでした。" : ENGINE_UNLOADED
    case "proof":
      return "推論エンジンの答えを読めませんでした。"
    case "pachislot-engine":
      return PachislotWording.describeEngineFailure(error.failure)
    case "pachislot-play":
      return PachislotWording.describePlayProblem(error.problem)
  }
}

export const describePlayLogError = (error: PlayLogError): string => {
  switch (error.type) {
    case "unreadable-line":
      return `稼働ログの${error.line}行目が読めません。`
    case "invalid-field":
      return `稼働ログの${error.line}行目の ${error.field} が正しくありません。`
    case "non-monotonic":
      return `稼働ログの${error.spins}回転目で、投資額が前より減っています。`
  }
}

export const describeReadingRefusal = (refusal: ReadingRefusal): string => {
  switch (refusal.type) {
    case "counter-went-back":
      return `カウンタが ${refusal.expectedAtLeast} 回転より戻っています。大当りの記録漏れかもしれません。`
    case "outlay-went-back":
      return `投資額は累計で入力してください（これまでで ¥${amountText(seal.play(refusal.atLeast))}）。`
    case "replay-went-back":
      return `貯玉・貯メダルの引出は累計で入力してください（これまでで ${amountText(seal.play(refusal.atLeast))}）。`
  }
}
