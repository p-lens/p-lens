import type { BookId, MemberId } from "../../core/book/book"
import { BOOK_FILES } from "../../core/journal/layout"
import { withTitle } from "../../core/journal/title"
import type { StoredBook } from "../../storage/port/book-storage"

/**
 * What every book opens with, for whoever opens the file without the app —
 * a person, or a program handed the files and nothing else: what it is,
 * what made it and where that is kept, hledger, which reads it and whose
 * work the app stands on, what each file holds, and where the whole layout
 * is described. Then the book's title, and the files it is made of.
 */
const MAIN = `; A P-Lens book: pachinko and pachislot play, kept as a plain-text hledger journal.
; Made with P-Lens, open source at https://github.com/p-lens/p-lens
; Read and checked by hledger, with thanks: https://github.com/simonmichael/hledger
;
; What is where:
;   accounts.journal      commodities and accounts; a parlor is the savings accounts tagged parlor-id
;   prices.journal        P directives: what a parlor's tokens exchange for, by day
;   transactions/2026.journal  one entry per play, tagged play-id, game-kind and machine: a file a year, by the entry's date
;   transactions.journal  entries not filed by year, as a hand or an app from before the years wrote them
;   pachinko-play/        a pachinko play's readings as JSON Lines, in a file named by its play-id
;   pachislot-play/       a pachislot play's, the same
;   logs/activity.jsonl   what was done to the book, as JSON Lines: who, when and what, a line a change
; Each parlor-id, with the parlor's name, is the one the open parlor list gives: https://github.com/p-lens/p-lens-parlors
; (app.p-lens.jp reads that list as it is published at https://parlors.p-lens.jp). Machines are named as P-Lens's catalog names them.
; The layout, the accounts and every tag are described in ARCHITECTURE.md in the P-Lens repository.
;
; Point hledger at this file: hledger -f main.journal bal, or for a year: hledger -f main.journal bal date:2026
; A year's file alone has none of the declarations, so it is read through this one. Nothing closes a year: the
; years are only where entries are kept, and the book is all of them, one after another.
; book-title-p:

include accounts.journal
include prices.journal
include transactions.journal
`

/** The accounts every book starts with: a parlor's savings are declared when a play first opens its pool. */
const ACCOUNTS = `commodity 1. JPY
commodity 1. 秒

account 資産                           ; type: A
account 資産:現金                      ; type: C
account 収益                           ; type: R
account 収益:遊技
account 費用                           ; type: X
account 費用:遊技
account 費用:貸玉差額
account 費用:貸メダル差額
account 費用:再プレイ手数料
account 純資産                         ; type: E
account 純資産:開始残高
account 純資産:残高調整
account 純資産:特殊景品
account 純資産:端玉景品
account 純資産:換算調整勘定
account 統計:期待値
account 統計:時間
`

/**
 * The book a first visit opens onto: its owner's own, with nothing in it
 * yet but the accounts every book has, under the title it is given until
 * they name it. Its id is made afresh on each device, so two people's first
 * books are never taken for one book.
 */
export const firstBook = (id: BookId, owner: MemberId, title: string): StoredBook => ({
  book: { id, members: [{ id: owner, displayName: "自分", role: "owner" }] },
  files: {
    [BOOK_FILES.main]: withTitle(MAIN, title),
    [BOOK_FILES.accounts]: ACCOUNTS,
    [BOOK_FILES.prices]: "",
    [BOOK_FILES.transactions]: "",
  },
})
