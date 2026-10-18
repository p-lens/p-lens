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

/**
 * What is said while a sample book gets ready, between what it is really
 * doing: nothing of it need be so. A player's day as one who keeps an eye
 * on the figures spends it — getting there, reading the machines, counting,
 * a second look, a breath — said as plainly as a polite word would.
 */
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
  "開店時間を確かめています…",
  "ホールのお知らせを読んでいます…",
  "新台の導入台数を数えています…",
  "島の並びを思い浮かべています…",
  "入場の順番を待っています…",
  "千円札を揃えています…",
  "再プレーの上限を確かめています…",
  "貯玉の残高を確かめています…",
  "前日のデータを読み返しています…",
  "釘の角度を眺めています…",
  "ヘソまわりの釘を確かめています…",
  "寄り釘の向きを見ています…",
  "風車の向きを見ています…",
  "ステージの癖を見ています…",
  "ワープの入り具合を見ています…",
  "千円あたりの回転数を数えています…",
  "持ち玉比率を計算しています…",
  "交換率からボーダーを引いています…",
  "保留の数を数えています…",
  "右打ちの準備をしています…",
  "電サポ中の玉の減りを見ています…",
  "ラウンド中の出玉を数えています…",
  "大当り履歴をさかのぼっています…",
  "データカウンターを見比べています…",
  "スランプグラフを眺めています…",
  "遊タイムまでの回転数を数えています…",
  "時短の残りを数えています…",
  "甘デジの島を見て回っています…",
  "各台計数の数字を確かめています…",
  "ぶどうの回数を数えています…",
  "チェリーの回数を数えています…",
  "BIGとREGの比率を見ています…",
  "合算確率を計算しています…",
  "設定判別の材料を集めています…",
  "据え置きかどうかを見ています…",
  "朝一のリセットを確かめています…",
  "前日の最終ゲーム数を確かめています…",
  "天井までのゲーム数を数えています…",
  "ゾーンを確かめています…",
  "有利区間の残りを数えています…",
  "差枚数を計算しています…",
  "機械割を計算しています…",
  "目押しの間合いを整えています…",
  "リールの停止音に耳を澄ませています…",
  "メダルを補給しています…",
  "メダルを計数しています…",
  "サイドランプの色を見ています…",
  "終了画面を確かめています…",
  "設定示唆のボイスを聞いています…",
  "見切りどきを考えています…",
  "もう一度数え直しています…",
  "計算をやり直しています…",
  "メモを書き直しています…",
  "台番号を見間違えていました…",
  "財布を取りに戻っています…",
  "別の島ものぞいています…",
  "さっきの台をもう一度見ています…",
  "電卓の打ち間違いを直しています…",
  "ボーダーを引き直しています…",
  "深呼吸しています…",
  "お茶を一口飲んでいます…",
  "ひと伸びしています…",
  "目薬をさしています…",
  "手を洗っています…",
  "肩を回しています…",
  "甘いものを少しつまんでいます…",
  "窓の外を眺めています…",
  "電卓を高速で叩いています…",
  "3年分の手帳をめくっています…",
  "1日ずつ数え直しています…",
  "収支を帳簿に控えています…",
  "期待値をメモしています…",
  "稼働時間を記録しています…",
  "貯玉の通帳を確かめています…",
] as const

/** What is said, one after another, while the days are about to be played: the long wait before the first. */
export const STARTING_LINES = ["3年分のカレンダーをめくっています…", "サイコロを3年分振る準備をしています…", "まもなく開店です…"] as const

/**
 * What is said, by turns, while a sample book's years are written and
 * hledger checks each: a computer at work, mostly, and now and then
 * something else entirely.
 */
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
  "仕訳を1行ずつ読んでいます…",
  "桁をそろえています…",
  "小数点の位置を確かめています…",
  "日付の順に並べています…",
  "勘定科目を確かめています…",
  "店の名前を照らし合わせています…",
  "玉の単位をそろえています…",
  "メダルの単位をそろえています…",
  "交換率を当てはめています…",
  "期待値を書き込んでいます…",
  "稼働時間を秒に直しています…",
  "1年分を束ねています…",
  "ファイルを開いています…",
  "ファイルを閉じています…",
  "メモリを片付けています…",
  "キャッシュを温めています…",
  "ハッシュ値を計算しています…",
  "Haskell が考えごとをしています…",
  "WebAssembly がうなっています…",
  "CPU のファンが回っています…",
  "ビットを並べ替えています…",
  "0と1を数えています…",
  "括弧の数を数えています…",
  "改行を数えています…",
  "検算の検算をしています…",
  "帳尻を合わせています…",
  "指さし確認しています…",
  "ページをめくっています…",
  "しおりを挟んでいます…",
  "付箋を貼っています…",
  "ホチキスで留めています…",
  "クリップでまとめています…",
  "判子を押しています…",
  "書類を整えています…",
  "棚に並べています…",
  "引き出しを開けています…",
  "鉛筆を削っています…",
  "消しゴムをかけています…",
  "定規で線を引いています…",
  "電卓の電池を替えています…",
  "保存しています…",
  "念のためもう一度確かめています…",
  "データベースに話しかけています…",
  "ワーカーに仕事を頼んでいます…",
  "ワーカーが返事をしています…",
  "処理の順番を待っています…",
  "砂時計をひっくり返しています…",
  "進み具合を測っています…",
  "コンピュータが本気を出しています…",
  "コンピュータがひと息ついています…",
  "おサルと遊んでいます…",
  "お花に水をあげています…",
  "猫をなでています…",
  "金魚にえさをあげています…",
  "ハムスターが回し車を回しています…",
  "観葉植物の向きを変えています…",
  "ペンギンが行進しています…",
  "お茶を淹れています…",
  "おにぎりを握っています…",
  "折り紙で鶴を折っています…",
  "窓を開けて換気しています…",
  "月を眺めています…",
  "星を数えています…",
  "小鳥にあいさつしています…",
  "カメがゆっくり歩いています…",
  "雲の形を眺めています…",
  "てるてる坊主をつるしています…",
  "風鈴が鳴っています…",
  "けん玉をしています…",
  "コマを回しています…",
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
