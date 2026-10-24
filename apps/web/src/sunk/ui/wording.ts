import type { Problem } from "../core/counter"
import type { Rarity } from "../core/reading"
import type { Step } from "../core/theatre"
import { formatCount, formatMan } from "../../ui/wording/numbers"

/** What ハマり台の投資額 says, kept with it: nothing of it is anywhere else. */
export const SUNK_TITLE = "ハマり台の投資額"

/** The button on a formula's card that opens it: short, beside 「これを使う」. */
export const SUNK_BUTTON = "ハマり台計算"

export const SUNK_LEAD = "データカウンターの数字から、その台に今日入った現金をシミュレーションで推定します。"

export const SUNK_LABELS = {
  spins: "総回転数",
  jackpots: "大当り回数",
  sinceLast: "最終大当り後",
  spinPerformance: "回転率",
} as const

export const SUNK_SUFFIXES = { spins: "回転", jackpots: "回", sinceLast: "回転", spinPerformance: "回/千円" } as const

export const SINCE_LAST_PLACEHOLDER = "見てない"

/** What a typed figure is not, said under its field. */
export const describeProblem = (problem: Problem): string => {
  switch (problem.type) {
    case "spins":
      return "1〜30,000回転"
    case "jackpots":
      return "0〜300回"
    case "since-last":
      return "0以上の整数"
    case "since-past-spins":
      return "総回転数まで"
    case "since-not-spins":
      return "当たっていないはずです"
    case "spin-performance":
      return "0より大きく100まで"
  }
}

export const borderText = (border: number): string => `ボーダー ${border.toFixed(1)}回`

/** How seldom what the counter shows comes, said as the run can say it. */
export const rarityText = (rarity: Rarity): string => {
  const times = formatMan(Math.max(1, Math.round(rarity.oneIn)))
  switch (rarity.type) {
    case "dry":
      return `${formatCount(rarity.spins)}回転ハマるのは ${times}回に1回`
    case "day":
      return `こんな台は ${times}台に1台`
  }
}

export const SPREAD_LABELS = { half: "半分の台は", most: "8割の台は", both: "半分の台も8割の台も" } as const

export const ROUGH = "カウンターと合った台がまだ少ないので、ざっくりです。"

export const SEARCHING = "カウンターと合う台を探しています。"

export const unmatchedText = (played: number): string => `${formatMan(played)}台打って、カウンターと合う台は1台もありませんでした。この機種でこの数字はまず出ません。`

export const playedText = (trials: number, matched: number): string => `${formatMan(trials)}台打って、カウンターと合ったのは${formatCount(matched)}台。`

export const TERMS_NOTE = "4円パチンコで1,000円250玉、500円ずつ借りて、出た玉はそのまま打ち込むとして数えています。"

export const progressText = (done: number): string => `${formatMan(done)}台目`

/**
 * What a run is said to be doing while it truly runs, each in turn, small,
 * beside its count: what the engine does, said plainly.
 */
export const WORKING_WORDS = [
  "台を回しています",
  "ヘソに玉を入れています",
  "貸し玉ボタンを押しています",
  "上皿の玉を打ち出しています",
  "大当りを数えています",
  "ラウンド数を数えています",
  "アタッカーに玉を入れています",
  "出玉を上皿に戻しています",
  "連チャンを最後まで見届けています",
  "確変中の台を見守っています",
  "時短の残りを数えています",
  "電サポ中の玉を打ち出しています",
  "通常に戻ったので回し続けています",
  "次の当りを待っています",
  "大当り回数をカウンターと見比べています",
  "最終大当り後の回転数をカウンターと見比べています",
  "カウンターと合った台を並べています",
  "カウンターと合わなかった台を片付けています",
  "合った台の投資を数えています",
  "合った台の投資を小さい順に並べています",
  "真ん中の台を探しています",
  "半分の台がおさまる幅を測っています",
  "8割の台がおさまる幅を測っています",
  "次の台に移っています",
  "新しい台を開けています",
  "回転数を総回転数まで進めています",
  "出玉で回せるところまで回しています",
  "持ち玉が尽きたので貸し玉ボタンを押しています",
  "500円ずつ借りています",
  "初当りの振り分けを引いています",
  "ラウンドの振り分けを引いています",
  "継続するか引いています",
] as const

/**
 * What a run that ended in a blink is said to be doing while it waits out
 * the rest: plainly anything but working, said in the same place, at the
 * same pace, so that it looks busy to one who only looks, and one who
 * reads it sees at once that it is slacking.
 */
