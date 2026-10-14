import { isOffBookSavingsAccount } from "../journal/accounts"
import type { Entry } from "../journal/entry"
import { withEquityDeclared } from "./balance"

const declares = (accounts: string, account: string): boolean => accounts.split("\n").some((line) => line.startsWith(`account ${account}`))

/**
 * A book's accounts as an entry needs them: with each account of savings
 * the book does not keep that the entry posts to declared, once, and the
 * equity it stands under — a book whose plays at no parlor never drew on
 * savings has none — and as they were otherwise.
 */
export const withOffBookDeclaredFor = (accounts: string, entry: Entry): string =>
  entry.postings
    .map((posting) => posting.account)
    .filter(isOffBookSavingsAccount)
    .filter((account, index, all) => all.indexOf(account) === index)
    .reduce((declared, account) => (declares(declared, account) ? declared : `${withEquityDeclared(declared).replace(/\n*$/, "")}\naccount ${account}\n`), accounts)
