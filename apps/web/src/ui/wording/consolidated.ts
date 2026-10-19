/** The word, once, that the page before stopped while the consolidation read on several hledgers: what happened, what it likely means, and what to do about it. */
export const STOPPED_AT_WORK = {
  title: "前回、連結の計算中にアプリが止まった可能性があります",
  description:
    "帳簿の数が、この端末で一度に計算できる限界に近いのかもしれません。帳簿はこの端末に残っていますが、念のため、いまのうちにバックアップを取っておきましょう。今回は計算を一つずつ行うので、少し時間がかかります。",
  action: "バックアップを取る",
} as const
