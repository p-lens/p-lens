import type { ActivityLine } from "../../core/activity/activity"
import { sourceName } from "./import"
import { formatCount } from "./numbers"

/** A thing done whose word this app does not know, or whose parts are not the ones the word goes with: something was done, and that much is said. */
const SOMETHING_DONE = "帳簿を変更"

/** What a play is called in a line of activity: what it was written under, or, written under nothing, that it names no machine. */
const playName = (description: string): string => (description.trim() === "" ? "機種の指定なし" : `${description} `)

/**
 * What a line of activity says was done, as a person reads it. Each word
 * is said with the parts it speaks of; a word from a later version, or a
 * line missing a part its word needs, is still a thing done.
 */
export const describeActivity = (line: ActivityLine): string => {
  const { book, file, pool, parlors, play, imported } = line.parts
  switch (line.did) {
    case "book-created":
      return "帳簿を作成"
    case "book-renamed":
      return book === undefined ? SOMETHING_DONE : `帳簿の名前を「${book.title}」に変更`
    case "parlors-linked":
      return parlors === undefined ? SOMETHING_DONE : `申請していた${parlors.names.join("、")}が店舗一覧に載ったので紐付け`
    case "file-edited":
      return file === undefined ? SOMETHING_DONE : `${file.path} を直接編集`
    case "savings-opened":
      return pool === undefined ? SOMETHING_DONE : `${pool.parlor}の${pool.tier}の開始残高を登録`
    case "savings-adjusted":
      return pool === undefined ? SOMETHING_DONE : `${pool.parlor}の${pool.tier}の残高を調整`
    case "savings-exchanged":
      return pool === undefined ? SOMETHING_DONE : `${pool.parlor}の${pool.tier}を交換払出`
    case "pool-opened":
      return pool === undefined ? SOMETHING_DONE : `${pool.parlor}の${pool.tier}を帳簿に用意`
    case "conflict-settled":
      return "ほかの端末と食い違った箇所を選び直し"
    case "play-recorded":
      return play === undefined ? SOMETHING_DONE : `${playName(play.description)}の稼働を追加`
    case "play-revised":
      return play === undefined ? SOMETHING_DONE : `${playName(play.description)}の稼働を修正`
    case "plays-imported":
      return imported === undefined ? SOMETHING_DONE : `${sourceName(imported.from)}から${formatCount(imported.count)}件の稼働を取り込み`
    case "play-removed":
      return play === undefined ? SOMETHING_DONE : `${playName(play.description)}の稼働を削除`
    default:
      return SOMETHING_DONE
  }
}
