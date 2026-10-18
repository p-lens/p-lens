import type { SampleProblem } from "../../application/sample-book/make-sample-book"
import { describeTitleProblem } from "./book"
import { formatCount } from "./numbers"

export const SAMPLE_LABEL = "サンプル"

/** The rail's two lines for making a sample book. */
export const SAMPLE_LINES = ["サン", "プル"] as const

export const SAMPLE_HEADING = "サンプル帳簿を作る"

export const SAMPLE_ABOUT = "近くのホールで新台を打った3年分の収支を、この端末で作ります。"

export const MAKE = "作成"

export const STOP = "中止"

export const OPEN = "開く"

export const CLOSE = "閉じる"

export const REDRAW_LABEL = "絵柄を引き直す"

export const WAITING_LINE = "しばらくお待ちください…"

export const LOCATING_LINE = "現在地を確かめています…"

export const UNLOCATED_LINE = "位置情報が取れないため、全国からランダムにホールを選びます…"

export const placedLine = (prefecture: string | undefined, parlors: number): string => `${prefecture ?? "全国"}のホールを${formatCount(parlors)}軒選びました`

/** What is said while a sample book gets ready, between what it is really doing: nothing of it need be so. */
export const PASSING_LINES = [
  "行きつけのホールを決めています…",
  "交換率を確かめています…",
  "新台の入れ替え日を調べています…",
  "ボーダーを計算しています…",
  "設定配分を読んでいます…",
  "貯玉カードを作っています…",
  "朝の抽選に並んでいます…",
  "台のデータを見比べています…",
  "財布の中身を数えています…",
  "缶コーヒーを買っています…",
  "会員カードの残高を確かめています…",
  "閉店時間を調べています…",
] as const

export const gatheringText = (done: number, of: number): string => `機種を集めています… ${formatCount(done)}/${formatCount(of)}`

export const makingText = "日目を作成中…"

export const ofDaysText = (of: number): string => `/ ${formatCount(of)}日`

export const writingText = (done: number, of: number): string => `帳簿に書き込み中… ${formatCount(done + 1)}/${formatCount(of)}年`

export const madeText = (days: number, tallies: number): string => `${formatCount(days)}日・${formatCount(tallies)}件の収支を作成しました`

export const RESULT_LABEL = "収支"

export const THEORETICAL_LABEL = "期待値"

export const MADE_TOAST = "サンプル帳簿を作成しました"

export const STOPPED_TEXT = "中止しました。帳簿は作っていません。"

export const describeSampleProblem = (problem: SampleProblem): string => {
  switch (problem.type) {
    case "no-parlors":
      return "ホールの一覧が届いていないため、作れません。"
    case "no-machines":
      return "機種の一覧が届いていないため、作れません。"
    case "title":
      return describeTitleProblem(problem.problem)
    case "unreachable":
      return "作成を始められませんでした。ページを読み込み直してください。"
  }
}
