import type { TitleProblem } from "../../core/journal/title"
import type { ListedBook } from "../../core/book/book"
import { seal, veil } from "../../mummer"
import { initialedText } from "./initialed"

/** A book's name as a screen shows it, one's own or one plays are sent to: `🌱•••` while mumming. */
export const titleText = (title: string): string => initialedText(seal.book(title))

/** A member's name as a screen shows it, the name they send plays under or were let in by: `田•••` while mumming. */
export const memberNameText = (name: string): string => initialedText(seal.member(name))

const MASKED = "masked"

/** Whether a field a book's name is typed into shows each character as a dot, as a password's are without being one: while names are veiled. */
export const titleFieldMasked = (): boolean => veil.text(seal.book(""), () => "", MASKED) === MASKED

/** A book's name on screen: the title its journal gives, or a plain stand-in when it gives none. */
export const bookTitle = (book: Pick<ListedBook, "title">): string => titleText(book.title ?? "名前のない帳簿")

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
