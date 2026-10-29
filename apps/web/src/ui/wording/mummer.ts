import type { PlainLabelCleared } from "../../mummer"

/** What mumming is called on screen: 配信モード, a stream and a post alike. */
export const MUMMER_HEADING = "配信モード"

/** What stands in place of a part of a screen mumming withholds. */
export const WITHHELD = "配信モード中は表示しません"

/** What the settings say mumming does. */
export const MUMMER_EXPLAINED = "配信やスクリーンショットのために、店舗名・台番号・帳簿の金額・貯玉を伏せ字にします。いま遊技中の台の数字はそのまま表示します。同期中の別の端末で計測している稼働も、そのまま表示できます。この端末だけの設定です。"

/** What the setting says in a browser's tab, where the address bar may name a parlor: mumming veils the screen, never the address. Said for a computer and a phone alike, each by its own word for installing. */
export const MUMMER_ADDRESS_SHOWN = "ブラウザで開いているときは、アドレスバーに店舗名が出ることがあります。配信するときは、アプリとしてインストールしてから開いてください（スマホは「ホーム画面に追加」）。"

/** What leads from that to the site's page on installing, where the deployment has one. */
export const INSTALL_GUIDE = "詳しい操作方法は公式サイトで解説しています。"

/** What the setting says to do before a stream: a play's parlor is veiled in the list it is chosen from, and one chosen beforehand stays chosen for the day, in pachinko and pachislot alike. */
export const MUMMER_CHOOSE_FIRST = "配信の前に、稼働開始の画面で店を一度選んでおくと、その日はパチンコでもパチスロでもその店が選ばれた状態で始まります。配信中は店の一覧も伏せ字になります。"

/** The setting's own line. */
export const MUMMER_TURN = "配信モードにする"

/** What the mark in the top bar is read out as: it goes to where mumming is turned off. */
export const MUMMER_MARK = "配信モード中（設定を開く）"

/** What stands, faint, where the mark stood, once mumming has been turned off on a business day it was on: it names nothing of the person's, so a stream may show it. */
export const PLAIN_LABEL = "通常表示"

/** What the plain label is read out as: pressed, it turns mumming straight back on. */
export const PLAIN_LABEL_READ = "通常表示（押すと配信モードにします）"

/** The setting's button that takes the plain label away before the business day turns. */
export const PLAIN_LABEL_CLEAR = "通常表示ラベルを消す"

/** What the setting says of the plain label and the button beside it. */
export const PLAIN_LABEL_CLEAR_EXPLAINED = "左上の「通常表示」ラベルは営業日が変われば消えますが、このボタンですぐ消せます。"

/** What pressing that button came to: the label taken away, kept from coming when mumming is turned off, or none there to take. */
export const plainLabelClearedText = (cleared: PlainLabelCleared): string => {
  switch (cleared) {
    case "cleared":
      return "通常表示ラベルを消しました"
    case "kept-off":
      return "配信モードを切っても、この営業日は通常表示ラベルを出しません"
    case "not-shown":
      return "通常表示ラベルは出ていません"
  }
}