export const STALLING_WORDS = [
  "おサルと遊んでいます",
  "お絵描きしています",
  "ジュースを買っています",
  "サボっているのがバレていないか様子を伺っています",
  "おやつを食べています",
  "おやつのおかわりを探しています",
  "お昼寝しています",
  "お昼寝から起きたふりをしています",
  "あやとりしています",
  "折り紙で鶴を折っています",
  "鶴が千羽になるまで折ろうか迷っています",
  "しりとりしています",
  "しりとりで「ん」がついたのでやり直しています",
  "鼻歌を歌っています",
  "口笛の練習をしています",
  "爪を切っています",
  "窓の外の雲を数えています",
  "雲がおサルに見えてきました",
  "おサルに名前をつけています",
  "おサルとおやつを分けています",
  "お絵描きしたおサルに色を塗っています",
  "はみ出したのでもう一枚描いています",
  "ジュースのおかわりを買っています",
  "ジュースのストローを曲げています",
  "自販機の当たりを待っています",
  "自販機の当たりは出ませんでした",
  "休憩所のソファでくつろいでいます",
  "テレビの天気予報を見ています",
  "明日の天気が気になってきました",
  "スマホでネコの動画を見ています",
  "ネコの動画が止まりません",
  "占いを読んでいます",
  "今日のラッキーカラーは赤だそうです",
  "ホールをウロウロしています",
  "トイレに行ってきます",
  "手を洗っています",
  "ハンカチを忘れたのでブンブン振っています",
  "ちょっと一服しています",
  "伸びをしています",
  "肩を回しています",
  "あくびをしています",
  "あくびがうつりました",
  "ぼーっとしています",
  "ぼーっとしているのがバレていないか様子を伺っています",
  "後ろを振り返っています",
  "誰も見ていないようです",
  "もう少しだけサボります",
  "そろそろ戻ったほうがいい気がしています",
  "戻るふりをしています",
  "忙しそうな顔の練習をしています",
  "忙しそうな顔ができました",
  "何事もなかったように席に戻っています",
  "計算が終わったのを見なかったことにしています",
  "答えが出たのに気づかないふりをしています",
  "答えを裏返して伏せています",
  "答えの上に紙をかぶせています",
  "答えから目をそらしています",
  "まだ終わっていないことにしています",
  "終わったことは内緒にしています",
  "早く終わりすぎると怪しまれるので待っています",
  "早く終わりすぎたので時間をつぶしています",
  "答えをもう少し寝かせています",
  "答えを熟成させています",
  "頑張ったふりをしています",
  "額の汗をふくふりをしています",
  "終わったと言うタイミングをはかっています",
  "どう言い訳をするか歩きながら考えています",
  "ジュースを買いながら言い訳を考えています",
  "飲む手が震えるコーヒーを飲みながらオロオロしています",
  "おサルに言い訳を聞いてもらっています",
  "言い訳を紙に書いて丸めています",
  "丸めた紙がゴミ箱に入りませんでした",
  "言い訳を鏡の前で練習しています",
  "言い訳がまとまらないのでおやつを食べています",
  "手に汗をにぎりながら時計を見ています",
  "足音が聞こえたので忙しいふりをしています",
  "なんとなく電卓をたたいて音だけ出しています",
] as const

/** One step of working out a dry day, said as it is done: far finer than it needs. */
export const stepText = (step: Step): string => {
  switch (step.type) {
    case "look":
      return "データカウンターを見ています"
    case "digit":
      return `総回転数の${formatCount(step.place)}桁目を読んでいます（${step.digit}）`
    case "jackpots":
      return "大当り回数を読んでいます（0）"
    case "jackpots-pointed":
      return "大当り回数が0であることを、指差しで確認しています"
    case "spin-performance":
      return `回転率を読んでいます（${String(step.spinPerformance)}）`
    case "decimal-point-sought":
      return "回転率の小数点を探しています"
    case "decimal-point":
      return step.at === undefined ? "小数点はありませんでした" : `小数点を見つけました（${formatCount(step.at)}文字目）`
    case "numerator":
      return `割り算の分子を記入しています（${formatCount(step.spins)}）`
    case "denominator":
      return `割り算の分母を記入しています（${String(step.spinPerformance)}）`
    case "not-zero":
      return step.again ? "分母が0でないことを、もう一度確認しています" : "分母が0でないことを確認しています"
    case "divided":
      return `割り算しています（${step.thousands.toFixed(2)}）`
    case "jackpots-added":
      return "大当りの出玉を足しています（0回分）"
    case "zero-added":
      return "0を足しても変わらないことを確認しています"
    case "pressed":
      return `貸し玉ボタンを押しています（${formatCount(step.times)}回目）`
    case "outlay-done":
      return "投資の計算ができました"
    case "rarity-begun":
      return "このハマりの珍しさを調べます"
    case "miss-chance":
      return `外れの確率を記入しています（${(step.oneIn - 1).toFixed(1)}/${step.oneIn.toFixed(1)}）`
    case "multiplied":
      return `${formatCount(step.spins)}回連続で外れる確率を出しています`
  }
}
