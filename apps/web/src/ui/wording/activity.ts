import type { ActivityLine } from "../../core/activity/activity"
import { formatDay } from "./dates"
import { sourceName } from "./import"
import { formatCount, formatRate, formatTokens, formatYen } from "./numbers"
import { shownDescription } from "./tallies"
import { seal } from "../../mummer"
import { parlorNameText } from "./parlor"
import { titleText } from "./book"

/** A thing done whose word this app does not know, or whose parts are not the ones the word goes with: something was done, and that much is said. */
const SOMETHING_DONE = "帳簿を変更"

/** What a tally is called in a line of activity: what it was written under, or, written under nothing, that it names no machine. */
const tallyName = (description: string): string => ((shown) => (shown === "" ? "機種の指定なし" : `${shown} `))(shownDescription(description))

/**
 * What a line of activity says was done, as a person reads it. Each word
 * is said with the parts it speaks of; a word from a later version, or a
 * line missing a part its word needs, is still a thing done.
 */
export const describeActivity = (line: ActivityLine): string => {
  const { book, file, pool, parlors, play: tally, imported, filed, savings, prizes, rate } = line.parts
  const tokens = savings === undefined ? undefined : formatTokens(seal.savings(savings.tokens), savings.kind)
  switch (line.did) {
    case "book-created":
      return "帳簿を作成"
    case "book-renamed":
      return book === undefined ? SOMETHING_DONE : `帳簿の名前を「${titleText(book.title)}」に変更`
    case "parlors-linked":
      return parlors === undefined ? SOMETHING_DONE : `申請していた${parlors.names.join("、")}が店舗一覧に載ったので紐付け`
    case "file-edited":
      return file === undefined ? SOMETHING_DONE : `${file.path} を直接編集`
    case "savings-opened":
      return pool === undefined ? SOMETHING_DONE : `${parlorNameText(seal.parlor(pool.parlor))}の${pool.tier}の開始残高を${tokens === undefined ? "" : `${tokens}で`}登録`
    case "savings-adjusted":
      return pool === undefined ? SOMETHING_DONE : `${parlorNameText(seal.parlor(pool.parlor))}の${pool.tier}の残高を${tokens === undefined ? "" : `${tokens}に`}調整`
    case "savings-exchanged":
      return pool === undefined ? SOMETHING_DONE : `${parlorNameText(seal.parlor(pool.parlor))}の${pool.tier}を${tokens === undefined ? "" : tokens}交換払出${prizes === undefined ? "" : `（特殊景品額 ${formatYen(seal.savings(prizes.specialPrizes))}）`}`
    case "savings-forfeited":
      return pool === undefined ? SOMETHING_DONE : `${parlorNameText(seal.parlor(pool.parlor))}の${pool.tier}${tokens === undefined ? "" : `の${tokens}`}の失効を記録`
    case "pool-opened":
      return pool === undefined ? SOMETHING_DONE : `${parlorNameText(seal.parlor(pool.parlor))}の${pool.tier}を帳簿に用意${rate === undefined ? "" : `（交換率 ${formatRate(rate.rate)}円）`}`
    case "rate-changed":
      return pool === undefined ? SOMETHING_DONE : `${parlorNameText(seal.parlor(pool.parlor))}の${pool.tier}の交換率を${rate === undefined ? "" : `${formatRate(rate.rate)}円に`}変更${rate === undefined ? "" : `（${formatDay(rate.date)}から）`}`
    case "conflict-settled":
      return "ほかの端末と食い違った箇所を選び直し"
    case "play-recorded":
      return tally === undefined ? SOMETHING_DONE : `${tallyName(tally.description)}の収支を追加`
    case "play-revised":
      return tally === undefined ? SOMETHING_DONE : `${tallyName(tally.description)}の収支を修正`
    case "plays-imported":
      return imported === undefined ? SOMETHING_DONE : `${sourceName(imported.from)}から${formatCount(imported.count)}件の収支を取り込み`
    case "imported-weighed":
      return imported === undefined ? SOMETHING_DONE : `${sourceName(imported.from)}から取り込んだ${formatCount(imported.count)}件の収支に推定期待値を追加`
    case "play-removed":
      return tally === undefined ? SOMETHING_DONE : `${tallyName(tally.description)}の収支を削除`
    case "year-filed":
      return filed === undefined ? SOMETHING_DONE : `${String(filed.year)}年の仕訳${formatCount(filed.count)}件を年のファイルに移し替え`
    default:
      return SOMETHING_DONE
  }
}
