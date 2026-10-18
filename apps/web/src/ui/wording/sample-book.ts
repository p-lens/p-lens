import type { SampleProblem } from "../../application/sample-book/make-sample-book"
import { describeTitleProblem } from "./book"
import { formatCount } from "./numbers"

export const SAMPLE_LABEL = "サンプル"

/** The rail's two lines for making a sample book. */
export const SAMPLE_LINES = ["サン", "プル"] as const

export const SAMPLE_HEADING = "サンプル帳簿を作る"

export const SAMPLE_ABOUT = "近くのホールで新台を打った3年分の収支を、この端末で作ります。"

/** How a sample book's plays are made, as a person is told before making one: honestly, that they are made up and made to win. */
export const SAMPLE_TERMS = [
  "その日に出ている新しい機種を中心に打ちます",
  "10時から18〜21時まで、1日8〜11時間打ちます",
  "パチンコはボーダーの6〜28%上の台です",
  "パチスロは設定4〜6の台です",
  "貯玉を使い、ときどき交換払出します",
  "抽選で作った架空の収支で、実際より勝ちやすい条件です",
] as const

export const MAKE = "作成"

export const STOP = "中止"

export const OPEN = "開く"

export const CLOSE = "閉じる"

export const REDRAW_LABEL = "絵柄を引き直す"

export const WAITING_LINE = "しばらくお待ちください…"

/** What is said, one after another, while the device finds where it is and the parlors near it are read: a wait a phone can make long. */
export const LOCATING_LINES = ["現在地を確かめています…", "地図を広げています…", "通いやすいホールを探しています…"] as const

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
  "駐車場の空きを探しています…",
  "傘立てに傘を置いています…",
  "おしぼりを受け取っています…",
  "整理券の番号を確かめています…",
  "景品カウンターの場所を覚えています…",
  "データランプの見方を覚えています…",
  "新台の初打ちに備えています…",
  "ハンドルの握り心地を確かめています…",
  "レバーの重さを確かめています…",
  "目押しの練習をしています…",
  "リールの絵柄を覚えています…",
  "上皿を拭いています…",
  "ホールのBGMに耳を傾けています…",
  "休憩所でひと息ついています…",
  "台移動の合図を覚えています…",
  "イベント日のカレンダーを調べています…",
  "電卓を用意しています…",
  "帳簿の紙を揃えています…",
] as const

/** What is said, one after another, while the days are about to be played: the long wait before the first. */
export const STARTING_LINES = ["3年分のカレンダーをめくっています…", "サイコロを3年分振る準備をしています…", "まもなく開店です…"] as const

/** What is said, by turns, while a sample book's years are written and hledger checks each. */
export const WRITING_LINES = [
  "hledger が電卓を叩いています…",
  "足し算と引き算を確かめています…",
  "1円でも合わない数字がないか見ています…",
  "現金が増えていないか見張っています…",
  "貯玉を数え直しています…",
  "端玉景品を数えています…",
  "交換率の表をめくっています…",
  "仕訳を清書しています…",
  "そろばんを弾いています…",
  "インクが乾くのを待っています…",
] as const

export const gatheringText = (done: number, of: number): string => `機種を集めています… ${formatCount(done)}/${formatCount(of)}`

export const makingText = "日目を作成中…"

export const ofDaysText = (of: number): string => `/ ${formatCount(of)}日`

export const writingText = (done: number, of: number): string => `帳簿に書き込み中… ${formatCount(done + 1)}/${formatCount(of)}年`

export const madeText = (days: number, tallies: number): string => `${formatCount(days)}日・${formatCount(tallies)}件の収支を作成しました`

export const RESULT_LABEL = "収支"

export const THEORETICAL_LABEL = "期待値"

export const MADE_TOAST = "サンプル帳簿を作成しました"

export const STOPPING_TEXT = "中止しています…"

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
