import type { TitleProblem } from "../../core/journal/title"
import type { ListedBook } from "../../core/book/book"

/** A book's name on screen: the title its journal gives, or a plain stand-in when it gives none. */
export const bookTitle = (book: Pick<ListedBook, "title">): string => book.title ?? "名前のない帳簿"

/** What is wrong with a title typed for a book. */
export const describeTitleProblem = (problem: TitleProblem): string => {
  switch (problem.type) {
    case "empty":
      return "帳簿の名前を入れてください。"
    case "too-long":
      return `帳簿の名前は${problem.longest}文字までです。`
    case "unwritable":
      return "帳簿の名前に改行は使えません。"
  }
}
