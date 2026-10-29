import type { FirstTouchNote, Tokens } from "../core/notes"

/** What the feature is called on screen, and the settings' line that opens it. */
export const FIRST_TOUCH_TITLE = "操作の手引き"

export const FIRST_TOUCH_RESET = "操作の手引きを初期化する"

/** What closes a note. */
export const UNDERSTOOD = "OK"

const token = (tokens: Tokens | undefined, balls: string, medals: string, either: string): string => (tokens === "balls" ? balls : tokens === "medals" ? medals : either)

/** What each note says: a line, two where it cannot be helped, worded for the tokens of what was touched. */
export const noteText = (note: FirstTouchNote, tokens: Tokens | undefined): string => {
  switch (note) {
    case "rented-total":
      return "打ち始めてから借りた合計の金額です。右のボタンで足せます"
    case "cash-total":
      return "打ち始めてから使った現金の合計です"
    case "drawn-total":
      return `打ち始めてから${token(tokens, "貯玉", "貯メダル", "貯玉・貯メダル")}から出した合計です`
    case "press-amount":
      return "押すたびに1回分を足します。長押しで1回の量を変えられます"
    case "held-in-hand":
      return token(tokens, "手元に残っている玉数です。これを引いた分が、打った玉になります", "手元にあるメダル数です。借りた分と貯メダルを引いて、差枚を出します", "手元に残っている数です。これを引いた分が、打った数になります")
    case "counter-spins":
      return "データカウンターの回転数を、そのまま入れます"
    case "counter-games":
      return "データカウンターの累計ゲーム数を、そのまま入れます"
    case "bonus-chosen":
      return "当たったら選んで記録します。回転数と持ち玉は当たった時点の数で"
    case "reading-row":
      return "押すと直せます。長押しでなぞると、まとめられます"
    case "seat-spins":
      return "座ったときのデータカウンターの回転数です"
    case "seat-jackpots":
      return "座ったときのデータカウンターの、その日の大当り回数です"
    case "rental-rate":
      return token(tokens, "1,000円で借りられる玉数です。4円パチンコなら250", "1,000円で借りられるメダル数です。20円スロットなら50", "1,000円で借りられる数です。4円パチンコなら250")
    case "exchange-rate":
      return token(tokens, "100円の景品に替えるのに要る玉数です。28個交換なら28", "100円の景品に替えるのに要るメダル数です。5.6枚交換なら5.6", "100円の景品に替えるのに要る数です。28個交換なら28")
    case "left-to-savings":
      return `残った${token(tokens, "玉", "メダル", "玉")}はこの店の${token(tokens, "貯玉", "貯メダル", "貯玉")}に入ります。交換したら${token(tokens, "貯玉", "貯メダル", "貯玉")}の画面で交換払出を`
    case "drawn-from-savings":
      return `この店の${token(tokens, "貯玉", "貯メダル", "貯玉")}から引かれます`
    case "box-count":
      return "箱の数から玉数を出せます。1箱の数は店ごとに覚えます"
    case "takings":
      return "景品に替えて持ち帰った額です。貯玉の残高は動きません"
    case "theoretical-typed":
      return "わかれば入れます。条件を入れると推定もできます"
    case "paid-out":
      return `景品に替えるため${token(tokens, "貯玉", "貯メダル", "貯玉")}から出した数です`
    case "special-prizes":
      return "受け取った特殊景品の合計額です。端玉の景品は入れません"
    case "actual-balance":
      return "店で確かめた今の残高です。帳簿との差を直します"
  }
}

/** What the settings' screen says of the notes, a line a paragraph, before asking whether to show them again. */
export const RESET_LINES = [
  "操作の手引きは、はじめて触った欄やボタンのそばに黄色い吹き出しで出る、ひとことの説明です。",
  "貸玉や投資のように、打ち始めてからの合計を入れる欄や、長押しで使えるボタンなど、見ただけではわかりにくいところに出ます。",
  "一度出た手引きは、ほかの画面でも二度と出ません。初期化すると、この端末で見た手引きをすべて忘れて、触ったときにまた出るようになります。",
  "帳簿や記録は変わりません。",
] as const

export const RESET_ASK = "操作の手引きを初期化しますか？"

export const RESET_DO = "初期化する"

export const RESET_CANCEL = "やめる"

export const RESET_DONE = "初期化しました。触ったことのない欄で、また手引きが出ます。"
