import { EARLIEST_RELEASE } from "@p-lens/contracts"

import type { CatalogError } from "../../catalog/port/catalog"
import type { IsoDate } from "../../core/calendar/calendar"
import type { DescriptionProblem } from "../../core/catalog/description"
import type { QuotaStanding, RegistrationKind } from "../../core/catalog/quota"
import type { ReleaseDateError } from "../../core/catalog/release"
import { NO_CONNECTION, NOT_TAKEN, SERVER_TROUBLE } from "./connection"
import { formatMoment } from "./dates"

const GAME_NAMES = { pachinko: "パチンコ", pachislot: "パチスロ" } as const

const MARK_NAMES = { adoption: "イチオシ", rejection: "非推奨", verification: "検証OK", refutation: "検証NG", favorite: "お気に入り" } as const

/** Why the shared catalog would not take what was sent, by what it said. */
const refusal = (reason: string): string => {
  switch (reason) {
    case "too-many-requests":
      return "短い間に送りすぎています。少し待ってからやり直してください。"
    case "human-check-failed":
      return "人による操作か確かめられませんでした。ページを読み込み直してやり直してください。"
    case "forbidden-origin":
      return "このページからは共有カタログに書き込めません。公式のアプリから登録してください。"
    case "invalid-body":
      return "入力に誤りがあるため、共有カタログが受け付けませんでした。機種名とリリース日を確かめてください。"
    case "basis-rejected":
      return "共有カタログの計算エンジンが、この解析値を受け付けませんでした。"
    case "figures-disagree-with-basis":
      return "数値が解析値から計算した値と合わないため、共有カタログが受け付けませんでした。"
    case "storage":
    case "unexpected":
      return SERVER_TROUBLE
    default:
      return NOT_TAKEN
  }
}

/** Said where the device has never got the catalog, for want of a connection. */
export const UNDELIVERED = `この端末は、機種と算出条件の一覧をまだ受け取れていません。${NO_CONNECTION}一度受け取れば、以後は電波がなくても使えます。`

/** Said where what was asked for is not in what the device has received, the last delivery having failed for want of a connection: true of a device that never received one and of one whose copy is only behind. */
const NOT_IN_DELIVERY = `この端末にある機種と算出条件の一覧には、まだ入っていません。最新の一覧を受け取れていないためです。${NO_CONNECTION}`

/** What stands over the machines' list where none has ever been delivered, for want of a connection. */
export const UNDELIVERED_TITLE = "機種の一覧をまだ受け取れていません"

/** Said quietly in an editor opened with no connection to the shared catalog: what is typed is kept, and sent once there is one. */
export const REGISTER_OFFLINE = "いまは共有カタログにつながりません。入力した内容はこの端末に残るので、電波のある所で登録を押してください。"

/** Said quietly in an editor opened with no connection to the shared catalog where what is typed is not kept: it lasts only while the screen is open. */
export const REGISTER_OFFLINE_UNKEPT = "いまは共有カタログにつながりません。入力した内容はこの画面を閉じると消えるので、電波のある所で入力して登録してください。"

/** Said quietly under a formula's or a 設定配分's marks while one put on here waits to be sent: nobody else counts it yet. */
export const MARKS_UNSENT = "イチオシ・非推奨・検証・お気に入りの印は、まだ送れていません。つながったときに送ります。"

/** What a registering button says while what it sends is on its way. */
export const REGISTRATION_SENDING = "送っています…"

/** Said where something registered got no answer in time: it may be in the catalog already, so the person looks before pressing again rather than sending it twice. */
const UNANSWERED = "応答が来ないまま時間切れになりました。登録できている場合があります。入力した内容はこの端末に残してあるので、電波のある所で少し待ってから機種を探し、出てこなければもう一度登録を押してください。"

export const describeCatalogError = (error: CatalogError): string => {
  switch (error.type) {
    case "unavailable":
    case "unreadable-answer":
      return NO_CONNECTION
    case "unanswered":
      return UNANSWERED
    case "undelivered":
      return NOT_IN_DELIVERY
    case "storage-unavailable":
      return "この端末の保存領域を使えませんでした。アプリを開き直してください。端末の空き容量が少ないときは、空けてからもう一度試してください。"
    case "too-heavy":
      return "共有カタログが混み合っていて、受け付けられませんでした。入力した内容はこの端末に残してあるので、少し時間をおいてもう一度登録を押してください。"
    case "gave-up":
      return "共有カタログが応答できず、検算できませんでした。検算していない値のままでは登録しません。少し時間をおいてから、もう一度登録を押してください。"
    case "unreadable-kept":
      return "この端末に保存された共有カタログのデータが壊れていて読めません。データの消去で端末のデータを消すと、また使えるようになります。"
    case "no-catalog":
      return "このアプリには共有カタログがありません。機種や算出条件は登録できません。"
    case "machine-missing":
      return "この機種はまだ端末に届いていません。登録したばかりなら、配信されるまで少し待ってください。"
    case "formula-missing":
      return "この算出条件はまだ端末に届いていません。登録したばかりなら、配信されるまで少し待ってください。"
    case "distribution-missing":
      return "この設定配分はまだ端末に届いていません。登録したばかりなら、配信されるまで少し待ってください。"
    case "other-game":
      return `この機種は${GAME_NAMES[error.gameKind]}の機種です。`
    case "model-name-taken":
      return `型式名「${error.modelName}」の機種はもう登録されています。その機種に算出条件を追加してください。`
    case "name-taken":
      return `「${error.name}」はもう登録されています。その機種に算出条件を追加してください。`
    case "not-verifiable":
      return "解析値から計算していない算出条件は、検証できません。"
    case "check-stands":
      return "検証は取り消せません。考えが変わったら、もう一方を押してください。"
    case "not-markable":
      return `設定配分には「${MARK_NAMES[error.mark]}」を付けられません。`
    case "quota-reached":
      return `${REGISTRATION_NAMES[error.kind]}は、${formatMoment(error.nextAt)} から送れます。入力した内容はこの端末に残してあるので、その時刻になったらもう一度登録を押してください。`
    case "refused":
      return refusal(error.reason)
  }
}

const REGISTRATION_NAMES = { machine: "機種の登録", addition: "算出条件の追加" } as const

/**
 * Where the device stands against a quota, said before anything is typed:
 * from when the next can be sent if not now, and how many more today.
 */
export const quotaStandingText = (kind: RegistrationKind, standing: QuotaStanding): string => {
  const left = `今日はあと${standing.remaining}件`
  return standing.nextAt === undefined
    ? `${REGISTRATION_NAMES[kind]}は、${left}送れます。`
    : `${REGISTRATION_NAMES[kind]}は、${formatMoment(standing.nextAt)} から送れます（${left}）。それまでに入力したものは、送れなくてもこの端末に残ります。`
}

/** What stands where a machine has no model name: a row never shows a blank. */
const NO_MODEL_NAME = "--"

/** A machine's model name as a row shows it. */
export const modelNameText = (modelName: string | undefined): string => modelName ?? NO_MODEL_NAME

/** A day as a row shows it, `2026/10/03`. */
export const slashDay = (date: IsoDate): string => date.replaceAll("-", "/")

/** What a new machine's description, as typed, is wrong with, beside its field. */
export const describeDescriptionProblem = (problem: DescriptionProblem): string => {
  switch (problem.type) {
    case "too-many-keywords":
      return `${problem.most}個までです。`
    case "keyword-too-long":
      return `1語は${problem.longest}文字までです。`
    case "not-a-hit-chance":
      return "1/319.7 の形で入れてください。"
  }
}

/** What a release date typed is wrong with, beside its field; nothing while none is typed. */
export const describeReleaseDateError = (error: ReleaseDateError): string | undefined => {
  switch (error.type) {
    case "missing":
      return undefined
    case "not-a-date":
      return "日付を入れてください。"
    case "too-early":
      return `${EARLIEST_RELEASE.slice(0, 4)}年より前の日付は入れられません。`
    case "too-far-ahead":
      return "1年より先の日付は入れられません。"
  }
}

/**
 * A formula's id as it is shown and passed on: the head of its UUIDv7,
 * which is the moment it was registered — so the id alone says when, and
 * no date is shown beside it. Two formulas of one machine do not share one
 * unless they were registered within about a minute of each other.
 */
export const formulaIdText = (id: string): string => id.slice(0, 8)
